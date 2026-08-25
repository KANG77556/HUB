import {
  createCipheriv,
  createDecipheriv,
  randomBytes as nodeRandomBytes,
} from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';

export type SafeStoragePort = {
  isEncryptionAvailable: () => boolean;
  encryptString: (value: string) => Buffer;
  decryptString: (value: Buffer) => string;
};

export type KeyFileStore = {
  read: (path: string) => Buffer | null;
  writeAtomically: (path: string, value: Buffer) => void;
};

export type EncryptedPayload = {
  nonce: Buffer;
  authTag: Buffer;
  ciphertext: Buffer;
};

export type RandomBytesSource = (size: number) => Buffer;

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export const nodeKeyFileStore: KeyFileStore = {
  read: (path) => {
    try {
      return readFileSync(path);
    } catch (error: unknown) {
      if (isMissingFile(error)) {
        return null;
      }
      throw error;
    }
  },
  writeAtomically: (path, value) => {
    mkdirSync(dirname(path), { recursive: true });
    const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
    try {
      writeFileSync(temporaryPath, value, { flag: 'wx', mode: 0o600 });
      renameSync(temporaryPath, path);
      chmodSync(path, 0o600);
    } catch (error: unknown) {
      rmSync(temporaryPath, { force: true });
      throw error;
    }
  },
};

export class CacheCrypto {
  private constructor(
    private readonly dataKey: Buffer,
    private readonly randomBytes: RandomBytesSource,
  ) {}

  static open(
    keyPath: string,
    safeStorage: SafeStoragePort,
    keyFileStore: KeyFileStore = nodeKeyFileStore,
    randomBytes: RandomBytesSource = nodeRandomBytes,
  ): CacheCrypto {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('DPAPI_UNAVAILABLE');
    }

    const protectedKey = keyFileStore.read(keyPath);
    if (protectedKey === null) {
      const dataKey = randomBytes(32);
      if (dataKey.length !== 32) {
        throw new Error('CACHE_KEY_GENERATION_FAILED');
      }
      try {
        keyFileStore.writeAtomically(
          keyPath,
          safeStorage.encryptString(dataKey.toString('base64')),
        );
      } catch (error: unknown) {
        throw new Error('CACHE_KEY_PROTECT_FAILED', { cause: error });
      }
      return new CacheCrypto(Buffer.from(dataKey), randomBytes);
    }

    try {
      const dataKey = Buffer.from(safeStorage.decryptString(protectedKey), 'base64');
      if (dataKey.length !== 32) {
        throw new Error('invalid protected key length');
      }
      return new CacheCrypto(dataKey, randomBytes);
    } catch (error: unknown) {
      throw new Error('CACHE_KEY_UNWRAP_FAILED', { cause: error });
    }
  }

  encrypt(plaintext: Buffer): EncryptedPayload {
    const nonce = this.randomBytes(12);
    if (nonce.length !== 12) {
      throw new Error('CACHE_NONCE_GENERATION_FAILED');
    }
    const cipher = createCipheriv('aes-256-gcm', this.dataKey, nonce);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return {
      nonce: Buffer.from(nonce),
      authTag: cipher.getAuthTag(),
      ciphertext,
    };
  }

  decrypt(payload: EncryptedPayload): Buffer {
    try {
      if (payload.nonce.length !== 12 || payload.authTag.length !== 16) {
        throw new Error('invalid encrypted payload');
      }
      const decipher = createDecipheriv('aes-256-gcm', this.dataKey, payload.nonce);
      decipher.setAuthTag(payload.authTag);
      return Buffer.concat([decipher.update(payload.ciphertext), decipher.final()]);
    } catch (error: unknown) {
      throw new Error('CACHE_DECRYPT_FAILED', { cause: error });
    }
  }
}
