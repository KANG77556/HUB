import { z, type ZodType } from 'zod';

import type { BridgeResult } from '../../shared/bridge.js';
import {
  connectionStateSchema,
  dashboardSnapshotSchema,
  loginInputSchema,
  sessionViewSchema,
  type ConnectionState,
  type DashboardSnapshot,
  type LoginInput,
  type SessionView,
} from '../../shared/contracts.js';
import { appError, type AppErrorView } from '../../shared/errors.js';
import { ClientError } from '../network/apiClient.js';
import { IPC_CHANNELS } from './channels.js';

export type IpcInvokeEventPort = {
  senderFrame?: { url: string } | null;
  sender?: { getURL: () => string };
};

export type IpcHandler = (
  event: IpcInvokeEventPort,
  ...args: readonly unknown[]
) => Promise<unknown>;

export type IpcMainPort = {
  handle: (channel: string, handler: IpcHandler) => void;
  removeHandler: (channel: string) => void;
};

export type IpcHandlerServices = {
  auth: {
    login: (input: LoginInput) => Promise<SessionView>;
    restoreSession: () => Promise<SessionView | null>;
    logout: () => Promise<void>;
  };
  dashboard: {
    load: () => Promise<DashboardSnapshot>;
  };
  connection: {
    getStatus: () => Promise<ConnectionState>;
  };
};

export type SenderUrlValidator = (candidateUrl: string) => boolean;

class BoundaryError extends Error {
  public constructor(public readonly view: AppErrorView) {
    super(view.code);
    this.name = 'BoundaryError';
  }
}

const sensitiveKeys = new Set([
  'accesstoken',
  'refreshtoken',
  'token',
  'certificate',
  'policypath',
]);

function normalizedKey(key: string): string {
  return key.replaceAll('_', '').replaceAll('-', '').toLowerCase();
}

function containsSensitiveKey(
  value: unknown,
  visited: WeakSet<object> = new WeakSet<object>(),
): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (visited.has(value)) {
    return false;
  }
  visited.add(value);

  if (Array.isArray(value)) {
    return value.some((item) => containsSensitiveKey(item, visited));
  }

  for (const [key, nested] of Object.entries(value)) {
    if (sensitiveKeys.has(normalizedKey(key))) {
      return true;
    }
    if (containsSensitiveKey(nested, visited)) {
      return true;
    }
  }
  return false;
}

function senderUrl(event: IpcInvokeEventPort): string {
  const frameUrl = event.senderFrame?.url;
  if (frameUrl !== undefined && frameUrl.length > 0) {
    return frameUrl;
  }
  return event.sender?.getURL() ?? '';
}

function toPublicError(error: unknown): AppErrorView {
  if (error instanceof BoundaryError) {
    return error.view;
  }
  if (error instanceof z.ZodError) {
    return appError('INVALID_INPUT', 'retryable', '입력값을 확인해 주세요.');
  }
  if (error instanceof ClientError) {
    switch (error.code) {
      case 'NETWORK_UNAVAILABLE':
        return appError(
          'NETWORK_UNAVAILABLE',
          'retryable',
          '학교 서버에 연결할 수 없습니다.',
        );
      case 'AUTHENTICATION_REQUIRED':
        return appError(
          'SESSION_INVALID',
          'login-required',
          '로그인이 만료되었습니다. 다시 로그인해 주세요.',
        );
      case 'ACCOUNT_LOCKED':
        return appError(
          'ACCOUNT_DISABLED',
          'login-required',
          '계정을 사용할 수 없습니다. 관리자에게 문의해 주세요.',
        );
      case 'API_VERSION_UNSUPPORTED':
        return appError(
          'API_VERSION_INCOMPATIBLE',
          'administrator-action-required',
          '학교 서버와 앱의 버전이 호환되지 않습니다.',
        );
      case 'SECURITY_BLOCKED':
        return appError(
          'CERTIFICATE_MISMATCH',
          'security-blocked',
          '학교 서버의 보안 인증을 확인할 수 없습니다.',
        );
      case 'SERVER_RESPONSE_INVALID':
        return appError(
          'SERVER_IDENTITY_INVALID',
          'administrator-action-required',
          '학교 서버의 응답을 확인할 수 없습니다.',
        );
    }
  }
  return appError(
    'UNEXPECTED_ERROR',
    'retryable',
    '요청을 처리하지 못했습니다.',
  );
}

function requireTrustedSender(
  event: IpcInvokeEventPort,
  validateSenderUrl: SenderUrlValidator,
): void {
  if (!validateSenderUrl(senderUrl(event))) {
    throw new BoundaryError(
      appError(
        'SERVER_CONFIGURATION_INVALID',
        'administrator-action-required',
        '허용되지 않은 화면에서 요청했습니다.',
      ),
    );
  }
}

function requireArgumentCount(args: readonly unknown[], count: number): void {
  if (args.length !== count) {
    throw new BoundaryError(
      appError('INVALID_INPUT', 'retryable', '입력값을 확인해 주세요.'),
    );
  }
}

async function safeResult<T>(
  operation: () => Promise<unknown>,
  schema: ZodType<T>,
): Promise<BridgeResult<T>> {
  try {
    const rawValue = await operation();
    if (containsSensitiveKey(rawValue)) {
      throw new Error('IPC_SENSITIVE_RESULT_BLOCKED');
    }
    const parsed = schema.safeParse(rawValue);
    if (!parsed.success) {
      throw new Error('IPC_RESULT_INVALID');
    }
    return { ok: true, value: parsed.data };
  } catch (error: unknown) {
    return { ok: false, error: toPublicError(error) };
  }
}

export function createSenderUrlValidator(
  packagedRendererUrl: string,
  developmentRendererUrl?: string,
): SenderUrlValidator {
  let developmentOrigin: string | null = null;
  if (developmentRendererUrl !== undefined) {
    try {
      developmentOrigin = new URL(developmentRendererUrl).origin;
    } catch {
      developmentOrigin = null;
    }
  }

  return (candidateUrl: string): boolean => {
    if (candidateUrl === packagedRendererUrl) {
      return true;
    }
    if (developmentOrigin === null) {
      return false;
    }
    try {
      const parsed = new URL(candidateUrl);
      return (
        parsed.origin === developmentOrigin &&
        parsed.username === '' &&
        parsed.password === ''
      );
    } catch {
      return false;
    }
  };
}

export function registerIpcHandlers(
  ipcMain: IpcMainPort,
  services: IpcHandlerServices,
  validateSenderUrl: SenderUrlValidator,
): () => void {
  const handlers = new Map<string, IpcHandler>([
    [
      IPC_CHANNELS.authLogin,
      async (event, ...args) => {
        return safeResult(async () => {
          requireTrustedSender(event, validateSenderUrl);
          requireArgumentCount(args, 1);
          const input = loginInputSchema.parse(args[0]);
          return services.auth.login(input);
        }, sessionViewSchema);
      },
    ],
    [
      IPC_CHANNELS.authRestore,
      async (event, ...args) => {
        return safeResult(async () => {
          requireTrustedSender(event, validateSenderUrl);
          requireArgumentCount(args, 0);
          return services.auth.restoreSession();
        }, sessionViewSchema.nullable());
      },
    ],
    [
      IPC_CHANNELS.authLogout,
      async (event, ...args) => {
        return safeResult(async () => {
          requireTrustedSender(event, validateSenderUrl);
          requireArgumentCount(args, 0);
          await services.auth.logout();
          return undefined;
        }, z.undefined());
      },
    ],
    [
      IPC_CHANNELS.dashboardLoad,
      async (event, ...args) => {
        return safeResult(async () => {
          requireTrustedSender(event, validateSenderUrl);
          requireArgumentCount(args, 0);
          return services.dashboard.load();
        }, dashboardSnapshotSchema);
      },
    ],
    [
      IPC_CHANNELS.connectionStatus,
      async (event, ...args) => {
        return safeResult(async () => {
          requireTrustedSender(event, validateSenderUrl);
          requireArgumentCount(args, 0);
          return services.connection.getStatus();
        }, connectionStateSchema);
      },
    ],
  ]);

  for (const [channel, handler] of handlers) {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, handler);
  }

  return () => {
    for (const channel of handlers.keys()) {
      ipcMain.removeHandler(channel);
    }
  };
}
