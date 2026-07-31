import { describe, expect, it } from 'vitest';

import {
  CacheCrypto,
  type KeyFileStore,
  type SafeStoragePort,
} from './cacheCrypto.js';

class MemoryKeyFileStore implements KeyFileStore {
  readonly files = new Map<string, Buffer>();

  readonly read = (path: string): Buffer | null => {
    const value = this.files.get(path);
    return value === undefined ? null : Buffer.from(value);
  };

  readonly writeAtomically = (path: string, value: Buffer): void => {
    this.files.set(path, Buffer.from(value));
  };
}

function createSafeStorage(available = true): SafeStoragePort {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (value) => Buffer.from(value.split('').reverse().join(''), 'utf8'),
    decryptString: (value) => value.toString('utf8').split('').reverse().join(''),
  };
}

function deterministicBytes(size: number): Buffer {
  return Buffer.alloc(size, size === 32 ? 7 : 11);
}

describe('CacheCrypto', () => {
  it('protects a persistent data key and performs authenticated encryption', () => {
    const keyFiles = new MemoryKeyFileStore();
    const crypto = CacheCrypto.open(
      'cache.key',
      createSafeStorage(),
      keyFiles,
      deterministicBytes,
    );

    const encrypted = crypto.encrypt(Buffer.from('{"count":3}', 'utf8'));
    expect(crypto.decrypt(encrypted).toString('utf8')).toBe('{"count":3}');
    expect(keyFiles.read('cache.key')).not.toBeNull();
    expect(keyFiles.read('cache.key')?.equals(Buffer.alloc(32, 7))).toBe(false);

    const reopened = CacheCrypto.open(
      'cache.key',
      createSafeStorage(),
      keyFiles,
      () => {
        throw new Error('persistent key should be reused');
      },
    );
    expect(reopened.decrypt(encrypted).toString('utf8')).toBe('{"count":3}');
  });

  it('rejects tampered ciphertext', () => {
    const crypto = CacheCrypto.open(
      'cache.key',
      createSafeStorage(),
      new MemoryKeyFileStore(),
      deterministicBytes,
    );
    const encrypted = crypto.encrypt(Buffer.from('sensitive dashboard', 'utf8'));
    const tampered = {
      ...encrypted,
      ciphertext: Buffer.from(encrypted.ciphertext),
    };
    tampered.ciphertext[0] = (tampered.ciphertext[0] ?? 0) ^ 1;

    expect(() => crypto.decrypt(tampered)).toThrow('CACHE_DECRYPT_FAILED');
  });

  it('refuses startup when Windows encryption is unavailable', () => {
    expect(() =>
      CacheCrypto.open(
        'cache.key',
        createSafeStorage(false),
        new MemoryKeyFileStore(),
        deterministicBytes,
      ),
    ).toThrow('DPAPI_UNAVAILABLE');
  });
});
