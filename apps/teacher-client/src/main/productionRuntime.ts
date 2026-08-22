import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { SessionView } from '../shared/contracts.js';
import { AuthService } from './auth/authService.js';
import { ServerPolicyStore } from './config/serverPolicy.js';
import type { IpcHandlerServices } from './ipc/registerIpc.js';
import type { CertificateSession } from './network/certificatePinning.js';
import { installCertificatePinning } from './network/certificatePinning.js';
import { ApiClient, ClientError, type Transport } from './network/apiClient.js';
import {
  createTeacherClientRuntime,
  type TeacherClientRuntime,
} from './runtime.js';
import { CacheCrypto, type SafeStoragePort } from './security/cacheCrypto.js';
import {
  createWindowsCredentialStore,
  type CredentialStore,
} from './security/credentialStore.js';
import { getWindowsSid } from './security/windowsIdentity.js';
import {
  ServerChangeService,
  createElectronServerChangeProbe,
} from './settings/serverChangeService.js';
import {
  CacheRepository,
  openSqliteCacheDatabase,
  type CacheIdentity,
} from './storage/cacheRepository.js';
import { SyncService, type SyncServiceEvent } from './sync/syncService.js';

export type ProductionRuntimeOptions = {
  policyPath: string;
  cacheDirectory: string;
  certificateSession: CertificateSession;
  transport: Transport;
  safeStorage: SafeStoragePort;
  emitRenderer: (channel: string, payload?: unknown) => void;
  onPolicyChanged: () => void;
};

function cacheIdentityForStored(
  windowsSid: string,
  stored: Awaited<ReturnType<CredentialStore['readActive']>>,
): CacheIdentity | null {
  if (stored === null) {
    return null;
  }
  return {
    windowsSid,
    schoolId: stored.schoolCode,
    userId: stored.userId,
  };
}

export async function createProductionTeacherClientRuntime(
  options: ProductionRuntimeOptions,
): Promise<TeacherClientRuntime> {
  const policyStore = new ServerPolicyStore(options.policyPath);
  const policy = await policyStore.load();
  installCertificatePinning(options.certificateSession, policy);

  await mkdir(options.cacheDirectory, { recursive: true });
  const credentialStore = await createWindowsCredentialStore();
  const windowsSid = await getWindowsSid();
  const crypto = CacheCrypto.open(
    join(options.cacheDirectory, 'cache.key'),
    options.safeStorage,
  );
  const cacheDatabase = await openSqliteCacheDatabase(
    join(options.cacheDirectory, 'teacher-cache.db'),
  );
  const cache = new CacheRepository(cacheDatabase, crypto);
  cache.initialize();
  cache.pruneExpired();

  const api = new ApiClient(policy, options.transport);
  const auth = new AuthService(api, credentialStore, (identity) => {
    cache.deleteUser(identity.schoolCode, identity.userId);
    return Promise.resolve();
  });
  const identityProvider = {
    forSession: async (session: SessionView): Promise<CacheIdentity> => {
      const stored = await credentialStore.readActive();
      const identity = cacheIdentityForStored(windowsSid, stored);
      if (identity === null || identity.userId !== session.userId) {
        throw new ClientError('SECURITY_BLOCKED');
      }
      return identity;
    },
    forStoredCredential: async (): Promise<CacheIdentity | null> =>
      cacheIdentityForStored(windowsSid, await credentialStore.readActive()),
  };
  const settings = new ServerChangeService({
    createProbe: createElectronServerChangeProbe,
    policyStore,
  });

  return createTeacherClientRuntime({
    auth,
    credentialStore,
    cache,
    identityProvider,
    createSync: (emit: (event: SyncServiceEvent) => void) => {
      let initialSession: SessionView | null = null;
      const sync = new SyncService({
        auth: {
          restoreSession: async () => {
            if (initialSession !== null) {
              const supplied = initialSession;
              initialSession = null;
              return supplied;
            }
            return auth.restoreSession();
          },
          authenticatedRequest: (operation) =>
            auth.authenticatedRequest(operation),
        },
        api,
        cache,
        identityProvider,
        emit,
      });
      return {
        start: async (session?: SessionView) => {
          initialSession = session ?? null;
          try {
            await sync.start();
          } finally {
            initialSession = null;
          }
        },
        stop: () => sync.stop(),
        getState: () => sync.getState(),
      };
    },
    settings: {
      requestServerChange: (input) => settings.requestChange(input),
    },
    emitRenderer: options.emitRenderer,
    onPolicyChanged: options.onPolicyChanged,
  });
}

export function createRecoveryIpcServices(
  policyPath: string,
  onPolicyChanged: () => void,
): IpcHandlerServices {
  const settings = new ServerChangeService({
    createProbe: createElectronServerChangeProbe,
    policyStore: new ServerPolicyStore(policyPath),
  });
  const unavailable = (): Promise<never> =>
    Promise.reject(new ClientError('SERVER_RESPONSE_INVALID'));

  return {
    auth: {
      login: unavailable,
      restoreSession: unavailable,
      logout: () => Promise.resolve(),
    },
    dashboard: { load: unavailable },
    connection: {
      getStatus: () =>
        Promise.resolve({
          kind: 'security-blocked' as const,
          code: 'SERVER_IDENTITY_INVALID' as const,
        }),
    },
    settings: {
      requestServerChange: async (input) => {
        await settings.requestChange(input);
        onPolicyChanged();
      },
    },
  };
}
