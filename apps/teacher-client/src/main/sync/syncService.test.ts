import { describe, expect, it, vi } from 'vitest';

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
import {
  computeSyncSummary,
  reconnectDelayMs,
  reduceConnection,
  SyncService,
  type DashboardApiPort,
  type SyncAuthPort,
  type SyncCachePort,
  type SyncIdentityProvider,
  type SyncServiceEvent,
  type SyncTimerPort,
} from './syncService.js';

const lastSyncAt = '2026-07-31T03:00:00.000Z';
const identity: CacheIdentity = {
  windowsSid: 'S-1-5-21-1000-2000-3000-4000',
  schoolId: 'sample-school',
  userId: '3d594650-3436-4bc4-a593-8d9eea56f26d',
};
const session: SessionView = {
  userId: identity.userId,
  displayName: '김선생',
  schoolName: '샘플학교',
  departmentNames: ['교무부'],
  roles: ['teacher'],
  permissions: ['calendar.read', 'documents.read'],
};
const liveDashboard: DashboardResponse = {
  generated_at: lastSyncAt,
  roles: ['teacher'],
  permissions: ['calendar.read', 'documents.read'],
  metrics: [{ key: 'submissions.pending', count: 2 }],
  schedule_items: [
    {
      id: 'schedule-1',
      title: '교무회의',
      status: 'scheduled',
      updated_at: lastSyncAt,
    },
  ],
  document_items: [
    {
      id: 'document-1',
      title: '가정통신문',
      status: 'published',
      updated_at: lastSyncAt,
    },
  ],
};
const cachedSnapshot: OfflineCacheSnapshot = {
  dashboard: {
    generatedAt: '2026-07-30T03:00:00.000Z',
    metrics: [{ key: 'submissions.pending', count: 1 }],
  },
  scheduleItems: [
    {
      id: 'schedule-1',
      title: '교무회의',
      status: 'draft',
      updatedAt: '2026-07-30T03:00:00.000Z',
    },
  ],
  documentItems: [],
  submissionSummary: { pendingCount: 1 },
  roles: ['teacher'],
  permissions: ['calendar.read', 'documents.read'],
  lastSyncAt: '2026-07-30T03:00:00.000Z',
};

describe('connection reducer', () => {
  it('covers online, offline, reconnecting, and policy recovery transitions', () => {
    const offline: ConnectionState = {
      kind: 'offline-readonly',
      lastSyncAt: cachedSnapshot.lastSyncAt,
    };
    expect(
      reduceConnection(offline, {
        type: 'RECONNECT_STARTED',
      }),
    ).toEqual({
      kind: 'reconnecting',
      lastSyncAt: cachedSnapshot.lastSyncAt,
    });
    expect(
      reduceConnection(offline, {
        type: 'LIVE_SYNCED',
        lastSyncAt,
      }),
    ).toEqual({ kind: 'online', lastSyncAt });
    expect(
      reduceConnection(
        { kind: 'online', lastSyncAt },
        { type: 'NETWORK_FAILED' },
      ),
    ).toEqual({ kind: 'offline-readonly', lastSyncAt });
    expect(
      reduceConnection(
        {
          kind: 'security-blocked',
          code: 'CERTIFICATE_MISMATCH',
        },
        {
          type: 'POLICY_VALIDATED',
          lastSyncAt: cachedSnapshot.lastSyncAt,
        },
      ),
    ).toEqual({
      kind: 'offline-readonly',
      lastSyncAt: cachedSnapshot.lastSyncAt,
    });
  });

  it('keeps security-blocked sticky until a newly validated policy arrives', () => {
    const blocked: ConnectionState = {
      kind: 'security-blocked',
      code: 'CERTIFICATE_MISMATCH',
    };
    expect(reduceConnection(blocked, { type: 'RECONNECT_STARTED' })).toEqual(
      blocked,
    );
    expect(
      reduceConnection(blocked, { type: 'LIVE_SYNCED', lastSyncAt }),
    ).toEqual(blocked);
  });
});

describe('sync helpers', () => {
  it('uses capped reconnect delays', () => {
    expect([0, 1, 2, 3, 4, 8].map(reconnectDelayMs)).toEqual([
      5_000,
      15_000,
      30_000,
      60_000,
      60_000,
      60_000,
    ]);
  });

  it('summarizes new and changed stable IDs without counting unchanged data', () => {
    const next: OfflineCacheSnapshot = {
      ...cachedSnapshot,
      scheduleItems: [
        {
          ...cachedSnapshot.scheduleItems[0]!,
          status: 'scheduled',
          updatedAt: lastSyncAt,
        },
        {
          id: 'schedule-2',
          title: '학부모 상담',
          status: 'scheduled',
          updatedAt: lastSyncAt,
        },
      ],
      documentItems: [
        {
          id: 'document-1',
          title: '가정통신문',
          status: 'published',
          updatedAt: lastSyncAt,
        },
      ],
      submissionSummary: { pendingCount: 2 },
      lastSyncAt,
    };

    expect(computeSyncSummary(cachedSnapshot, next)).toEqual({
      newScheduleCount: 1,
      changedScheduleCount: 1,
      newDocumentCount: 1,
      changedSubmissionCount: 1,
    });
  });
});

type ScheduledTimer = {
  callback: () => void;
  delayMs: number;
};

function createTimer(): {
  timer: SyncTimerPort;
  scheduled: ScheduledTimer[];
  cleared: unknown[];
} {
  const scheduled: ScheduledTimer[] = [];
  const cleared: unknown[] = [];
  const timer: SyncTimerPort = {
    setTimeout: (callback, delayMs) => {
      const handle = { callback, delayMs };
      scheduled.push(handle);
      return handle;
    },
    clearTimeout: (handle) => {
      cleared.push(handle);
    },
  };
  return { timer, scheduled, cleared };
}

function createService(options: {
  restoreResults?: Array<SessionView | null | ClientError>;
  cached?: OfflineCacheSnapshot | null;
  dashboard?: DashboardResponse;
} = {}): {
  service: SyncService;
  events: SyncServiceEvent[];
  cachePut: ReturnType<typeof vi.fn<SyncCachePort['put']>>;
  cacheGet: ReturnType<typeof vi.fn<SyncCachePort['get']>>;
  getDashboard: ReturnType<typeof vi.fn<DashboardApiPort['getDashboard']>>;
  scheduled: ScheduledTimer[];
  cleared: unknown[];
  order: string[];
} {
  const restoreResults = [...(options.restoreResults ?? [session])];
  const restoreSession: SyncAuthPort['restoreSession'] = () => {
    const result = restoreResults.shift() ?? session;
    return result instanceof ClientError
      ? Promise.reject(result)
      : Promise.resolve(result);
  };
  const authenticatedRequest: SyncAuthPort['authenticatedRequest'] = (operation) =>
    operation('access-token');
  const auth: SyncAuthPort = {
    restoreSession,
    authenticatedRequest,
  };
  const getDashboard = vi
    .fn<DashboardApiPort['getDashboard']>()
    .mockResolvedValue(options.dashboard ?? liveDashboard);
  const api: DashboardApiPort = { getDashboard };
  const order: string[] = [];
  const cacheGet = vi
    .fn<SyncCachePort['get']>()
    .mockImplementation(() => options.cached ?? null);
  const cachePut = vi.fn<SyncCachePort['put']>().mockImplementation(() => {
    order.push('cache-put');
  });
  const cache: SyncCachePort = { get: cacheGet, put: cachePut };
  const identityProvider: SyncIdentityProvider = {
    forSession: () => Promise.resolve(identity),
    forStoredCredential: () => Promise.resolve(identity),
  };
  const events: SyncServiceEvent[] = [];
  const emit = (event: SyncServiceEvent): void => {
    events.push(event);
    order.push(`event:${event.type}`);
  };
  const { timer, scheduled, cleared } = createTimer();
  return {
    service: new SyncService(
      { auth, api, cache, identityProvider, emit, timer },
    ),
    events,
    cachePut,
    cacheGet,
    getDashboard,
    scheduled,
    cleared,
    order,
  };
}

describe('SyncService', () => {
  it('writes a live snapshot before publishing online state', async () => {
    const { service, events, cachePut, order } = createService();

    await service.start();

    expect(cachePut).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toEqual({
      type: 'state',
      state: { kind: 'online', lastSyncAt },
    });
    expect(order.indexOf('cache-put')).toBeLessThan(
      order.indexOf('event:snapshot'),
    );
  });

  it('falls back to an identity-matched cache and schedules reconnect on startup network failure', async () => {
    const { service, events, scheduled, cacheGet } = createService({
      restoreResults: [new ClientError('NETWORK_UNAVAILABLE')],
      cached: cachedSnapshot,
    });

    await service.start();

    expect(cacheGet).toHaveBeenCalledWith(identity);
    expect(events).toContainEqual({
      type: 'snapshot',
      snapshot: cachedSnapshot,
      source: 'cache',
    });
    expect(events).toContainEqual({
      type: 'state',
      state: {
        kind: 'offline-readonly',
        lastSyncAt: cachedSnapshot.lastSyncAt,
      },
    });
    expect(scheduled.map(({ delayMs }) => delayMs)).toEqual([5_000]);
  });

  it('publishes a null read-only snapshot when no offline cache exists', async () => {
    const { service, events } = createService({
      restoreResults: [new ClientError('NETWORK_UNAVAILABLE')],
      cached: null,
    });

    await service.start();

    expect(events).toContainEqual({
      type: 'snapshot',
      snapshot: null,
      source: 'cache',
    });
    expect(events).toContainEqual({
      type: 'state',
      state: { kind: 'offline-readonly', lastSyncAt: null },
    });
  });

  it('reconnects in the background, updates cache, and emits a change summary', async () => {
    const { service, events, cachePut, scheduled } = createService({
      restoreResults: [new ClientError('NETWORK_UNAVAILABLE'), session],
      cached: cachedSnapshot,
    });
    await service.start();

    await service.retryNow();

    expect(events).toContainEqual({
      type: 'state',
      state: {
        kind: 'reconnecting',
        lastSyncAt: cachedSnapshot.lastSyncAt,
      },
    });
    expect(events).toContainEqual({
      type: 'summary',
      summary: {
        newScheduleCount: 0,
        changedScheduleCount: 1,
        newDocumentCount: 1,
        changedSubmissionCount: 1,
      },
    });
    expect(events.at(-1)).toEqual({
      type: 'state',
      state: { kind: 'online', lastSyncAt },
    });
    expect(cachePut).toHaveBeenCalledTimes(1);
    expect(scheduled).toHaveLength(1);
  });

  it('hard-blocks certificate failures without opening the cache', async () => {
    const { service, events, cacheGet, scheduled } = createService({
      restoreResults: [new ClientError('SECURITY_BLOCKED')],
      cached: cachedSnapshot,
    });

    await service.start();

    expect(cacheGet).not.toHaveBeenCalled();
    expect(events.at(-1)).toEqual({
      type: 'state',
      state: {
        kind: 'security-blocked',
        code: 'CERTIFICATE_MISMATCH',
      },
    });
    expect(scheduled).toHaveLength(0);
  });

  it('emits signed-out on refresh rejection and cancels future reconnects', async () => {
    const { service, events, scheduled, cleared } = createService({
      restoreResults: [new ClientError('NETWORK_UNAVAILABLE')],
      cached: cachedSnapshot,
    });
    await service.start();
    expect(scheduled).toHaveLength(1);

    service.stop();

    expect(cleared).toHaveLength(1);
    const rejected = createService({
      restoreResults: [new ClientError('AUTHENTICATION_REQUIRED')],
    });
    await rejected.service.start();
    expect(rejected.events).toEqual([{ type: 'signed-out' }]);
  });
});
