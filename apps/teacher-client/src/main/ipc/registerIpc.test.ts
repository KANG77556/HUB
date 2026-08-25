import { describe, expect, it, vi } from 'vitest';

import type {
  ConnectionState,
  DashboardSnapshot,
  ServerChangeInput,
  SessionView,
} from '../../shared/contracts.js';
import { IPC_CHANNELS } from './channels.js';
import {
  createSenderUrlValidator,
  registerIpcHandlers,
  type IpcHandlerServices,
  type IpcInvokeEventPort,
  type IpcMainPort,
} from './registerIpc.js';

type Handler = (
  event: IpcInvokeEventPort,
  ...args: readonly unknown[]
) => Promise<unknown>;

type TestServices = IpcHandlerServices & {
  settings: {
    requestServerChange: (input: ServerChangeInput) => Promise<void>;
  };
};

class FakeIpcMain implements IpcMainPort {
  public readonly handlers = new Map<string, Handler>();

  public handle(channel: string, handler: Handler): void {
    this.handlers.set(channel, handler);
  }

  public removeHandler(channel: string): void {
    this.handlers.delete(channel);
  }
}

const packagedUrl = 'file:///C:/Program%20Files/SchoolWorkHub/renderer/index.html';
const developmentUrl = 'http://127.0.0.1:5173/';
const session: SessionView = {
  userId: '3d594650-3436-4bc4-a593-8d9eea56f26d',
  displayName: '김선생',
  schoolName: '샘플학교',
  departmentNames: ['교무부'],
  roles: ['teacher', 'teacher_lead'],
  permissions: ['calendar.read', 'documents.read'],
};
const dashboard: DashboardSnapshot = {
  generatedAt: '2026-07-31T07:20:00.000Z',
  metrics: [{ key: 'submissions.pending', count: 2 }],
  scheduleItems: [],
  documentItems: [],
};
const connection: ConnectionState = {
  kind: 'online',
  lastSyncAt: dashboard.generatedAt,
};

function createServices(): TestServices {
  return {
    auth: {
      login: vi.fn<IpcHandlerServices['auth']['login']>().mockResolvedValue(session),
      restoreSession: vi
        .fn<IpcHandlerServices['auth']['restoreSession']>()
        .mockResolvedValue(session),
      logout: vi.fn<IpcHandlerServices['auth']['logout']>().mockResolvedValue(undefined),
    },
    dashboard: {
      load: vi
        .fn<IpcHandlerServices['dashboard']['load']>()
        .mockResolvedValue(dashboard),
    },
    connection: {
      getStatus: vi
        .fn<IpcHandlerServices['connection']['getStatus']>()
        .mockResolvedValue(connection),
    },
    settings: {
      requestServerChange: vi
        .fn<TestServices['settings']['requestServerChange']>()
        .mockResolvedValue(undefined),
    },
  };
}

function eventFor(url: string): IpcInvokeEventPort {
  return { senderFrame: { url } };
}

async function invoke(
  ipcMain: FakeIpcMain,
  channel: string,
  event: IpcInvokeEventPort,
  ...args: readonly unknown[]
): Promise<unknown> {
  const handler = ipcMain.handlers.get(channel);
  if (handler === undefined) {
    throw new Error(`missing handler: ${channel}`);
  }
  return handler(event, ...args);
}

describe('registerIpcHandlers', () => {
  it('registers only the six approved invoke channels and disposes them', () => {
    const ipcMain = new FakeIpcMain();
    const dispose = registerIpcHandlers(
      ipcMain,
      createServices(),
      createSenderUrlValidator(packagedUrl, developmentUrl),
    );

    expect([...ipcMain.handlers.keys()].sort()).toEqual(
      [
        IPC_CHANNELS.authLogin,
        IPC_CHANNELS.authRestore,
        IPC_CHANNELS.authLogout,
        IPC_CHANNELS.dashboardLoad,
        IPC_CHANNELS.connectionStatus,
        IPC_CHANNELS.serverChange,
      ].sort(),
    );

    dispose();
    expect(ipcMain.handlers.size).toBe(0);
  });

  it('accepts the exact packaged URL and development origin only', () => {
    const validate = createSenderUrlValidator(packagedUrl, developmentUrl);

    expect(validate(packagedUrl)).toBe(true);
    expect(validate('http://127.0.0.1:5173/nested/route')).toBe(true);
    expect(validate('http://localhost:5173/')).toBe(false);
    expect(validate('https://127.0.0.1:5173/')).toBe(false);
    expect(validate('file:///C:/other/index.html')).toBe(false);
  });

  it('rejects malformed login input without calling the authentication service', async () => {
    const ipcMain = new FakeIpcMain();
    const services = createServices();
    registerIpcHandlers(
      ipcMain,
      services,
      createSenderUrlValidator(packagedUrl, developmentUrl),
    );

    await expect(
      invoke(ipcMain, IPC_CHANNELS.authLogin, eventFor(packagedUrl), {
        schoolCode: 'x',
        username: '',
        password: '',
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: 'INVALID_INPUT',
        category: 'retryable',
        message: '입력값을 확인해 주세요.',
      },
    });
    expect(services.auth.login).not.toHaveBeenCalled();
  });

  it('validates protected server changes and returns no submitted secret', async () => {
    const ipcMain = new FakeIpcMain();
    const services = createServices();
    registerIpcHandlers(
      ipcMain,
      services,
      createSenderUrlValidator(packagedUrl, developmentUrl),
    );

    await expect(
      invoke(ipcMain, IPC_CHANNELS.serverChange, eventFor(packagedUrl), {
        baseUrl: 'http://insecure.example/',
        schoolCode: 'sample-school',
        currentFingerprint: 'A'.repeat(64),
        nextFingerprint: null,
        adminUsername: 'administrator',
        adminPassword: 'temporary-secret',
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: 'INVALID_INPUT',
        category: 'retryable',
        message: '입력값을 확인해 주세요.',
      },
    });
    expect(services.settings.requestServerChange).not.toHaveBeenCalled();

    const validInput: ServerChangeInput = {
      baseUrl: 'https://new-school.example/',
      schoolCode: 'sample-school',
      currentFingerprint: 'A'.repeat(64),
      nextFingerprint: 'B'.repeat(64),
      adminUsername: 'administrator',
      adminPassword: 'temporary-secret',
    };
    const result = await invoke(
      ipcMain,
      IPC_CHANNELS.serverChange,
      eventFor(packagedUrl),
      validInput,
    );

    expect(result).toEqual({ ok: true, value: undefined });
    expect(services.settings.requestServerChange).toHaveBeenCalledWith(validInput);
    expect(JSON.stringify(result)).not.toContain('temporary-secret');
  });

  it('rejects calls from an untrusted renderer URL', async () => {
    const ipcMain = new FakeIpcMain();
    registerIpcHandlers(
      ipcMain,
      createServices(),
      createSenderUrlValidator(packagedUrl, developmentUrl),
    );

    await expect(
      invoke(ipcMain, IPC_CHANNELS.authRestore, eventFor('https://evil.example/')),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: 'SERVER_CONFIGURATION_INVALID',
        category: 'administrator-action-required',
        message: '허용되지 않은 화면에서 요청했습니다.',
      },
    });
  });

  it('returns validated service data without token-like fields', async () => {
    const ipcMain = new FakeIpcMain();
    registerIpcHandlers(
      ipcMain,
      createServices(),
      createSenderUrlValidator(packagedUrl, developmentUrl),
    );

    await expect(
      invoke(ipcMain, IPC_CHANNELS.authRestore, eventFor(packagedUrl)),
    ).resolves.toEqual({ ok: true, value: session });
    await expect(
      invoke(ipcMain, IPC_CHANNELS.dashboardLoad, eventFor(packagedUrl)),
    ).resolves.toEqual({ ok: true, value: dashboard });
    await expect(
      invoke(ipcMain, IPC_CHANNELS.connectionStatus, eventFor(packagedUrl)),
    ).resolves.toEqual({ ok: true, value: connection });
  });

  it('blocks an accidental sensitive result instead of returning it', async () => {
    const ipcMain = new FakeIpcMain();
    const services = createServices();
    services.auth.restoreSession = () =>
      Promise.resolve({ ...session, accessToken: 'secret' } as SessionView);
    registerIpcHandlers(
      ipcMain,
      services,
      createSenderUrlValidator(packagedUrl, developmentUrl),
    );

    const result = await invoke(
      ipcMain,
      IPC_CHANNELS.authRestore,
      eventFor(packagedUrl),
    );
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'UNEXPECTED_ERROR',
        category: 'retryable',
        message: '요청을 처리하지 못했습니다.',
      },
    });
    expect(JSON.stringify(result)).not.toContain('secret');
  });
});
