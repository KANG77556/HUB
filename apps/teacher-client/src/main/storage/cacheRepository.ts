import { createHash } from 'node:crypto';

import { z } from 'zod';

import type { EncryptedPayload } from '../security/cacheCrypto.js';

const CACHE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const cacheItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  updatedAt: z.string().min(1),
});

export const offlineCacheSnapshotSchema = z.object({
  dashboard: z.object({
    generatedAt: z.string().min(1),
    metrics: z.array(
      z.object({
        key: z.string(),
        count: z.number().int().nonnegative(),
      }),
    ),
  }),
  scheduleItems: z.array(cacheItemSchema),
  documentItems: z.array(cacheItemSchema),
  submissionSummary: z.object({
    pendingCount: z.number().int().nonnegative(),
  }),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
  lastSyncAt: z.string().min(1),
});

export type OfflineCacheSnapshot = z.infer<typeof offlineCacheSnapshotSchema>;

export type CacheIdentity = {
  windowsSid: string;
  schoolId: string;
  userId: string;
};

export type CacheRow = {
  identityKey: string;
  schoolId: string;
  userId: string;
  capturedAt: string;
  expiresAt: string;
  nonce: Buffer;
  authTag: Buffer;
  ciphertext: Buffer;
};

export type CacheDatabase = {
  exec: (sql: string) => void;
  upsert: (row: CacheRow) => void;
  find: (identityKey: string) => CacheRow | null;
  deleteIdentity: (identityKey: string) => void;
  deleteUser: (schoolId: string, userId: string) => void;
  pruneExpired: (cutoffIso: string) => number;
};

export type CacheCryptoPort = {
  encrypt: (plaintext: Buffer) => EncryptedPayload;
  decrypt: (payload: EncryptedPayload) => Buffer;
};

export const CACHE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS cache_entries (
  identity_key TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  nonce BLOB NOT NULL,
  auth_tag BLOB NOT NULL,
  ciphertext BLOB NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_cache_entries_expiry ON cache_entries(expires_at);
CREATE INDEX IF NOT EXISTS ix_cache_entries_user ON cache_entries(school_id, user_id);
`;

export function createCacheIdentityKey(identity: CacheIdentity): string {
  return createHash('sha256')
    .update(`${identity.windowsSid}:${identity.schoolId}:${identity.userId}`, 'utf8')
    .digest('hex');
}

export class CacheRepository {
  constructor(
    private readonly database: CacheDatabase,
    private readonly crypto: CacheCryptoPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  initialize(): void {
    this.database.exec(CACHE_SCHEMA_SQL);
  }

  put(identity: CacheIdentity, snapshot: OfflineCacheSnapshot): void {
    const validatedSnapshot = offlineCacheSnapshotSchema.parse(snapshot);
    const capturedAt = this.now();
    const expiresAt = new Date(capturedAt.getTime() + CACHE_RETENTION_MS);
    const encrypted = this.crypto.encrypt(
      Buffer.from(JSON.stringify(validatedSnapshot), 'utf8'),
    );
    this.database.upsert({
      identityKey: createCacheIdentityKey(identity),
      schoolId: identity.schoolId,
      userId: identity.userId,
      capturedAt: capturedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      nonce: encrypted.nonce,
      authTag: encrypted.authTag,
      ciphertext: encrypted.ciphertext,
    });
  }

  get(identity: CacheIdentity): OfflineCacheSnapshot | null {
    const identityKey = createCacheIdentityKey(identity);
    const row = this.database.find(identityKey);
    if (row === null) {
      return null;
    }

    const expiry = Date.parse(row.expiresAt);
    if (
      row.schoolId !== identity.schoolId ||
      row.userId !== identity.userId ||
      !Number.isFinite(expiry) ||
      expiry <= this.now().getTime()
    ) {
      this.database.deleteIdentity(identityKey);
      return null;
    }

    try {
      const plaintext = this.crypto.decrypt({
        nonce: row.nonce,
        authTag: row.authTag,
        ciphertext: row.ciphertext,
      });
      const parsed: unknown = JSON.parse(plaintext.toString('utf8'));
      return offlineCacheSnapshotSchema.parse(parsed);
    } catch {
      this.database.deleteIdentity(identityKey);
      return null;
    }
  }

  pruneExpired(): number {
    return this.database.pruneExpired(this.now().toISOString());
  }

  deleteUser(schoolId: string, userId: string): void {
    this.database.deleteUser(schoolId, userId);
  }
}

type NativeRunResult = {
  changes: number | bigint;
};

type NativeStatement = {
  run: (...parameters: readonly unknown[]) => NativeRunResult;
  get: (...parameters: readonly unknown[]) => unknown;
};

type NativeDatabase = {
  exec: (sql: string) => void;
  prepare: (sql: string) => NativeStatement;
};

type NativeDatabaseConstructor = new (path: string) => NativeDatabase;

function parseNativeRow(value: unknown): CacheRow | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'object') {
    throw new Error('CACHE_DATABASE_ROW_INVALID');
  }
  const row = value as Record<string, unknown>;
  const identityKey = row.identity_key;
  const schoolId = row.school_id;
  const userId = row.user_id;
  const capturedAt = row.captured_at;
  const expiresAt = row.expires_at;
  const nonce = row.nonce;
  const authTag = row.auth_tag;
  const ciphertext = row.ciphertext;
  if (
    typeof identityKey !== 'string' ||
    typeof schoolId !== 'string' ||
    typeof userId !== 'string' ||
    typeof capturedAt !== 'string' ||
    typeof expiresAt !== 'string' ||
    !Buffer.isBuffer(nonce) ||
    !Buffer.isBuffer(authTag) ||
    !Buffer.isBuffer(ciphertext)
  ) {
    throw new Error('CACHE_DATABASE_ROW_INVALID');
  }
  return {
    identityKey,
    schoolId,
    userId,
    capturedAt,
    expiresAt,
    nonce: Buffer.from(nonce),
    authTag: Buffer.from(authTag),
    ciphertext: Buffer.from(ciphertext),
  };
}

export class BetterSqliteCacheDatabase implements CacheDatabase {
  constructor(private readonly database: NativeDatabase) {}

  exec(sql: string): void {
    this.database.exec(sql);
  }

  upsert(row: CacheRow): void {
    this.database
      .prepare(
        `INSERT INTO cache_entries (
          identity_key, school_id, user_id, captured_at, expires_at,
          nonce, auth_tag, ciphertext
        ) VALUES (
          @identityKey, @schoolId, @userId, @capturedAt, @expiresAt,
          @nonce, @authTag, @ciphertext
        )
        ON CONFLICT(identity_key) DO UPDATE SET
          school_id = excluded.school_id,
          user_id = excluded.user_id,
          captured_at = excluded.captured_at,
          expires_at = excluded.expires_at,
          nonce = excluded.nonce,
          auth_tag = excluded.auth_tag,
          ciphertext = excluded.ciphertext`,
      )
      .run(row);
  }

  find(identityKey: string): CacheRow | null {
    const value = this.database
      .prepare(
        `SELECT identity_key, school_id, user_id, captured_at, expires_at,
                nonce, auth_tag, ciphertext
         FROM cache_entries
         WHERE identity_key = ?`,
      )
      .get(identityKey);
    return parseNativeRow(value);
  }

  deleteIdentity(identityKey: string): void {
    this.database
      .prepare('DELETE FROM cache_entries WHERE identity_key = ?')
      .run(identityKey);
  }

  deleteUser(schoolId: string, userId: string): void {
    this.database
      .prepare('DELETE FROM cache_entries WHERE school_id = ? AND user_id = ?')
      .run(schoolId, userId);
  }

  pruneExpired(cutoffIso: string): number {
    const result = this.database
      .prepare('DELETE FROM cache_entries WHERE expires_at <= ?')
      .run(cutoffIso);
    return Number(result.changes);
  }
}

function resolveDatabaseConstructor(moduleValue: unknown): NativeDatabaseConstructor {
  if (typeof moduleValue !== 'object' || moduleValue === null) {
    throw new Error('SQLITE_MODULE_INVALID');
  }
  const defaultExport: unknown = (moduleValue as { default?: unknown }).default;
  if (typeof defaultExport !== 'function') {
    throw new Error('SQLITE_MODULE_INVALID');
  }
  return defaultExport as NativeDatabaseConstructor;
}

export async function openSqliteCacheDatabase(
  path: string,
): Promise<BetterSqliteCacheDatabase> {
  const moduleValue: unknown = await import('better-sqlite3');
  const DatabaseConstructor = resolveDatabaseConstructor(moduleValue);
  return new BetterSqliteCacheDatabase(new DatabaseConstructor(path));
}
