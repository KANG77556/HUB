import type {
  CurrentUserResponse,
  LoginInput,
  SessionView,
  TokenPairResponse,
} from '../../shared/contracts.js';
import type { StoredSession } from '../security/credentialStore.js';
import { ClientError } from '../network/apiClient.js';

export type AuthApi = {
  login: (input: LoginInput) => Promise<TokenPairResponse>;
  refresh: (refreshToken: string) => Promise<TokenPairResponse>;
  logout: (refreshToken: string) => Promise<void>;
  getCurrentUser: (accessToken: string) => Promise<CurrentUserResponse>;
};

export type CredentialStorePort = {
  readActive: () => Promise<StoredSession | null>;
  writeActive: (session: StoredSession) => Promise<void>;
  deleteActive: () => Promise<boolean>;
};

export type CachedUserIdentity = {
  schoolCode: string;
  userId: string;
};

export type ClearCachedUser = (identity: CachedUserIdentity) => Promise<void>;

function toSessionView(user: CurrentUserResponse): SessionView {
  return {
    userId: user.id,
    displayName: user.display_name,
    schoolName: user.school_name,
    departmentNames: [...user.department_names],
    roles: [...user.roles],
    permissions: [...user.permissions],
  };
}

function isAuthenticationRejection(error: unknown): boolean {
  return error instanceof ClientError && error.code === 'AUTHENTICATION_REQUIRED';
}

export class AuthService {
  private accessToken: string | null = null;
  private refreshInFlight: Promise<void> | null = null;
  private currentSession: SessionView | null = null;
  private activeIdentity: CachedUserIdentity | null = null;

  public constructor(
    private readonly api: AuthApi,
    private readonly credentialStore: CredentialStorePort,
    private readonly clearCachedUser: ClearCachedUser,
  ) {}

  public async login(input: LoginInput): Promise<SessionView> {
    const pair = await this.api.login(input);
    const user = await this.api.getCurrentUser(pair.access_token);
    const identity = { schoolCode: input.schoolCode, userId: user.id };
    await this.credentialStore.writeActive({
      ...identity,
      refreshToken: pair.refresh_token,
    });
    return this.activate(pair.access_token, user, identity);
  }

  public async restoreSession(): Promise<SessionView | null> {
    const stored = await this.credentialStore.readActive();
    if (stored === null) {
      this.clearMemory();
      return null;
    }

    try {
      return await this.rotateStoredSession(stored);
    } catch (error: unknown) {
      if (isAuthenticationRejection(error)) {
        await this.clearLocalSession(stored);
      }
      throw error;
    }
  }

  public async authenticatedRequest<T>(
    operation: (accessToken: string) => Promise<T>,
  ): Promise<T> {
    const accessToken = this.accessToken;
    if (accessToken === null) {
      throw new ClientError('AUTHENTICATION_REQUIRED');
    }

    try {
      return await operation(accessToken);
    } catch (error: unknown) {
      if (!isAuthenticationRejection(error)) {
        throw error;
      }
    }

    await this.refreshOnce();
    const refreshedToken = this.accessToken;
    if (refreshedToken === null) {
      throw new ClientError('AUTHENTICATION_REQUIRED');
    }
    return operation(refreshedToken);
  }

  public async logout(): Promise<void> {
    let stored: StoredSession | null = null;
    try {
      stored = await this.credentialStore.readActive();
    } catch {
      stored = null;
    }

    if (stored !== null) {
      try {
        await this.api.logout(stored.refreshToken);
      } catch {
        // Local credential and cache cleanup is mandatory even when the server is offline.
      }
    }

    const identity = stored ?? this.activeIdentity;
    if (identity === null) {
      this.clearMemory();
      await this.credentialStore.deleteActive().catch(() => false);
      return;
    }
    await this.clearLocalSession(identity);
  }

  public getSession(): SessionView | null {
    return this.currentSession === null ? null : { ...this.currentSession };
  }

  private async refreshOnce(): Promise<void> {
    if (this.refreshInFlight === null) {
      const pending = this.refreshActiveSession();
      this.refreshInFlight = pending.finally(() => {
        if (this.refreshInFlight !== null) {
          this.refreshInFlight = null;
        }
      });
    }
    await this.refreshInFlight;
  }

  private async refreshActiveSession(): Promise<void> {
    const stored = await this.credentialStore.readActive();
    if (stored === null) {
      this.clearMemory();
      throw new ClientError('AUTHENTICATION_REQUIRED');
    }

    try {
      await this.rotateStoredSession(stored);
    } catch (error: unknown) {
      if (isAuthenticationRejection(error)) {
        await this.clearLocalSession(stored);
      }
      throw error;
    }
  }

  private async rotateStoredSession(stored: StoredSession): Promise<SessionView> {
    const pair = await this.api.refresh(stored.refreshToken);
    const user = await this.api.getCurrentUser(pair.access_token);
    if (user.id !== stored.userId) {
      throw new ClientError('SECURITY_BLOCKED');
    }
    await this.credentialStore.writeActive({
      schoolCode: stored.schoolCode,
      userId: stored.userId,
      refreshToken: pair.refresh_token,
    });
    return this.activate(pair.access_token, user, stored);
  }

  private activate(
    accessToken: string,
    user: CurrentUserResponse,
    identity: CachedUserIdentity,
  ): SessionView {
    const session = toSessionView(user);
    this.accessToken = accessToken;
    this.currentSession = session;
    this.activeIdentity = { ...identity };
    return { ...session };
  }

  private async clearLocalSession(identity: CachedUserIdentity): Promise<void> {
    this.clearMemory();
    await Promise.allSettled([
      this.credentialStore.deleteActive(),
      this.clearCachedUser({ schoolCode: identity.schoolCode, userId: identity.userId }),
    ]);
  }

  private clearMemory(): void {
    this.accessToken = null;
    this.currentSession = null;
    this.activeIdentity = null;
  }
}
