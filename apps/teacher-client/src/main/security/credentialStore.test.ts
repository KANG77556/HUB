import { describe, expect, it, vi } from 'vitest';

import { CredentialStore, type KeytarAdapter } from './credentialStore.js';

function createAdapter(storedValue: string | null = null): KeytarAdapter {
  return {
    getPassword: vi.fn().mockResolvedValue(storedValue),
    setPassword: vi.fn().mockResolvedValue(undefined),
    deletePassword: vi.fn().mockResolvedValue(true),
  };
}

const payload = {
  schoolCode: 'sample-school',
  userId: '3d594650-3436-4bc4-a593-8d9eea56f26d',
  refreshToken: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG',
};

describe('CredentialStore', () => {
  it('writes and reads the active refresh session with fixed identifiers', async () => {
    const adapter = createAdapter(JSON.stringify(payload));
    const store = new CredentialStore(adapter);

    await store.writeActive(payload);
    expect(adapter.setPassword).toHaveBeenCalledWith(
      'SchoolWorkHub.TeacherClient',
      'active-session',
      JSON.stringify(payload),
    );
    await expect(store.readActive()).resolves.toEqual(payload);
  });

  it('returns null when no active credential exists', async () => {
    const store = new CredentialStore(createAdapter(null));
    await expect(store.readActive()).resolves.toBeNull();
  });

  it('deletes malformed stored values without exposing their contents', async () => {
    const adapter = createAdapter('{"refreshToken":"too-short"}');
    const store = new CredentialStore(adapter);

    await expect(store.readActive()).resolves.toBeNull();
    expect(adapter.deletePassword).toHaveBeenCalledWith(
      'SchoolWorkHub.TeacherClient',
      'active-session',
    );
  });

  it('deletes the active credential', async () => {
    const adapter = createAdapter();
    const store = new CredentialStore(adapter);

    await expect(store.deleteActive()).resolves.toBe(true);
    expect(adapter.deletePassword).toHaveBeenCalledWith(
      'SchoolWorkHub.TeacherClient',
      'active-session',
    );
  });
});
