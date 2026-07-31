import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuthService } from '../auth/authService.js';
import { parseServerPolicy } from '../config/serverPolicy.js';
import {
  ApiClient,
  ClientError,
  type Transport,
  type TransportResponse,
} from '../network/apiClient.js';
import { CacheCrypto, type KeyFileStore, type SafeStoragePort } from '../security/cacheCrypto.js';
import { CredentialStore, type KeytarAdapter } from '../security/credentialStore.js';
import {
  CacheRepository,
  type CacheDatabase,
  type CacheIdentity,
  type CacheRow,
} from '../storage/cacheRepository.js';
import {
  SyncService,
  type SyncServiceEvent,
  type SyncTimerPort,
} from '../sync/syncService.js';

const SCHOOL_CODE = 'foundation-school';
const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const WINDOWS_SID = 'S-1-5-21-1000-2000-3000-4000';
const USERNAME = 'foundation.teacher';
const PASSWORD = 'Foundation-Only-Password';
const CURRENT_FINGERPRINT = 'A'.repeat(64);

class MemoryKeytarAdapter implements KeytarAdapter {
  private storedValue: string | null = null;

  getPassword(): Promise<string | null> {
    return Promise.resolve(this.storedValue);
  }

  setPassword(_service: string, _account: string, value: string): Promise<void> {
    this.storedValue = value;
    return Promise.resolve();
  }

  deletePassword(): Promise<boolean> {
    const existed = this.storedValue !== null;
    this.storedValue = null;
    return Promise.resolve(existed);
  }
}

function cloneRow(row: CacheRow): CacheRow {
  return {
    ...row,
    nonce: Buffer.from(row.nonce),
    authTag: Buffer.from(row.authTag),
    ciphertext: Buffer.from(row.ciphertext),
  };
}

class MemoryCacheDatabase implements CacheDatabase {
  private readonly rows = new Map<string, CacheRow>();

  exec(): void {}

  upsert(row: CacheRow): void {
    this.rows.set(row.identityKey, cloneRow(row));
  }

  find(identityKey: string): CacheRow | null {
    const row = this.rows.get(identityKey);
    return row === undefined ? null : cloneRow(row);
  }

  deleteIdentity(identityKey: string): void {
    this.rows.delete(identityKey);
  }

  deleteUser(schoolId: string, userId: string): void {
    for (const [key, row] of this.rows) {
      if (row.schoolId === schoolId && row.userId === userId) {
        this.rows.delete(key);
      }
    }
  }

  pruneExpired(cutoffIso: string): number {
    let deleted = 0;
    for (const [key, row] of this.rows) {
      if (row.expiresAt <= cutoffIso) {
        this.rows.delete(key);
        deleted += 1;
      }
    }
    return deleted;
  }

  firstRow(): CacheRow | null {
    const next = this.rows.values().next();
    return next.done ? null : cloneRow(next.value);
  }
}

function createSafeStorage(): SafeStoragePort {
  const transform = (value: Buffer): Buffer =>
    Buffer.from(value.map((byte) => byte ^ 0xa5));
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value) => transform(Buffer.from(value, 'utf8')),
    decryptString: (value) => transform(value).toString('utf8'),
  };
}

function createKeyFileStore(): KeyFileStore {
  let value: Buffer | null = null;
  return {
    read: () => (value === null ? null : Buffer.from(value)),
    writeAtomically: (_path, next) => {
      value = Buffer.from(next);
    },
  };
}

function reservePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('FOUNDATION_PORT_UNAVAILABLE'));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error === undefined) {
          resolvePort(port);
        } else {
          reject(error);
        }
      });
    });
  });
}

type RunningApi = {
  baseUrl: string;
  process: ChildProcessWithoutNullStreams;
};

async function startFoundationApi(): Promise<RunningApi> {
  const port = await reservePort();
  const python = process.platform === 'win32' ? 'python' : 'python3';
  const script = resolve(process.cwd(), 'scripts', 'foundation_api.py');
  const child = spawn(python, [script, '--port', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
    stdio: 'pipe',
  });

  const stdout = createInterface({ input: child.stdout });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderr = `${stderr}${chunk}`.slice(-4_000);
  });

  await new Promise<void>((resolveReady, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      finish(new Error(`FOUNDATION_API_START_TIMEOUT:${stderr}`));
    }, 15_000);

    const finish = (error?: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      stdout.close();
      if (error === undefined) {
        resolveReady();
      } else {
        reject(error);
      }
    };

    stdout.on('line', (line) => {
      if (line === `FOUNDATION_API_READY ${port}`) {
        finish();
      }
    });
    child.once('error', (error) => finish(error));
    child.once('exit', (code) => {
      finish(new Error(`FOUNDATION_API_EXITED:${String(code)}:${stderr}`));
    });
  });

  return {
    baseUrl: `http://127.0.0.1:${port}/`,
    process: child,
  };
}

class FaultControlledTransport {
  networkDown = false;
  securityBlocked = false;
  expiredAccessToken: string | null = null;
  latestAccessToken: string | null = null;

  readonly send: Transport = async (url, init) => {
    if (this.securityBlocked) {
      throw new ClientError('SECURITY_BLOCKED');
    }
    if (this.networkDown) {
      throw new ClientError('NETWORK_UNAVAILABLE');
    }

    const authorization = new Headers(init.headers).get('Authorization');
    if (
      this.expiredAccessToken !== null &&
      authorization === `Bearer ${this.expiredAccessToken}`
    ) {
      return {
        status: 401,
        json: () => Promise.resolve({ detail: 'expired' }),
      };
    }

    const requestUrl = new URL(url);
    if (requestUrl.hostname === '127.0.0.1') {
      requestUrl.protocol = 'http:';
    }
    const response = await fetch(requestUrl, init);
    const text = await response.text();
    let payload: unknown = null;
    if (text.length > 0) {
      payload = JSON.parse(text) as unknown;
    }
    const path = requestUrl.pathname;
    if (
      response.ok &&
      (path.endsWith('/auth/login') || path.endsWith('/auth/refresh')) &&
      typeof payload === 'object' &&
      payload !== null &&
      'access_token' in payload &&
      typeof payload.access_token === 'string'
    ) {
      this.latestAccessToken = payload.access_token;
    }
    const transportResponse: TransportResponse = {
      status: response.status,
      json: () => Promise.resolve(payload),
    };
    return transportResponse;
  };
}

const noWaitTimer: SyncTimerPort = {
  setTimeout: () => Symbol('foundation-reconnect'),
  clearTimeout: () => undefined,
};

function cacheIdentity(userId: string): CacheIdentity {
  return {
    windowsSid: WINDOWS_SID,
    schoolId: SCHOOL_ID,
    userId,
  };
}

async function controlRequest<T>(
  baseUrl: string,
  path: string,
  method: 'GET' | 'POST' = 'GET',
): Promise<T> {
  const response = await fetch(new URL(path, baseUrl), { method });
  if (!response.ok) {
    throw new Error(`FOUNDATION_CONTROL_FAILED:${response.status}`);
  }
  return (await response.json()) as T;
}

describe.sequential('teacher client foundation', () => {
  let runningApi: RunningApi;
  let controls: FaultControlledTransport;
  let api: ApiClient;
  let credentialAdapter: MemoryKeytarAdapter;
  let credentialStore: CredentialStore;
  let cacheDatabase: MemoryCacheDatabase;
  let cacheRepository: CacheRepository;
  let activeAuth: AuthService;
  let offlineAuth: AuthService;
  let offlineSync: SyncService;
  let offlineEvents: SyncServiceEvent[] = [];

  const createAuth = (): AuthService =>
    new AuthService(api, credentialStore, ({ userId }) => {
      cacheRepository.deleteUser(SCHOOL_ID, userId);
      return Promise.resolve();
    });

  const createSync = (
    auth: AuthService,
    events: SyncServiceEvent[],
  ): SyncService =>
    new SyncService({
      auth,
      api,
      cache: cacheRepository,
      identityProvider: {
        forSession: (session) => Promise.resolve(cacheIdentity(session.userId)),
        forStoredCredential: async () => {
          const stored = await credentialStore.readActive();
          return stored === null ? null : cacheIdentity(stored.userId);
        },
      },
      emit: (event) => events.push(event),
      timer: noWaitTimer,
    });

  beforeAll(async () => {
    runningApi = await startFoundationApi();
    await controlRequest(runningApi.baseUrl, '/__test__/reset', 'POST');
    controls = new FaultControlledTransport();
    api = new ApiClient(
      parseServerPolicy({
        baseUrl: runningApi.baseUrl.replace('http:', 'https:'),
        schoolCode: SCHOOL_CODE,
        currentFingerprint: CURRENT_FINGERPRINT,
        nextFingerprint: null,
      }),
      controls.send,
    );
    credentialAdapter = new MemoryKeytarAdapter();
    credentialStore = new CredentialStore(credentialAdapter);
    cacheDatabase = new MemoryCacheDatabase();
    const cacheCrypto = CacheCrypto.open(
      'foundation.key',
      createSafeStorage(),
      createKeyFileStore(),
      (size) => Buffer.alloc(size, size === 32 ? 0x21 : 0x12),
    );
    cacheRepository = new CacheRepository(cacheDatabase, cacheCrypto);
    cacheRepository.initialize();
    activeAuth = createAuth();
    offlineAuth = createAuth();
    offlineSync = createSync(offlineAuth, offlineEvents);
  });

  afterAll(() => {
    offlineSync.stop();
    runningApi.process.kill();
  });

  it('foundation:first-login', async () => {
    const session = await activeAuth.login({
      schoolCode: SCHOOL_CODE,
      username: USERNAME,
      password: PASSWORD,
    });

    expect(session.userId).toBe(USER_ID);
    expect(await credentialStore.readActive()).not.toBeNull();
  });

  it('foundation:auto-login', async () => {
    const restarted = createAuth();
    const restored = await restarted.restoreSession();

    expect(restored?.userId).toBe(USER_ID);
    activeAuth = restarted;
  });

  it('foundation:single-refresh', async () => {
    const before = await controlRequest<{ refresh_count: number }>(
      runningApi.baseUrl,
      '/__test__/metrics',
    );
    controls.expiredAccessToken = controls.latestAccessToken;

    const [first, second] = await Promise.all([
      activeAuth.authenticatedRequest((token) => api.getCurrentUser(token)),
      activeAuth.authenticatedRequest((token) => api.getCurrentUser(token)),
    ]);
    const after = await controlRequest<{ refresh_count: number }>(
      runningApi.baseUrl,
      '/__test__/metrics',
    );

    expect(first.id).toBe(USER_ID);
    expect(second.id).toBe(USER_ID);
    expect(after.refresh_count - before.refresh_count).toBe(1);
    controls.expiredAccessToken = null;
  });

  it('foundation:permission-union', () => {
    const session = activeAuth.getSession();

    expect(session?.roles).toEqual(['teacher', 'teacher_lead']);
    expect(session?.permissions).toEqual(
      expect.arrayContaining([
        'dashboard.read',
        'calendar.read',
        'documents.read',
        'submissions.read',
      ]),
    );
  });

  it('foundation:offline-cache', async () => {
    const liveEvents: SyncServiceEvent[] = [];
    const liveSync = createSync(activeAuth, liveEvents);
    await liveSync.start();
    liveSync.stop();

    const storedRow = cacheDatabase.firstRow();
    expect(storedRow).not.toBeNull();
    expect(storedRow?.ciphertext.toString('utf8')).not.toContain('교무회의');

    controls.networkDown = true;
    offlineEvents = [];
    offlineAuth = createAuth();
    offlineSync = createSync(offlineAuth, offlineEvents);
    await offlineSync.start();

    expect(offlineSync.getState().kind).toBe('offline-readonly');
    const cached = offlineEvents.find(
      (event): event is Extract<SyncServiceEvent, { type: 'snapshot' }> =>
        event.type === 'snapshot' && event.source === 'cache',
    );
    expect(cached?.snapshot?.dashboard.generatedAt).toBeTruthy();
  });

  it('foundation:reconnection-summary', async () => {
    await controlRequest(
      runningApi.baseUrl,
      '/__test__/dashboard-version/2',
      'POST',
    );
    controls.networkDown = false;
    await offlineSync.retryNow();

    const summaryEvent = offlineEvents.find(
      (event): event is Extract<SyncServiceEvent, { type: 'summary' }> =>
        event.type === 'summary',
    );
    expect(offlineSync.getState().kind).toBe('online');
    expect(summaryEvent?.summary).toEqual({
      newScheduleCount: 1,
      changedScheduleCount: 1,
      newDocumentCount: 1,
      changedSubmissionCount: 1,
    });
    activeAuth = offlineAuth;
  });

  it('foundation:certificate-block', async () => {
    controls.securityBlocked = true;
    await offlineSync.retryNow();

    expect(offlineSync.getState()).toEqual({
      kind: 'security-blocked',
      code: 'CERTIFICATE_MISMATCH',
    });
    controls.securityBlocked = false;
  });

  it('foundation:logout-cleanup', async () => {
    await activeAuth.logout();

    expect(await credentialStore.readActive()).toBeNull();
    expect(cacheRepository.get(cacheIdentity(USER_ID))).toBeNull();
  });
});
