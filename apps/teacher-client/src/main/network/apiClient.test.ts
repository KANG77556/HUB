import { describe, expect, it, vi } from 'vitest';

import { ApiClient, type Transport } from './apiClient.js';
import type { ServerPolicy } from '../config/serverPolicy.js';

const policy: ServerPolicy = {
  baseUrl: 'https://school.example:8443/',
  schoolCode: 'sample-school',
  currentFingerprint: 'AA'.repeat(32),
  nextFingerprint: null,
};

function response(status: number, body: unknown) {
  return {
    status,
    json: async (): Promise<unknown> => body,
  };
}

function clientFor(body: unknown): ApiClient {
  const transport: Transport = vi.fn().mockResolvedValue(response(200, body));
  return new ApiClient(policy, transport);
}

describe('ApiClient', () => {
  it('builds URLs from the policy and sets JSON headers without authorization by default', async () => {
    const transportMock = vi.fn<Transport>().mockResolvedValue(
      response(200, {
        service: 'schoolworkhub',
        api_version: 'v1',
        school_code: 'sample-school',
        school_name: '샘플학교',
      }),
    );
    const client = new ApiClient(policy, transportMock);

    await client.getIdentity();

    expect(transportMock).toHaveBeenCalledWith(
      'https://school.example:8443/api/v1/system/identity',
      expect.objectContaining({
        method: 'GET',
        headers: { Accept: 'application/json' },
      }),
    );
  });

  it('rejects malformed token responses without exposing response content', async () => {
    await expect(
      clientFor({ access_token: 'secret-but-incomplete' }).login({
        schoolCode: 'sample-school',
        username: 'teacher',
        password: 'password',
      }),
    ).rejects.toMatchObject({ code: 'SERVER_RESPONSE_INVALID' });
  });

  it('rejects malformed identity, user, and dashboard responses', async () => {
    await expect(clientFor({ service: 'other' }).getIdentity()).rejects.toMatchObject({
      code: 'SERVER_RESPONSE_INVALID',
    });
    await expect(clientFor({ id: 'not-a-uuid' }).getCurrentUser('access-token')).rejects.toMatchObject(
      { code: 'SERVER_RESPONSE_INVALID' },
    );
    await expect(clientFor({ metrics: [] }).getDashboard('access-token')).rejects.toMatchObject({
      code: 'SERVER_RESPONSE_INVALID',
    });
  });

  it('adds authorization only for authenticated requests', async () => {
    const transportMock = vi.fn<Transport>().mockResolvedValue(
      response(200, {
        id: '3d594650-3436-4bc4-a593-8d9eea56f26d',
        school_id: 'eaa2e969-48ce-44c1-a2e0-a2dcbe074e5a',
        school_name: '샘플학교',
        department_id: null,
        department_names: [],
        username: 'teacher',
        display_name: '김선생',
        is_superuser: false,
        roles: ['teacher'],
        permissions: ['calendar.read'],
      }),
    );
    const client = new ApiClient(policy, transportMock);

    await client.getCurrentUser('access-token');

    expect(transportMock).toHaveBeenCalledWith(
      'https://school.example:8443/api/v1/auth/me',
      expect.objectContaining({
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer access-token',
        },
      }),
    );
  });
});
