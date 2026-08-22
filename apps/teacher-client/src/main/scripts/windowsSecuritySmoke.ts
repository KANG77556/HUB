import { randomBytes, randomUUID } from 'node:crypto';

import { app, safeStorage } from 'electron';

const SERVICE = 'SchoolWorkHub.TeacherClient.SecuritySmoke';

type KeytarPort = {
  getPassword: (service: string, account: string) => Promise<string | null>;
  setPassword: (service: string, account: string, password: string) => Promise<void>;
  deletePassword: (service: string, account: string) => Promise<boolean>;
};

class SmokeFailure extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'SmokeFailure';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isKeytarPort(value: unknown): value is KeytarPort {
  return (
    isRecord(value) &&
    typeof value.getPassword === 'function' &&
    typeof value.setPassword === 'function' &&
    typeof value.deletePassword === 'function'
  );
}

async function loadKeytar(): Promise<KeytarPort> {
  const loaded: unknown = await import('@github/keytar');
  const candidate = isRecord(loaded) && 'default' in loaded ? loaded.default : loaded;
  if (!isKeytarPort(candidate)) {
    throw new SmokeFailure('KEYTAR_UNAVAILABLE');
  }
  return candidate;
}

function requireCondition(condition: boolean, code: string): void {
  if (!condition) {
    throw new SmokeFailure(code);
  }
}

async function runSmoke(): Promise<void> {
  if (process.platform !== 'win32') {
    throw new SmokeFailure('WINDOWS_REQUIRED');
  }

  await app.whenReady();
  requireCondition(safeStorage.isEncryptionAvailable(), 'DPAPI_UNAVAILABLE');

  const keytar = await loadKeytar();
  const account = `security-smoke-${randomUUID()}`;
  const secret = randomBytes(48).toString('base64url');
  let credentialCreated = false;

  try {
    const protectedValue = safeStorage.encryptString(secret);
    requireCondition(protectedValue.length > 0, 'DPAPI_ENCRYPT_FAILED');
    requireCondition(
      safeStorage.decryptString(protectedValue) === secret,
      'DPAPI_ROUNDTRIP_FAILED',
    );

    await keytar.setPassword(SERVICE, account, secret);
    credentialCreated = true;
    requireCondition(
      (await keytar.getPassword(SERVICE, account)) === secret,
      'CREDENTIAL_ROUNDTRIP_FAILED',
    );

    requireCondition(
      await keytar.deletePassword(SERVICE, account),
      'CREDENTIAL_DELETE_FAILED',
    );
    credentialCreated = false;
    requireCondition(
      (await keytar.getPassword(SERVICE, account)) === null,
      'CREDENTIAL_DELETE_VERIFICATION_FAILED',
    );

    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        checks: [
          'credential-write-read-delete',
          'dpapi-encrypt-decrypt',
        ],
      })}\n`,
    );
  } finally {
    if (credentialCreated) {
      await keytar.deletePassword(SERVICE, account).catch(() => false);
    }
  }
}

void runSmoke()
  .catch((error: unknown) => {
    const code = error instanceof SmokeFailure
      ? error.code
      : 'WINDOWS_SECURITY_SMOKE_FAILED';
    process.stderr.write(`${JSON.stringify({ ok: false, code })}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    app.quit();
  });
