import { describe, expect, it } from 'vitest';

import { CacheCrypto, type KeyFileStore, type SafeStoragePort } from '../security/cacheCrypto.js';
import {
  CACHE_SCHEMA_SQL,
  CacheRepository,
  type CacheDatabase,
  type CacheIdentity,
  type CacheRow,
  type OfflineCacheSnapshot,
} from './cacheRepository.js';

class MemoryKeyFileStore implements KeyFileStore {
  private readonly files = new Map<string, Buffer>();

  readonly read = (path: string): Buffer | null => {
    const value = this.files.get(path);
    return value === undefined ? null : Buffer.from(value);
  };

  readonly writeAtomically = (path: string, value: Buffer): void => {
    this.files.set(path, Buffer.from(value));
  };
}

class MemoryCacheDatabase implements CacheDatabase {
  readonly rows = new Map<string, CacheRow>();
  schema = '';

  readonly exec = (sql: string): void => {
    this.schema = sql;
  };

  readonly upsert = (row: CacheRow): void => {
    this.rows.set(row.identityKey, cloneRow(row));
  };

  readonly find = (identityKey: string): CacheRow | null => {
    const row = this.rows.get(identityKey);
    return row === undefined ? null : cloneRow(row);
  };

  readonly deleteIdentity = (identityKey: string): void => {
    this.rows.delete(identityKey);
  };

  readonly deleteUser = (schoolId: string, userId: string): void => {
    for (const [key, row] of this.rows) {
      if (row.schoolId === schoolId && row.userId === userId) {
        this.rows.delete(key);
      }
    }
  };

  readonly pruneExpired = (cutoffIso: string): number => {
    let deleted = 0;
    for (const [key, row] of this.rows) {
      if (row.expiresAt <= cutoffIso) {
        this.rows.delete(key);
        deleted += 1;
      }
    }
    return deleted;
  };
}

function cloneRow(row: CacheRow): CacheRow {
  return {
    ...row,
    nonce: Buffer.from(row.nonce),
    authTag: Buffer.from(row.authTag),
    ciphertext: Buffer.from(row.ciphertext),
  };
}

function createCrypto(): CacheCrypto {
  const safeStorage: SafeStoragePort = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(value.split('').reverse().join(''), 'utf8'),
    decryptString: (value) => value.toString('utf8').split('').reverse().join(''),
  };
  return CacheCrypto.open(
    'cache.key',
    safeStorage,
    new MemoryKeyFileStore(),
    (size) => Buffer.alloc(size, size === 32 ? 5 : 13),
  );
}

const identity: CacheIdentity = {
  windowsSid: 'S-1-5-21-111-222-333-1001',
  schoolId: 'eaa2e969-48ce-44c1-a2e0-a2dcbe074e5a',
  userId: '3d594650-3436-4bc4-a593-8d9eea56f26d',
};

const snapshot: OfflineCacheSnapshot = {
  dashboard: {
    generatedAt: '2026-07-30T08:00:00.000Z',
    metrics: [
      { key: 'documents.new', count: 3 },
      { key: 'schedule.today', count: 2 },
    ],
  },
  scheduleItems: [
    {
      id: 'schedule-1',
      title: '교무회의',
      status: 'confirmed',
      updatedAt: '2026-07-30T07:00:00.000Z',
    },
  ],
  documentItems: [
    {
      id: 'document-1',
      title: '업무분장표',
      status: 'new',
      updatedAt: '2026-07-30T07:30:00.000Z',
    },
  ],
  submissionSummary: { pendingCount: 4 },
  roles: ['teacher', 'teacher_lead'],
  permissions: ['calendar.read', 'documents.read', 'submissions.read'],
  lastSyncAt: '2026-07-30T08:00:00.000Z',
};

describe('CacheRepository', () => {
  it('initializes the required SQLite table and indexes', () => {
    const database = new MemoryCacheDatabase();
    const repository = new CacheRepository(database, createCrypto());

    repository.initialize();

    expect(database.schema).toBe(CACHE_SCHEMA_SQL);
    expect(database.schema).toContain('CREATE TABLE IF NOT EXISTS cache_entries');
    expect(database.schema).toContain('ix_cache_entries_expiry');
    expect(database.schema).toContain('ix_cache_entries_user');
  });

  it('stores one encrypted, identity-bound snapshot for 30 days', () => {
    const database = new MemoryCacheDatabase();
    const now = new Date('2026-07-30T08:00:00.000Z');
    const repository = new CacheRepository(database, createCrypto(), () => now);
    repository.initialize();

    repository.put(identity, snapshot);

    expect(repository.get(identity)).toEqual(snapshot);
    expect(
      repository.get({
        ...identity,
        windowsSid: 'S-1-5-21-999-888-777-1009',
      }),
    ).toBeNull();
    const storedRow = [...database.rows.values()][0];
    expect(storedRow?.expiresAt).toBe('2026-08-29T08:00:00.000Z');
    expect(storedRow?.ciphertext.toString('utf8')).not.toContain('교무회의');
  });

  it('deletes expired or tampered rows instead of returning stale data', () => {
    const database = new MemoryCacheDatabase();
    let now = new Date('2026-07-30T08:00:00.000Z');
    const repository = new CacheRepository(database, createCrypto(), () => now);
    repository.initialize();
    repository.put(identity, snapshot);

    now = new Date('2026-08-30T08:00:00.000Z');
    expect(repository.get(identity)).toBeNull();
    expect(database.rows.size).toBe(0);

    now = new Date('2026-07-30T08:00:00.000Z');
    repository.put(identity, snapshot);
    const row = [...database.rows.values()][0];
    if (row === undefined) {
      throw new Error('expected cache row');
    }
    row.ciphertext[0] = (row.ciphertext[0] ?? 0) ^ 1;

    expect(repository.get(identity)).toBeNull();
    expect(database.rows.size).toBe(0);
  });

  it('prunes by expiry and deletes every SID-bound row for a logged-out user', () => {
    const database = new MemoryCacheDatabase();
    let now = new Date('2026-07-30T08:00:00.000Z');
    const repository = new CacheRepository(database, createCrypto(), () => now);
    repository.initialize();
    repository.put(identity, snapshot);
    repository.put({ ...identity, windowsSid: 'S-1-5-21-444-555-666-1002' }, snapshot);

    repository.deleteUser(identity.schoolId, identity.userId);
    expect(database.rows.size).toBe(0);

    repository.put(identity, snapshot);
    now = new Date('2026-08-30T08:00:00.000Z');
    expect(repository.pruneExpired()).toBe(1);
    expect(database.rows.size).toBe(0);
  });
});
