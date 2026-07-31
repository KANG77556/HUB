import { randomUUID } from 'node:crypto';

import type {
  CurrentUserResponse,
  LoginInput,
  ServerChangeInput,
  ServerIdentityResponse,
  TokenPairResponse,
} from '../../shared/contracts.js';
import { serverChangeInputSchema } from '../../shared/contracts.js';
import {
  parseServerPolicy,
  type ServerPolicy,
  type ServerPolicyStore,
} from '../config/serverPolicy.js';
import {
  ApiClient,
  ClientError,
  type Transport,
} from '../network/apiClient.js';
import { installCertificatePinning } from '../network/certificatePinning.js';

export type ServerChangeFailureCode =
  | 'SERVER_IDENTITY_INVALID'
  | 'ADMIN_AUTHENTICATION_FAILED'
  | 'ADMIN_PERMISSION_REQUIRED';

export class ServerChangeError extends Error {
  public constructor(public readonly code: ServerChangeFailureCode) {
    super(code);
    this.name = 'ServerChangeError';
  }
}

export type ServerChangeProbe = {
  getIdentity: () => Promise<ServerIdentityResponse>;
  login: (input: LoginInput) => Promise<TokenPairResponse>;
  getCurrentUser: (accessToken: string) => Promise<CurrentUserResponse>;
  logout: (refreshToken: string) => Promise<void>;
  dispose: () => Promise<void>;
};

export type ServerChangeServiceDependencies = {
  createProbe: (policy: ServerPolicy) => Promise<ServerChangeProbe>;
  policyStore: Pick<ServerPolicyStore, 'replaceAtomically'>;
};

function candidatePolicy(input: ServerChangeInput): ServerPolicy {
  return parseServerPolicy({
    baseUrl: input.baseUrl,
    schoolCode: input.schoolCode,
    currentFingerprint: input.currentFingerprint,
    nextFingerprint: input.nextFingerprint,
  });
}

function identityMatches(
  identity: ServerIdentityResponse,
  policy: ServerPolicy,
): boolean {
  return (
    identity.service === 'schoolworkhub' &&
    identity.api_version === 'v1' &&
    identity.school_code === policy.schoolCode
  );
}

export class ServerChangeService {
  public constructor(
    private readonly dependencies: ServerChangeServiceDependencies,
  ) {}

  public async requestChange(rawInput: ServerChangeInput): Promise<void> {
    const input = serverChangeInputSchema.parse(rawInput);
    const policy = candidatePolicy(input);
    const probe = await this.dependencies.createProbe(policy);
    let temporaryRefreshToken: string | null = null;

    try {
      const identity = await probe.getIdentity();
      if (!identityMatches(identity, policy)) {
        throw new ServerChangeError('SERVER_IDENTITY_INVALID');
      }

      let tokens: TokenPairResponse;
      try {
        tokens = await probe.login({
          schoolCode: policy.schoolCode,
          username: input.adminUsername,
          password: input.adminPassword,
        });
      } catch (error: unknown) {
        if (
          error instanceof ClientError &&
          error.code === 'AUTHENTICATION_REQUIRED'
        ) {
          throw new ServerChangeError('ADMIN_AUTHENTICATION_FAILED');
        }
        throw error;
      }

      temporaryRefreshToken = tokens.refresh_token;
      const administrator = await probe.getCurrentUser(tokens.access_token);
      const hasAdministratorPermission = administrator.permissions.includes(
        'system.admin',
      );

      await probe.logout(temporaryRefreshToken);
      temporaryRefreshToken = null;

      if (!hasAdministratorPermission) {
        throw new ServerChangeError('ADMIN_PERMISSION_REQUIRED');
      }

      await this.dependencies.policyStore.replaceAtomically(policy);
    } finally {
      if (temporaryRefreshToken !== null) {
        await probe.logout(temporaryRefreshToken).catch(() => undefined);
      }
      await probe.dispose();
    }
  }
}

export async function createElectronServerChangeProbe(
  policy: ServerPolicy,
): Promise<ServerChangeProbe> {
  const { session } = await import('electron');
  const candidateSession = session.fromPartition(
    `server-change-${randomUUID()}`,
    { cache: false },
  );

  installCertificatePinning(
    {
      setCertificateVerifyProc: (handler) => {
        candidateSession.setCertificateVerifyProc((request, callback) => {
          handler(
            {
              hostname: request.hostname,
              verificationResult: request.verificationResult,
              certificate: {
                fingerprint256: request.certificate.fingerprint256,
              },
            },
            callback,
          );
        });
      },
    },
    policy,
  );

  const transport: Transport = async (url, init) => {
    const response = await candidateSession.fetch(url, init);
    return {
      status: response.status,
      json: async () => (await response.json()) as unknown,
    };
  };
  const client = new ApiClient(policy, transport);

  return {
    getIdentity: () => client.getIdentity(),
    login: (input) => client.login(input),
    getCurrentUser: (accessToken) => client.getCurrentUser(accessToken),
    logout: (refreshToken) => client.logout(refreshToken),
    dispose: async () => {
      await candidateSession.closeAllConnections();
      await candidateSession.clearStorageData();
    },
  };
}
