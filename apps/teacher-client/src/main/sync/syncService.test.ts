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

describe('sync state helpers', () => {
  it('covers online, offline, reconnecting, policy recovery, and sticky blocking', () => {
    const offline: ConnectionState = {
      kind: 'offline-readonly',
      lastSyncAt: cachedSnapshot.lastSyncAt,
    };
    expect(reduceConnection(offline, { type: 'RECONNECT_STARTED' })).toEqual({
      kind: 'reconnecting',
      lastSyncAt: cachedSnapshot.lastSyncAt,
    });
    expect(
      reduceConnection(offline, { type: 'LIVE_SYNCED', lastSyncAt }),
    ).toEqual({ kind: 'online', lastSyncAt });
    expect(
      reduceConnection(
        { kind: 'online', lastSyncAt },
        { type: 'NETWORK_FAILED' },
      ),
    ).toEqual({ kind: 'offline-readonly', lastSyncAt });

    const blocked: ConnectionState = {
      kind: 'security-blocked',
      code: 'CERTIFICATE_MISMATCH',
    };
    expect(reduceConnection(blocked, { type: 'RECONNECT_STARTED' })).toEqual(
      blocked,
    );
    expect(
      reduceConnection(blocked, {
        type: 'POLICY_VALIDATED',
        lastSyncAt: cachedSnapshot.lastSyncAt,
      }),
    ).toEqual({
      kind: 'offline-readonly',
      lastSyncAt: cachedSnapshot.lastSyncAt,
    });
  });

  it('caps reconnect delay and summarizes stable-ID changes', () => {
    expect([0, 1, 2, 3, 4, 8].map(reconnectDelayMs)).toEqual([
      5_000,
      15_000,
      30_000,
      60_000,
      60_000,
      60_000,
    ]);
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

type RestoreResult = SessionView | null | ClientError;
type ScheduledTimer = { callback: () => void; delayMs: number };

function createFixture(options: {
  restoreResults?: RestoreResult[];
  cached?: OfflineCacheSnapshot | null;
} = {}) {
  const restoreResults = [...(options.restoreResults ?? [session])];
  const restoreSession: SyncAuthPort['restoreSession'] = () => {
    const result =
      restoreResults.length === 0 ? session : restoreResults.shift()!;
    return result instanceof ClientError
      ? Promise.reject(result)
      : Promise.resolve(result);
  };
  const authenticatedRequest: SyncAuthPort['authenticatedRequest'] =
    (operation) => operation('access-token');
  const auth: SyncAuthPort = { restoreSession, authenticatedRequest };

  const getDashboard = vi
    .fn<DashboardApiPort['getDashboard']>()
    .mockResolvedValue(liveDashboard);
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
  const events: SyncServiceEvent[] = [];
  const emit = (event: SyncServiceEvent): void => {
    events.push(event);
    order.push(`event:${event.type}`);
  };
  const service = new SyncService({
    auth,
    api,
    cache,
    identityProvider,
    emit,
    timer,
  });
  return {
    service,
    events,
    cacheGet,
    cachePut,
    scheduled,
    cleared,
    order,
  };
}

describe('SyncService', () => {
  it('writes live data before publishing online state', async () => {
    const fixture = createFixture();
    await fixture.service.start();

    expect(fixture.cachePut).toHaveBeenCalledTimes(1);
    expect(fixture.order.indexOf('cache-put')).toBeLessThan(
      fixture.order.indexOf('event:snapshot'),
    );
    expect(fixture.events.at(-1)).toEqual({
      type: 'state',
      state: { kind: 'online', lastSyncAt },
    });
  });

  it('uses cached read-only data and schedules reconnect on network failure', async () => {
    const fixture = createFixture({
      restoreResults: [new ClientError('NETWORK_UNAVAILABLE')],
      cached: cachedSnapshot,
    });
    await fixture.service.start();

    expect(fixture.cacheGet).toHaveBeenCalledWith(identity);
    expect(fixture.events).toContainEqual({
      type: 'snapshot',
      snapshot: cachedSnapshot,
      source: 'cache',
    });
    expect(fixture.events).toContainEqual({
      type: 'state',
      state: {
        kind: 'offline-readonly',
        lastSyncAt: cachedSnapshot.lastSyncAt,
      },
    });
    expect(fixture.scheduled.map(({ delayMs }) => delayMs)).toEqual([5_000]);
  });

  it('publishes a null read-only snapshot when no cache exists', async () => {
    const fixture = createFixture({
      restoreResults: [new ClientError('NETWORK_UNAVAILABLE')],
      cached: null,
    });
    await fixture.service.start();

    expect(fixture.events).toContainEqual({
      type: 'snapshot',
      snapshot: null,
      source: 'cache',
    });
    expect(fixture.events).toContainEqual({
      type: 'state',
      state: { kind: 'offline-readonly', lastSyncAt: null },
    });
  });

  it('reconnects, updates cache, and emits a change summary', async () => {
    const fixture = createFixture({
      restoreResults: [new ClientError('NETWORK_UNAVAILABLE'), session],
      cached: cachedSnapshot,
    });
    await fixture.service.start();
    await fixture.service.retryNow();

    expect(fixture.events).toContainEqual({
      type: 'state',
      state: {
        kind: 'reconnecting',
        lastSyncAt: cachedSnapshot.lastSyncAt,
      },
    });
    expect(fixture.events).toContainEqual({
      type: 'summary',
      summary: {
        newScheduleCount: 0,
        changedScheduleCount: 1,
        newDocumentCount: 1,
        changedSubmissionCount: 1,
      },
    });
    expect(fixture.events.at(-1)).toEqual({
      type: 'state',
      state: { kind: 'online', lastSyncAt },
    });
  });

  it('hard-blocks certificate failures without opening cache', async () => {
    const fixture = createFixture({
      restoreResults: [new ClientError('SECURITY_BLOCKED')],
      cached: cachedSnapshot,
    });
    await fixture.service.start();

    expect(fixture.cacheGet).not.toHaveBeenCalled();
    expect(fixture.scheduled).toHaveLength(0);
    expect(fixture.events.at(-1)).toEqual({
      type: 'state',
      state: {
        kind: 'security-blocked',
        code: 'CERTIFICATE_MISMATCH',
      },
    });
  });

  it('cancels reconnect on stop and emits signed-out on auth rejection', async () => {
    const offline = createFixture({
      restoreResults: [new ClientError('NETWORK_UNAVAILABLE')],
      cached: cachedSnapshot,
    });
    await offline.service.start();
    offline.service.stop();
    expect(offline.cleared).toHaveLength(1);

    const rejected = createFixture({
      restoreResults: [new ClientError('AUTHENTICATION_REQUIRED')],
    });
    await rejected.service.start();
    expect(rejected.events).toEqual([{ type: 'signed-out' }]);
  });
});
