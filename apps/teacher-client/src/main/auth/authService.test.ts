import { describe, expect, it, vi } from 'vitest';

import {
  AuthService,
  type AuthApi,
  type CredentialStorePort,
} from './authService.js';
import { ClientError } from '../network/apiClient.js';

const firstTokenPair = {
  access_token: 'access-token-1',
  refresh_token: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG',
  token_type: 'bearer' as const,
  expires_in_seconds: 900,
  refresh_expires_in_seconds: 2_592_000,
};
const secondTokenPair = {
  ...firstTokenPair,
  access_token: 'access-token-2',
  refresh_token: 'ZYXWVUTSRQPONMLKJIHGFEDCBA9876543210abcdefg',
};
const currentUser = {
  id: '3d594650-3436-4bc4-a593-8d9eea56f26d',
  school_id: 'eaa2e969-48ce-44c1-a2e0-a2dcbe074e5a',
  school_name: '샘플학교',
  department_id: null,
  department_names: ['교무부'],
  username: 'teacher',
  display_name: '김선생',
  is_superuser: false,
  roles: ['teacher', 'teacher_lead'],
  permissions: ['calendar.read', 'documents.read'],
};

function createCredentialStore(initialRefreshToken = firstTokenPair.refresh_token) {
  const readActive = vi.fn<CredentialStorePort['readActive']>().mockResolvedValue({
    schoolCode: 'sample-school',
    userId: currentUser.id,
    refreshToken: initialRefreshToken,
  });
  const writeActive = vi.fn<CredentialStorePort['writeActive']>().mockResolvedValue(undefined);
  const deleteActive = vi.fn<CredentialStorePort['deleteActive']>().mockResolvedValue(true);
  const store: CredentialStorePort = { readActive, writeActive, deleteActive };
  return { store, readActive, writeActive, deleteActive };
}

function createAuthApi(overrides: Partial<AuthApi> = {}) {
  const login = vi.fn<AuthApi['login']>().mockResolvedValue(firstTokenPair);
  const refresh = vi.fn<AuthApi['refresh']>().mockResolvedValue(secondTokenPair);
  const logout = vi.fn<AuthApi['logout']>().mockResolvedValue(undefined);
  const getCurrentUser = vi.fn<AuthApi['getCurrentUser']>().mockResolvedValue(currentUser);
  const api: AuthApi = { login, refresh, logout, getCurrentUser, ...overrides };
  return { api, login, refresh, logout, getCurrentUser };
}

describe('AuthService', () => {
  it('stores only the refresh credential and returns a token-free session view', async () => {
    const { api } = createAuthApi();
    const { store, writeActive } = createCredentialStore();
    const clearCachedUser = vi.fn().mockResolvedValue(undefined);
    const service = new AuthService(api, store, clearCachedUser);

    const session = await service.login({
      schoolCode: 'sample-school',
      username: 'teacher',
      password: 'password',
    });

    expect(session).toEqual({
      userId: currentUser.id,
      displayName: '김선생',
      schoolName: '샘플학교',
      departmentNames: ['교무부'],
      roles: ['teacher', 'teacher_lead'],
      permissions: ['calendar.read', 'documents.read'],
    });
    expect(session).not.toHaveProperty('accessToken');
    expect(session).not.toHaveProperty('refreshToken');
    expect(writeActive).toHaveBeenCalledWith({
      schoolCode: 'sample-school',
      userId: currentUser.id,
      refreshToken: firstTokenPair.refresh_token,
    });
    await expect(
      service.authenticatedRequest((token) => Promise.resolve(token)),
    ).resolves.toBe('access-token-1');
  });

  it('restores a session by rotating and overwriting the refresh credential', async () => {
    const { api, refresh } = createAuthApi();
    const { store, writeActive } = createCredentialStore();
    const service = new AuthService(api, store, vi.fn().mockResolvedValue(undefined));

    await expect(service.restoreSession()).resolves.toMatchObject({ userId: currentUser.id });

    expect(refresh).toHaveBeenCalledWith(firstTokenPair.refresh_token);
    expect(writeActive).toHaveBeenCalledWith({
      schoolCode: 'sample-school',
      userId: currentUser.id,
      refreshToken: secondTokenPair.refresh_token,
    });
  });

  it('performs one refresh for three concurrent 401 responses and retries each once', async () => {
    const { api, refresh } = createAuthApi();
    const { store } = createCredentialStore();
    const service = new AuthService(api, store, vi.fn().mockResolvedValue(undefined));
    await service.login({ schoolCode: 'sample-school', username: 'teacher', password: 'password' });

    let successfulRetries = 0;
    const operation = vi.fn((token: string): Promise<string> => {
      if (token === firstTokenPair.access_token) {
        return Promise.reject(new ClientError('AUTHENTICATION_REQUIRED'));
      }
      successfulRetries += 1;
      return Promise.resolve(token);
    });

    const results = await Promise.all([
      service.authenticatedRequest(operation),
      service.authenticatedRequest(operation),
      service.authenticatedRequest(operation),
    ]);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(successfulRetries).toBe(3);
    expect(results).toEqual(['access-token-2', 'access-token-2', 'access-token-2']);
  });

  it('preserves offline credentials on network failure but clears rejected sessions', async () => {
    const networkApi = createAuthApi({
      refresh: vi.fn().mockRejectedValue(new ClientError('NETWORK_UNAVAILABLE')),
    }).api;
    const networkCredential = createCredentialStore();
    const networkCleanup = vi.fn().mockResolvedValue(undefined);
    const networkService = new AuthService(
      networkApi,
      networkCredential.store,
      networkCleanup,
    );

    await expect(networkService.restoreSession()).rejects.toMatchObject({
      code: 'NETWORK_UNAVAILABLE',
    });
    expect(networkCredential.deleteActive).not.toHaveBeenCalled();
    expect(networkCleanup).not.toHaveBeenCalled();

    const rejectedApi = createAuthApi({
      refresh: vi.fn().mockRejectedValue(new ClientError('AUTHENTICATION_REQUIRED')),
    }).api;
    const rejectedCredential = createCredentialStore();
    const rejectedCleanup = vi.fn().mockResolvedValue(undefined);
    const rejectedService = new AuthService(
      rejectedApi,
      rejectedCredential.store,
      rejectedCleanup,
    );

    await expect(rejectedService.restoreSession()).rejects.toMatchObject({
      code: 'AUTHENTICATION_REQUIRED',
    });
    expect(rejectedCredential.deleteActive).toHaveBeenCalledTimes(1);
    expect(rejectedCleanup).toHaveBeenCalledWith({
      schoolCode: 'sample-school',
      userId: currentUser.id,
    });
  });

  it('always clears memory, credential, and cache during logout', async () => {
    const logoutFailure = vi.fn<AuthApi['logout']>().mockRejectedValue(new Error('offline'));
    const { api } = createAuthApi({ logout: logoutFailure });
    const { store, deleteActive } = createCredentialStore();
    const clearCachedUser = vi.fn().mockResolvedValue(undefined);
    const service = new AuthService(api, store, clearCachedUser);
    await service.login({ schoolCode: 'sample-school', username: 'teacher', password: 'password' });

    await service.logout();

    expect(deleteActive).toHaveBeenCalledTimes(1);
    expect(clearCachedUser).toHaveBeenCalledWith({
      schoolCode: 'sample-school',
      userId: currentUser.id,
    });
    await expect(
      service.authenticatedRequest((token) => Promise.resolve(token)),
    ).rejects.toMatchObject({
      code: 'AUTHENTICATION_REQUIRED',
    });
  });
});
