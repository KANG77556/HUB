import { describe, expect, it, vi } from 'vitest';

import type {
  CurrentUserResponse,
  ServerIdentityResponse,
  TokenPairResponse,
} from '../../shared/contracts.js';
import type { ServerPolicy } from '../config/serverPolicy.js';
import { ClientError } from '../network/apiClient.js';
import {
  ServerChangeService,
  type ServerChangeProbe,
  type ServerChangeServiceDependencies,
} from './serverChangeService.js';

const fingerprint = 'A'.repeat(64);
const nextFingerprint = 'B'.repeat(64);
const input = {
  baseUrl: 'https://new-school.example/',
  schoolCode: 'sample-school',
  currentFingerprint: fingerprint,
  nextFingerprint,
  adminUsername: 'administrator',
  adminPassword: 'correct horse battery staple',
};
const identity: ServerIdentityResponse = {
  service: 'schoolworkhub',
  api_version: 'v1',
  school_code: 'sample-school',
  school_name: '샘플학교',
};
const tokenPair: TokenPairResponse = {
  access_token: 'access-token',
  refresh_token: 'refresh-token-value-that-is-long-enough',
  token_type: 'bearer',
  expires_in_seconds: 900,
  refresh_expires_in_seconds: 2_592_000,
};
const administrator: CurrentUserResponse = {
  id: '3d594650-3436-4bc4-a593-8d9eea56f26d',
  school_id: '56fd4717-e330-4af5-a79e-65918e7bc054',
  school_name: '샘플학교',
  department_id: null,
  department_names: [],
  username: 'administrator',
  display_name: '학교 관리자',
  is_superuser: false,
  roles: ['administrator'],
  permissions: ['system.admin'],
};

function createHarness(overrides: {
  identity?: ServerIdentityResponse;
  loginError?: Error;
  user?: CurrentUserResponse;
  logoutError?: Error;
  replaceError?: Error;
} = {}): {
  service: ServerChangeService;
  probe: ServerChangeProbe;
  dependencies: ServerChangeServiceDependencies;
} {
  const probe: ServerChangeProbe = {
    getIdentity: vi
      .fn<ServerChangeProbe['getIdentity']>()
      .mockResolvedValue(overrides.identity ?? identity),
    login: overrides.loginError === undefined
      ? vi.fn<ServerChangeProbe['login']>().mockResolvedValue(tokenPair)
      : vi.fn<ServerChangeProbe['login']>().mockRejectedValue(overrides.loginError),
    getCurrentUser: vi
      .fn<ServerChangeProbe['getCurrentUser']>()
      .mockResolvedValue(overrides.user ?? administrator),
    logout: overrides.logoutError === undefined
      ? vi.fn<ServerChangeProbe['logout']>().mockResolvedValue(undefined)
      : vi.fn<ServerChangeProbe['logout']>().mockRejectedValue(overrides.logoutError),
    dispose: vi.fn<ServerChangeProbe['dispose']>().mockResolvedValue(undefined),
  };
  const replaceAtomically = vi.fn(
    async (candidate: ServerPolicy): Promise<ServerPolicy> => {
      if (overrides.replaceError !== undefined) {
        throw overrides.replaceError;
      }
      return candidate;
    },
  );
  const dependencies: ServerChangeServiceDependencies = {
    createProbe: vi
      .fn<ServerChangeServiceDependencies['createProbe']>()
      .mockResolvedValue(probe),
    policyStore: { replaceAtomically },
  };
  return {
    service: new ServerChangeService(dependencies),
    probe,
    dependencies,
  };
}

describe('ServerChangeService', () => {
  it('replaces the policy only after identity, administrator permission, and refresh revocation succeed', async () => {
    const { service, probe, dependencies } = createHarness();

    await expect(service.requestChange(input)).resolves.toBeUndefined();

    expect(dependencies.createProbe).toHaveBeenCalledWith({
      baseUrl: input.baseUrl,
      schoolCode: input.schoolCode,
      currentFingerprint: fingerprint,
      nextFingerprint,
    });
    expect(probe.login).toHaveBeenCalledWith({
      schoolCode: input.schoolCode,
      username: input.adminUsername,
      password: input.adminPassword,
    });
    expect(probe.getCurrentUser).toHaveBeenCalledWith(tokenPair.access_token);
    expect(probe.logout).toHaveBeenCalledWith(tokenPair.refresh_token);
    expect(dependencies.policyStore.replaceAtomically).toHaveBeenCalledTimes(1);
    expect(probe.dispose).toHaveBeenCalledTimes(1);
  });

  it('keeps the current policy when the candidate school identity does not match', async () => {
    const { service, probe, dependencies } = createHarness({
      identity: { ...identity, school_code: 'other-school' },
    });

    await expect(service.requestChange(input)).rejects.toMatchObject({
      code: 'SERVER_IDENTITY_INVALID',
    });

    expect(probe.login).not.toHaveBeenCalled();
    expect(dependencies.policyStore.replaceAtomically).not.toHaveBeenCalled();
    expect(probe.dispose).toHaveBeenCalledTimes(1);
  });

  it('maps rejected administrator credentials to a safe failure and preserves the policy', async () => {
    const { service, dependencies } = createHarness({
      loginError: new ClientError('AUTHENTICATION_REQUIRED'),
    });

    await expect(service.requestChange(input)).rejects.toMatchObject({
      code: 'ADMIN_AUTHENTICATION_FAILED',
    });
    expect(dependencies.policyStore.replaceAtomically).not.toHaveBeenCalled();
  });

  it('requires system.admin and revokes the temporary refresh session before failing', async () => {
    const { service, probe, dependencies } = createHarness({
      user: { ...administrator, permissions: ['users.manage'] },
    });

    await expect(service.requestChange(input)).rejects.toMatchObject({
      code: 'ADMIN_PERMISSION_REQUIRED',
    });

    expect(probe.logout).toHaveBeenCalledWith(tokenPair.refresh_token);
    expect(dependencies.policyStore.replaceAtomically).not.toHaveBeenCalled();
    expect(probe.dispose).toHaveBeenCalledTimes(1);
  });

  it('does not replace the current policy when temporary-session revocation fails', async () => {
    const { service, probe, dependencies } = createHarness({
      logoutError: new ClientError('NETWORK_UNAVAILABLE'),
    });

    await expect(service.requestChange(input)).rejects.toMatchObject({
      code: 'NETWORK_UNAVAILABLE',
    });

    expect(dependencies.policyStore.replaceAtomically).not.toHaveBeenCalled();
    expect(probe.logout).toHaveBeenCalled();
    expect(probe.dispose).toHaveBeenCalledTimes(1);
  });

  it('surfaces an atomic-write failure without exposing or mutating the submitted credentials', async () => {
    const writeFailure = new Error('disk path and raw operating-system details');
    const { service, dependencies } = createHarness({ replaceError: writeFailure });

    await expect(service.requestChange(input)).rejects.toBe(writeFailure);
    expect(dependencies.policyStore.replaceAtomically).toHaveBeenCalledTimes(1);
    expect(input.adminPassword).toBe('correct horse battery staple');
  });
});
