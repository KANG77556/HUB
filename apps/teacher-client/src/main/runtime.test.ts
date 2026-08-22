import { describe, expect, it, vi } from 'vitest';

import type {
  ConnectionState,
  DashboardSnapshot,
  LoginInput,
  ServerChangeInput,
  SessionView,
  SyncSummary,
} from '../shared/contracts.js';
import type { StoredSession } from './security/credentialStore.js';
import type {
  CacheIdentity,
  OfflineCacheSnapshot,
} from './storage/cacheRepository.js';
import type { SyncServiceEvent } from './sync/syncService.js';
import {
  createTeacherClientRuntime,
  type RuntimeSyncService,
} from './runtime.js';

const session: SessionView = {
  userId: '22222222-2222-4222-8222-222222222222',
  displayName: '김선생',
  schoolName: '샘플학교',
  departmentNames: ['교무부'],
  roles: ['teacher', 'teacher_lead'],
  permissions: ['dashboard.read', 'documents.read'],
};
const stored: StoredSession = {
  schoolCode: 'sample-school',
  userId: session.userId,
  refreshToken: 'refresh-token-value-that-is-long-enough',
};
const identity: CacheIdentity = {
  windowsSid: 'S-1-5-21-1000-2000-3000-4000',
  schoolId: stored.schoolCode,
  userId: stored.userId,
};
const snapshot: OfflineCacheSnapshot = {
  dashboard: {
    generatedAt: '2026-07-31T01:00:00.000Z',
    metrics: [{ key: 'documents.recent', count: 2 }],
  },
  scheduleItems: [
    {
      id: 'schedule-1',
      title: '교무회의',
      status: 'scheduled',
      updatedAt: '2026-07-31T00:10:00.000Z',
    },
  ],
  documentItems: [
    {
      id: 'document-1',
      title: '가정통신문',
      status: 'published',
      updatedAt: '2026-07-31T00:20:00.000Z',
    },
  ],
  submissionSummary: { pendingCount: 0 },
  roles: [...session.roles],
  permissions: [...session.permissions],
  lastSyncAt: '2026-07-31T01:00:00.000Z',
};
const dashboard: DashboardSnapshot = {
  generatedAt: snapshot.dashboard.generatedAt,
  metrics: snapshot.dashboard.metrics,
  scheduleItems: snapshot.scheduleItems,
  documentItems: snapshot.documentItems,
};
const online: ConnectionState = {
  kind: 'online',
  lastSyncAt: snapshot.lastSyncAt,
};

type HarnessOptions = {
  liveSession?: SessionView | null;
  cachedSnapshot?: OfflineCacheSnapshot | null;
  startEvents?: SyncServiceEvent[];
};

function createHarness(options: HarnessOptions = {}) {
  const rendererEvents: Array<{ channel: string; payload?: unknown }> = [];
  let emitSync: ((event: SyncServiceEvent) => void) | null = null;
  const sync: RuntimeSyncService = {
    start: vi.fn((initialSession?: SessionView) => {
      void initialSession;
      for (const event of options.startEvents ?? []) {
        emitSync?.(event);
      }
      return Promise.resolve();
    }),
    stop: vi.fn(),
    getState: vi.fn(() => online),
  };
  const auth = {
    login: vi.fn((input: LoginInput) => {
      void input;
      return Promise.resolve(session);
    }),
    logout: vi.fn(() => Promise.resolve()),
    getSession: vi.fn(() =>
      options.liveSession === undefined ? session : options.liveSession,
    ),
  };
  const credentialStore = {
    readActive: vi.fn(() => Promise.resolve(stored)),
  };
  const cache = {
    get: vi.fn((candidate: CacheIdentity) => {
      void candidate;
      return options.cachedSnapshot ?? snapshot;
    }),
  };
  const identityProvider = {
    forStoredCredential: vi.fn(() => Promise.resolve(identity)),
  };
  const settings = {
    requestServerChange: vi.fn((input: ServerChangeInput) => {
      void input;
      return Promise.resolve();
    }),
  };
  const onPolicyChanged = vi.fn();
  const runtime = createTeacherClientRuntime({
    auth,
    credentialStore,
    cache,
    identityProvider,
    createSync: (emit) => {
      emitSync = emit;
      return sync;
    },
    settings,
    emitRenderer: (channel, payload) => {
      rendererEvents.push(
        payload === undefined ? { channel } : { channel, payload },
      );
    },
    onPolicyChanged,
  });

  return {
    runtime,
    sync,
    auth,
    cache,
    identityProvider,
    settings,
    onPolicyChanged,
    rendererEvents,
    emitSync: (event: SyncServiceEvent): void => emitSync?.(event),
  };
}

describe('teacher client runtime', () => {
  it('starts synchronization during restore and exposes the synchronized dashboard', async () => {
    const harness = createHarness({
      startEvents: [
        { type: 'snapshot', source: 'live', snapshot },
        { type: 'state', state: online },
      ],
    });

    await expect(harness.runtime.services.auth.restoreSession()).resolves.toEqual(session);
    await expect(harness.runtime.services.dashboard.load()).resolves.toEqual(dashboard);
    expect(harness.sync.start).toHaveBeenCalledWith();
    expect(harness.rendererEvents).toContainEqual({
      channel: 'event:connection-changed',
      payload: online,
    });
  });

  it('reconstructs a read-only session from an identity-matched cache when offline', async () => {
    const offline: ConnectionState = {
      kind: 'offline-readonly',
      lastSyncAt: snapshot.lastSyncAt,
    };
    const harness = createHarness({
      liveSession: null,
      cachedSnapshot: snapshot,
      startEvents: [{ type: 'state', state: offline }],
    });

    await expect(harness.runtime.services.auth.restoreSession()).resolves.toEqual({
      userId: stored.userId,
      displayName: '오프라인 사용자',
      schoolName: stored.schoolCode,
      departmentNames: [],
      roles: snapshot.roles,
      permissions: snapshot.permissions,
    });
    await expect(harness.runtime.services.dashboard.load()).resolves.toEqual(dashboard);
    expect(harness.identityProvider.forStoredCredential).toHaveBeenCalledTimes(1);
    expect(harness.cache.get).toHaveBeenCalledWith(identity);
  });

  it('passes a freshly authenticated session into synchronization', async () => {
    const harness = createHarness();
    const input: LoginInput = {
      schoolCode: stored.schoolCode,
      username: 'teacher',
      password: 'password',
    };

    await expect(harness.runtime.services.auth.login(input)).resolves.toEqual(session);
    expect(harness.auth.login).toHaveBeenCalledWith(input);
    expect(harness.sync.start).toHaveBeenCalledWith(session);
  });

  it('forwards summaries and session invalidation without exposing snapshots', () => {
    const harness = createHarness();
    const summary: SyncSummary = {
      newScheduleCount: 1,
      changedScheduleCount: 2,
      newDocumentCount: 3,
      changedSubmissionCount: 4,
    };

    harness.emitSync({ type: 'summary', summary });
    harness.emitSync({ type: 'signed-out' });

    expect(harness.rendererEvents).toEqual([
      { channel: 'event:sync-summary', payload: summary },
      { channel: 'event:session-invalidated' },
    ]);
  });

  it('stops synchronization and clears runtime state during logout', async () => {
    const harness = createHarness({
      startEvents: [{ type: 'snapshot', source: 'live', snapshot }],
    });
    await harness.runtime.services.auth.restoreSession();

    await expect(harness.runtime.services.auth.logout()).resolves.toBeUndefined();
    expect(harness.sync.stop).toHaveBeenCalledTimes(1);
    expect(harness.auth.logout).toHaveBeenCalledTimes(1);
    await expect(harness.runtime.services.dashboard.load()).rejects.toMatchObject({
      code: 'NETWORK_UNAVAILABLE',
    });
  });

  it('requests a controlled restart only after a protected server change succeeds', async () => {
    const harness = createHarness();
    const input: ServerChangeInput = {
      baseUrl: 'https://new-school.example/',
      schoolCode: stored.schoolCode,
      currentFingerprint: 'A'.repeat(64),
      nextFingerprint: null,
      adminUsername: 'administrator',
      adminPassword: 'temporary-password',
    };

    await expect(
      harness.runtime.services.settings.requestServerChange(input),
    ).resolves.toBeUndefined();
    expect(harness.settings.requestServerChange).toHaveBeenCalledWith(input);
    expect(harness.onPolicyChanged).toHaveBeenCalledTimes(1);
  });
});
