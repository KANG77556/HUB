import type {
  ConnectionState,
  DashboardSnapshot,
  LoginInput,
  ServerChangeInput,
  SessionView,
} from '../shared/contracts.js';
import type { IpcHandlerServices } from './ipc/registerIpc.js';
import { IPC_CHANNELS } from './ipc/channels.js';
import { ClientError } from './network/apiClient.js';
import type { StoredSession } from './security/credentialStore.js';
import type {
  CacheIdentity,
  OfflineCacheSnapshot,
} from './storage/cacheRepository.js';
import type { SyncServiceEvent } from './sync/syncService.js';

export type RuntimeAuthPort = {
  login: (input: LoginInput) => Promise<SessionView>;
  logout: () => Promise<void>;
  getSession: () => SessionView | null;
};

export type RuntimeCredentialStore = {
  readActive: () => Promise<StoredSession | null>;
};

export type RuntimeCache = {
  get: (identity: CacheIdentity) => OfflineCacheSnapshot | null;
};

export type RuntimeIdentityProvider = {
  forStoredCredential: () => Promise<CacheIdentity | null>;
};

export type RuntimeSyncService = {
  start: (initialSession?: SessionView) => Promise<void>;
  stop: () => void;
  getState: () => ConnectionState;
};

export type RuntimeSettingsPort = {
  requestServerChange: (input: ServerChangeInput) => Promise<void>;
};

export type TeacherClientRuntimeDependencies = {
  auth: RuntimeAuthPort;
  credentialStore: RuntimeCredentialStore;
  cache: RuntimeCache;
  identityProvider: RuntimeIdentityProvider;
  createSync: (emit: (event: SyncServiceEvent) => void) => RuntimeSyncService;
  settings: RuntimeSettingsPort;
  emitRenderer: (channel: string, payload?: unknown) => void;
  onPolicyChanged: () => void;
};

export type TeacherClientRuntime = {
  services: IpcHandlerServices;
  dispose: () => void;
};

function toDashboard(snapshot: OfflineCacheSnapshot): DashboardSnapshot {
  return {
    generatedAt: snapshot.dashboard.generatedAt,
    metrics: snapshot.dashboard.metrics.map((metric) => ({ ...metric })),
    scheduleItems: snapshot.scheduleItems.map((item) => ({ ...item })),
    documentItems: snapshot.documentItems.map((item) => ({ ...item })),
  };
}

function offlineSession(
  stored: StoredSession,
  snapshot: OfflineCacheSnapshot,
): SessionView {
  return {
    userId: stored.userId,
    displayName: '오프라인 사용자',
    schoolName: stored.schoolCode,
    departmentNames: [],
    roles: [...snapshot.roles],
    permissions: [...snapshot.permissions],
  };
}

export function createTeacherClientRuntime(
  dependencies: TeacherClientRuntimeDependencies,
): TeacherClientRuntime {
  let latestSnapshot: OfflineCacheSnapshot | null = null;

  const handleSyncEvent = (event: SyncServiceEvent): void => {
    switch (event.type) {
      case 'snapshot':
        latestSnapshot = event.snapshot;
        return;
      case 'state':
        dependencies.emitRenderer(IPC_CHANNELS.connectionChanged, event.state);
        return;
      case 'summary':
        dependencies.emitRenderer(IPC_CHANNELS.syncSummary, event.summary);
        return;
      case 'signed-out':
        latestSnapshot = null;
        dependencies.emitRenderer(IPC_CHANNELS.sessionInvalidated);
        return;
    }
  };

  const sync = dependencies.createSync(handleSyncEvent);

  const restoreSession = async (): Promise<SessionView | null> => {
    await sync.start();
    const liveSession = dependencies.auth.getSession();
    if (liveSession !== null) {
      return { ...liveSession };
    }

    const [stored, identity] = await Promise.all([
      dependencies.credentialStore.readActive(),
      dependencies.identityProvider.forStoredCredential(),
    ]);
    if (stored === null || identity === null) {
      return null;
    }
    if (stored.userId !== identity.userId) {
      throw new ClientError('SECURITY_BLOCKED');
    }

    const cached = latestSnapshot ?? dependencies.cache.get(identity);
    if (cached === null) {
      return null;
    }
    latestSnapshot = cached;
    return offlineSession(stored, cached);
  };

  const services: IpcHandlerServices = {
    auth: {
      login: async (input) => {
        const session = await dependencies.auth.login(input);
        await sync.start(session);
        return session;
      },
      restoreSession,
      logout: async () => {
        sync.stop();
        try {
          await dependencies.auth.logout();
        } finally {
          latestSnapshot = null;
        }
      },
    },
    dashboard: {
      load: () => {
        if (latestSnapshot === null) {
          return Promise.reject(new ClientError('NETWORK_UNAVAILABLE'));
        }
        return Promise.resolve(toDashboard(latestSnapshot));
      },
    },
    connection: {
      getStatus: () => Promise.resolve(sync.getState()),
    },
    settings: {
      requestServerChange: async (input) => {
        await dependencies.settings.requestServerChange(input);
        sync.stop();
        latestSnapshot = null;
        dependencies.onPolicyChanged();
      },
    },
  };

  return {
    services,
    dispose: () => sync.stop(),
  };
}
