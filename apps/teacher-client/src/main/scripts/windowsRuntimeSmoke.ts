import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { app, BrowserWindow, ipcMain } from 'electron';

import type { IpcHandlerServices } from '../ipc/registerIpc.js';
import {
  createSenderUrlValidator,
  registerIpcHandlers,
  type IpcHandler,
  type IpcInvokeEventPort,
} from '../ipc/registerIpc.js';

class RuntimeSmokeFailure extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'RuntimeSmokeFailure';
  }
}

function requireCondition(condition: boolean, code: string): void {
  if (!condition) {
    throw new RuntimeSmokeFailure(code);
  }
}

function createEventPort(
  event: Electron.IpcMainInvokeEvent,
): IpcInvokeEventPort {
  return {
    senderFrame:
      event.senderFrame === null ? null : { url: event.senderFrame.url },
    sender: { getURL: () => event.sender.getURL() },
  };
}

async function runSmoke(): Promise<void> {
  if (process.platform !== 'win32') {
    throw new RuntimeSmokeFailure('WINDOWS_REQUIRED');
  }

  app.enableSandbox();
  await app.whenReady();

  const directory = await mkdtemp(join(tmpdir(), 'schoolworkhub-runtime-smoke-'));
  const htmlPath = join(directory, 'index.html');
  const rendererUrl = pathToFileURL(htmlPath).toString();
  const preloadPath = join(
    import.meta.dirname,
    '..',
    '..',
    'preload',
    'index.cjs',
  );
  await writeFile(
    htmlPath,
    '<!doctype html><html><body><main>runtime smoke</main></body></html>',
    'utf8',
  );

  const services: IpcHandlerServices = {
    auth: {
      login: () => Promise.reject(new RuntimeSmokeFailure('LOGIN_NOT_USED')),
      restoreSession: () => Promise.resolve(null),
      logout: () => Promise.resolve(),
    },
    dashboard: {
      load: () => Promise.reject(new RuntimeSmokeFailure('DASHBOARD_NOT_USED')),
    },
    connection: {
      getStatus: () =>
        Promise.resolve({
          kind: 'offline-readonly' as const,
          lastSyncAt: '2026-07-31T00:00:00.000Z',
        }),
    },
    settings: {
      requestServerChange: () =>
        Promise.reject(new RuntimeSmokeFailure('SETTINGS_NOT_USED')),
    },
  };
  const unregister = registerIpcHandlers(
    {
      handle: (channel: string, handler: IpcHandler) => {
        ipcMain.handle(
          channel,
          (
            event: Electron.IpcMainInvokeEvent,
            ...args: unknown[]
          ): Promise<unknown> => handler(createEventPort(event), ...args),
        );
      },
      removeHandler: (channel: string) => ipcMain.removeHandler(channel),
    },
    services,
    createSenderUrlValidator(rendererUrl),
  );
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      preload: preloadPath,
    },
  });

  try {
    await window.loadURL(rendererUrl);
    const raw: unknown = await window.webContents.executeJavaScript(`
      (async () => ({
        bridgeKeys: Object.keys(window.schoolWorkHub).sort(),
        nodeRequire: typeof window.require,
        nodeProcess: typeof window.process,
        status: await window.schoolWorkHub.connection.getStatus(),
      }))()
    `);
    requireCondition(
      typeof raw === 'object' && raw !== null,
      'BRIDGE_RESULT_INVALID',
    );
    const result = raw as {
      bridgeKeys?: unknown;
      nodeRequire?: unknown;
      nodeProcess?: unknown;
      status?: unknown;
    };
    requireCondition(
      JSON.stringify(result.bridgeKeys) ===
        JSON.stringify(['auth', 'connection', 'dashboard', 'events', 'settings']),
      'BRIDGE_SURFACE_INVALID',
    );
    requireCondition(result.nodeRequire === 'undefined', 'NODE_REQUIRE_EXPOSED');
    requireCondition(result.nodeProcess === 'undefined', 'NODE_PROCESS_EXPOSED');
    requireCondition(
      JSON.stringify(result.status) ===
        JSON.stringify({
          ok: true,
          value: {
            kind: 'offline-readonly',
            lastSyncAt: '2026-07-31T00:00:00.000Z',
          },
        }),
      'BRIDGE_INVOKE_FAILED',
    );

    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        checks: [
          'sandboxed-preload-loaded',
          'fixed-bridge-surface',
          'validated-ipc-invoke',
          'node-globals-hidden',
        ],
      })}\n`,
    );
  } finally {
    unregister();
    if (!window.isDestroyed()) {
      window.destroy();
    }
    await rm(directory, { recursive: true, force: true });
  }
}

void runSmoke()
  .catch((error: unknown) => {
    const code = error instanceof RuntimeSmokeFailure
      ? error.code
      : 'WINDOWS_RUNTIME_SMOKE_FAILED';
    process.stderr.write(`${JSON.stringify({ ok: false, code })}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    app.quit();
  });
