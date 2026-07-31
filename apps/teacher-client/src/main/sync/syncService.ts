import type {
  ConnectionState,
  DashboardResponse,
  SessionView,
} from '../../shared/contracts.js';
import { ClientError } from '../network/apiClient.js';
import type {
  CacheIdentity,
  OfflineCacheSnapshot,
} from '../storage/cacheRepository.js';

export type ConnectionEvent =
  | { type: 'LIVE_SYNCED'; lastSyncAt: string }
  | { type: 'NETWORK_FAILED' }
  | { type: 'RECONNECT_STARTED' }
  | {
      type: 'SECURITY_BLOCKED';
      code: 'CERTIFICATE_MISMATCH' | 'SERVER_IDENTITY_INVALID';
    }
  | { type: 'POLICY_VALIDATED'; lastSyncAt: string | null };

function lastSyncFrom(state: ConnectionState): string | null {
  return state.kind === 'security-blocked' ? null : state.lastSyncAt;
}

export function reduceConnection(
  current: ConnectionState,
  event: ConnectionEvent,
): ConnectionState {
  if (
    current.kind === 'security-blocked' &&
    event.type !== 'POLICY_VALIDATED' &&
    event.type !== 'SECURITY_BLOCKED'
  ) {
    return current;
  }

  switch (event.type) {
    case 'LIVE_SYNCED':
      return { kind: 'online', lastSyncAt: event.lastSyncAt };
    case 'NETWORK_FAILED':
      return {
        kind: 'offline-readonly',
        lastSyncAt: lastSyncFrom(current),
      };
    case 'RECONNECT_STARTED':
      return {
        kind: 'reconnecting',
        lastSyncAt: lastSyncFrom(current),
      };
    case 'SECURITY_BLOCKED':
      return { kind: 'security-blocked', code: event.code };
    case 'POLICY_VALIDATED':
      return {
        kind: 'offline-readonly',
        lastSyncAt: event.lastSyncAt,
      };
  }
}

const RECONNECT_DELAYS_MS = [5_000, 15_000, 30_000, 60_000] as const;

export function reconnectDelayMs(attempt: number): number {
  const normalizedAttempt = Math.max(0, Math.trunc(attempt));
  return RECONNECT_DELAYS_MS[
    Math.min(normalizedAttempt, RECONNECT_DELAYS_MS.length - 1)
  ]!;
}

export type SyncSummary = {
  newScheduleCount: number;
  changedScheduleCount: number;
  newDocumentCount: number;
  changedSubmissionCount: number;
};

type CacheItem = OfflineCacheSnapshot['scheduleItems'][number];

function itemMap(items: readonly CacheItem[]): Map<string, CacheItem> {
  return new Map(items.map((item) => [item.id, item]));
}

function itemChanged(previous: CacheItem, next: CacheItem): boolean {
  return (
    previous.title !== next.title ||
    previous.status !== next.status ||
    previous.updatedAt !== next.updatedAt
  );
}

export function computeSyncSummary(
  previous: OfflineCacheSnapshot,
  next: OfflineCacheSnapshot,
): SyncSummary {
  const previousSchedules = itemMap(previous.scheduleItems);
  const previousDocuments = itemMap(previous.documentItems);
  let newScheduleCount = 0;
  let changedScheduleCount = 0;
  let newDocumentCount = 0;

  for (const item of next.scheduleItems) {
    const oldItem = previousSchedules.get(item.id);
    if (oldItem === undefined) {
      newScheduleCount += 1;
    } else if (itemChanged(oldItem, item)) {
      changedScheduleCount += 1;
    }
  }

  for (const item of next.documentItems) {
    if (!previousDocuments.has(item.id)) {
      newDocumentCount += 1;
    }
  }

  return {
    newScheduleCount,
    changedScheduleCount,
    newDocumentCount,
    changedSubmissionCount: Math.abs(
      next.submissionSummary.pendingCount -
        previous.submissionSummary.pendingCount,
    ),
  };
}

function toCacheSnapshot(response: DashboardResponse): OfflineCacheSnapshot {
  const pendingMetric = response.metrics.find(
    (metric) => metric.key === 'submissions.pending',
  );
  return {
    dashboard: {
      generatedAt: response.generated_at,
      metrics: response.metrics.map((metric) => ({ ...metric })),
    },
    scheduleItems: response.schedule_items.map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status,
      updatedAt: item.updated_at,
    })),
    documentItems: response.document_items.map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status,
      updatedAt: item.updated_at,
    })),
    submissionSummary: { pendingCount: pendingMetric?.count ?? 0 },
    roles: [...response.roles],
    permissions: [...response.permissions],
    lastSyncAt: response.generated_at,
  };
}

export type SyncAuthPort = {
  restoreSession: () => Promise<SessionView | null>;
  authenticatedRequest: <T>(
    operation: (accessToken: string) => Promise<T>,
  ) => Promise<T>;
};

export type DashboardApiPort = {
  getDashboard: (accessToken: string) => Promise<DashboardResponse>;
};

export type SyncCachePort = {
  get: (identity: CacheIdentity) => OfflineCacheSnapshot | null;
  put: (identity: CacheIdentity, snapshot: OfflineCacheSnapshot) => void;
};

export type SyncIdentityProvider = {
  forSession: (session: SessionView) => Promise<CacheIdentity>;
  forStoredCredential: () => Promise<CacheIdentity | null>;
};

export type SyncTimerPort = {
  setTimeout: (callback: () => void, delayMs: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

export type SyncServiceEvent =
  | {
      type: 'state';
      state: ConnectionState;
    }
  | {
      type: 'snapshot';
      snapshot: OfflineCacheSnapshot | null;
      source: 'live' | 'cache';
    }
  | {
      type: 'summary';
      summary: SyncSummary;
    }
  | { type: 'signed-out' };

export type SyncServiceDependencies = {
  auth: SyncAuthPort;
  api: DashboardApiPort;
  cache: SyncCachePort;
  identityProvider: SyncIdentityProvider;
  emit: (event: SyncServiceEvent) => void;
  timer?: SyncTimerPort;
};

const defaultTimer: SyncTimerPort = {
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => {
    globalThis.clearTimeout(
      handle as ReturnType<typeof globalThis.setTimeout>,
    );
  },
};

function isClientError(
  error: unknown,
  code: ClientError['code'],
): error is ClientError {
  return error instanceof ClientError && error.code === code;
}

export class SyncService {
  private state: ConnectionState = {
    kind: 'offline-readonly',
    lastSyncAt: null,
  };
  private currentSnapshot: OfflineCacheSnapshot | null = null;
  private reconnectAttempt = 0;
  private reconnectHandle: unknown | null = null;
  private stopped = false;

  public constructor(private readonly dependencies: SyncServiceDependencies) {}

  public async start(): Promise<void> {
    this.stopped = false;
    await this.connect(false);
  }

  public async retryNow(): Promise<void> {
    if (this.stopped || this.state.kind === 'security-blocked') {
      return;
    }
    this.cancelReconnect();
    this.publishState({ type: 'RECONNECT_STARTED' });
    await this.connect(true);
  }

  public notifyNetworkFailure(): void {
    if (this.stopped || this.state.kind === 'security-blocked') {
      return;
    }
    this.publishState({ type: 'NETWORK_FAILED' });
    this.scheduleReconnect();
  }

  public applyValidatedPolicy(): void {
    if (this.stopped) {
      return;
    }
    this.publishState({
      type: 'POLICY_VALIDATED',
      lastSyncAt: this.currentSnapshot?.lastSyncAt ?? null,
    });
    this.reconnectAttempt = 0;
    this.scheduleReconnect();
  }

  public stop(): void {
    this.stopped = true;
    this.cancelReconnect();
  }

  public getState(): ConnectionState {
    return { ...this.state };
  }

  private async connect(isReconnect: boolean): Promise<void> {
    let resolvedIdentity: CacheIdentity | null = null;
    try {
      const session = await this.dependencies.auth.restoreSession();
      if (session === null) {
        this.publishSignedOut();
        return;
      }
      resolvedIdentity = await this.dependencies.identityProvider.forSession(
        session,
      );
      const previous = isReconnect
        ? this.dependencies.cache.get(resolvedIdentity)
        : null;
      const dashboard = await this.dependencies.auth.authenticatedRequest(
        (accessToken) => this.dependencies.api.getDashboard(accessToken),
      );
      const snapshot = toCacheSnapshot(dashboard);

      this.dependencies.cache.put(resolvedIdentity, snapshot);
      this.currentSnapshot = snapshot;
      this.dependencies.emit({
        type: 'snapshot',
        snapshot,
        source: 'live',
      });
      if (isReconnect && previous !== null) {
        this.dependencies.emit({
          type: 'summary',
          summary: computeSyncSummary(previous, snapshot),
        });
      }
      this.publishState({
        type: 'LIVE_SYNCED',
        lastSyncAt: snapshot.lastSyncAt,
      });
      this.reconnectAttempt = 0;
      this.cancelReconnect();
    } catch (error: unknown) {
      if (isClientError(error, 'SECURITY_BLOCKED')) {
        this.handleSecurityBlocked();
        return;
      }
      if (isClientError(error, 'AUTHENTICATION_REQUIRED')) {
        this.publishSignedOut();
        return;
      }
      if (isClientError(error, 'NETWORK_UNAVAILABLE')) {
        await this.useOfflineFallback(resolvedIdentity);
        return;
      }
      throw error;
    }
  }

  private async useOfflineFallback(
    resolvedIdentity: CacheIdentity | null,
  ): Promise<void> {
    const identity =
      resolvedIdentity ??
      (await this.dependencies.identityProvider.forStoredCredential());
    const snapshot = identity === null
      ? null
      : this.dependencies.cache.get(identity);
    this.currentSnapshot = snapshot;
    this.dependencies.emit({
      type: 'snapshot',
      snapshot,
      source: 'cache',
    });
    this.state = {
      kind: 'offline-readonly',
      lastSyncAt: snapshot?.lastSyncAt ?? null,
    };
    this.dependencies.emit({ type: 'state', state: { ...this.state } });
    this.scheduleReconnect();
  }

  private handleSecurityBlocked(): void {
    this.cancelReconnect();
    this.publishState({
      type: 'SECURITY_BLOCKED',
      code: 'CERTIFICATE_MISMATCH',
    });
  }

  private publishSignedOut(): void {
    this.stop();
    this.dependencies.emit({ type: 'signed-out' });
  }

  private publishState(event: ConnectionEvent): void {
    this.state = reduceConnection(this.state, event);
    this.dependencies.emit({ type: 'state', state: { ...this.state } });
  }

  private scheduleReconnect(): void {
    if (
      this.stopped ||
      this.state.kind === 'security-blocked' ||
      this.reconnectHandle !== null
    ) {
      return;
    }
    const delayMs = reconnectDelayMs(this.reconnectAttempt);
    this.reconnectAttempt += 1;
    const timer = this.dependencies.timer ?? defaultTimer;
    this.reconnectHandle = timer.setTimeout(() => {
      this.reconnectHandle = null;
      void this.retryNow().catch(() => {
        // Expected connection errors are classified inside retryNow/connect.
      });
    }, delayMs);
  }

  private cancelReconnect(): void {
    if (this.reconnectHandle === null) {
      return;
    }
    const timer = this.dependencies.timer ?? defaultTimer;
    timer.clearTimeout(this.reconnectHandle);
    this.reconnectHandle = null;
  }
}
