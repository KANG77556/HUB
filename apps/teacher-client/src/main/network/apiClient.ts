import type { ZodType } from 'zod';

import type { ServerPolicy } from '../config/serverPolicy.js';
import {
  currentUserResponseSchema,
  dashboardResponseSchema,
  serverIdentityResponseSchema,
  tokenPairResponseSchema,
  type CurrentUserResponse,
  type DashboardResponse,
  type LoginInput,
  type ServerIdentityResponse,
  type TokenPairResponse,
} from '../../shared/contracts.js';

export type TransportResponse = {
  status: number;
  json: () => Promise<unknown>;
};

export type Transport = (url: string, init: RequestInit) => Promise<TransportResponse>;

export type ClientErrorCode =
  | 'NETWORK_UNAVAILABLE'
  | 'AUTHENTICATION_REQUIRED'
  | 'ACCOUNT_LOCKED'
  | 'SERVER_RESPONSE_INVALID'
  | 'API_VERSION_UNSUPPORTED'
  | 'SECURITY_BLOCKED';

export class ClientError extends Error {
  public constructor(
    public readonly code: ClientErrorCode,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = 'ClientError';
  }
}

function errorForStatus(status: number): ClientError {
  if (status === 401 || status === 403) {
    return new ClientError('AUTHENTICATION_REQUIRED');
  }
  if (status === 423) {
    return new ClientError('ACCOUNT_LOCKED');
  }
  if (status === 426) {
    return new ClientError('API_VERSION_UNSUPPORTED');
  }
  if (status === 495 || status === 496) {
    return new ClientError('SECURITY_BLOCKED');
  }
  if (status >= 500) {
    return new ClientError('NETWORK_UNAVAILABLE');
  }
  return new ClientError('SERVER_RESPONSE_INVALID');
}

function headersFor(accessToken: string | undefined, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (hasBody) {
    headers['Content-Type'] = 'application/json';
  }
  if (accessToken !== undefined) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return headers;
}

export class ApiClient {
  public constructor(
    private readonly policy: ServerPolicy,
    private readonly transport: Transport,
  ) {}

  private async send(path: string, init: RequestInit): Promise<TransportResponse> {
    const url = new URL(path, this.policy.baseUrl).toString();
    try {
      return await this.transport(url, init);
    } catch (error: unknown) {
      if (error instanceof ClientError) {
        throw error;
      }
      throw new ClientError('NETWORK_UNAVAILABLE', { cause: error });
    }
  }

  private async requestJson<T>(
    path: string,
    method: 'GET' | 'POST',
    schema: ZodType<T>,
    options: { body?: unknown; accessToken?: string } = {},
  ): Promise<T> {
    const hasBody = options.body !== undefined;
    const response = await this.send(path, {
      method,
      headers: headersFor(options.accessToken, hasBody),
      ...(hasBody ? { body: JSON.stringify(options.body) } : {}),
    });
    if (response.status < 200 || response.status >= 300) {
      throw errorForStatus(response.status);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error: unknown) {
      throw new ClientError('SERVER_RESPONSE_INVALID', { cause: error });
    }
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new ClientError('SERVER_RESPONSE_INVALID');
    }
    return parsed.data;
  }

  private async requestVoid(
    path: string,
    method: 'POST',
    body: unknown,
  ): Promise<void> {
    const response = await this.send(path, {
      method,
      headers: headersFor(undefined, true),
      body: JSON.stringify(body),
    });
    if (response.status < 200 || response.status >= 300) {
      throw errorForStatus(response.status);
    }
  }

  public login(input: LoginInput): Promise<TokenPairResponse> {
    return this.requestJson('/api/v1/auth/login', 'POST', tokenPairResponseSchema, {
      body: {
        school_code: input.schoolCode,
        username: input.username,
        password: input.password,
      },
    });
  }

  public refresh(refreshToken: string): Promise<TokenPairResponse> {
    return this.requestJson('/api/v1/auth/refresh', 'POST', tokenPairResponseSchema, {
      body: { refresh_token: refreshToken },
    });
  }

  public logout(refreshToken: string): Promise<void> {
    return this.requestVoid('/api/v1/auth/logout', 'POST', {
      refresh_token: refreshToken,
    });
  }

  public getIdentity(): Promise<ServerIdentityResponse> {
    return this.requestJson(
      '/api/v1/system/identity',
      'GET',
      serverIdentityResponseSchema,
    );
  }

  public getCurrentUser(accessToken: string): Promise<CurrentUserResponse> {
    return this.requestJson('/api/v1/auth/me', 'GET', currentUserResponseSchema, {
      accessToken,
    });
  }

  public getDashboard(accessToken: string): Promise<DashboardResponse> {
    return this.requestJson('/api/v1/dashboard', 'GET', dashboardResponseSchema, {
      accessToken,
    });
  }
}

export async function createElectronTransport(): Promise<Transport> {
  const { net } = await import('electron');
  return async (url, init) => {
    const response = await net.fetch(url, init);
    return {
      status: response.status,
      json: async () => (await response.json()) as unknown,
    };
  };
}
