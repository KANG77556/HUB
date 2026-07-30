import { z } from 'zod';

const SERVICE = 'SchoolWorkHub.TeacherClient';
const ACCOUNT = 'active-session';

export const storedSessionSchema = z.object({
  schoolCode: z.string().min(2).max(30),
  userId: z.string().uuid(),
  refreshToken: z.string().min(32).max(512),
});

export type StoredSession = z.infer<typeof storedSessionSchema>;

export type KeytarAdapter = {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
};

export class CredentialStore {
  public constructor(private readonly adapter: KeytarAdapter) {}

  public async readActive(): Promise<StoredSession | null> {
    const stored = await this.adapter.getPassword(SERVICE, ACCOUNT);
    if (stored === null) {
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stored) as unknown;
    } catch {
      await this.adapter.deletePassword(SERVICE, ACCOUNT);
      return null;
    }

    const result = storedSessionSchema.safeParse(parsed);
    if (!result.success) {
      await this.adapter.deletePassword(SERVICE, ACCOUNT);
      return null;
    }
    return result.data;
  }

  public async writeActive(session: StoredSession): Promise<void> {
    const validated = storedSessionSchema.parse(session);
    await this.adapter.setPassword(SERVICE, ACCOUNT, JSON.stringify(validated));
  }

  public async deleteActive(): Promise<boolean> {
    return this.adapter.deletePassword(SERVICE, ACCOUNT);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isKeytarAdapter(value: unknown): value is KeytarAdapter {
  return (
    isRecord(value) &&
    typeof value.getPassword === 'function' &&
    typeof value.setPassword === 'function' &&
    typeof value.deletePassword === 'function'
  );
}

export async function createWindowsCredentialStore(): Promise<CredentialStore> {
  const loaded: unknown = await import('@github/keytar');
  const candidate = isRecord(loaded) && 'default' in loaded ? loaded.default : loaded;
  if (!isKeytarAdapter(candidate)) {
    throw new Error('Windows credential storage is unavailable');
  }
  return new CredentialStore(candidate);
}
