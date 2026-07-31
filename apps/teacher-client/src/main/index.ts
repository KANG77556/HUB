import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { BrowserWindowConstructorOptions } from 'electron';

import {
  createSenderUrlValidator,
  registerIpcHandlers,
  type IpcHandler,
  type IpcMainPort,
  type IpcInvokeEventPort,
} from './ipc/registerIpc.js';
import {
  createProductionTeacherClientRuntime,
  createRecoveryIpcServices,
} from './productionRuntime.js';

export function createWindowOptions(preloadPath: string): BrowserWindowConstructorOptions {
  return {
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#f1f5f9',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      preload: preloadPath,
    },
  };
}

export function isAllowedDevelopmentUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === 'http:' &&
      parsed.hostname === '127.0.0.1' &&
      /^\d+$/.test(parsed.port) &&
      parsed.username === '' &&
      parsed.password === ''
    );
  } catch {
    return false;
  }
}

function createInvokeEventPort(
  event: import('electron').IpcMainInvokeEvent,
): IpcInvokeEventPort {
  return {
    senderFrame:
      event.senderFrame === null ? null : { url: event.senderFrame.url },
    sender: { getURL: () => event.sender.getURL() },
  };
}

function createIpcMainPort(
  ipcMain: import('electron').IpcMain,
): IpcMainPort {
  return {
    handle: (channel: string, handler: IpcHandler) => {
      ipcMain.handle(channel, (event, ...args) =>
        handler(createInvokeEventPort(event), ...args),
      );
    },
    removeHandler: (channel: string) => {
      ipcMain.removeHandler(channel);
    },
  };
}

async function bootstrapElectron(): Promise<void> {
  const {
    app,
    BrowserWindow,
    ipcMain,
    safeStorage,
    session,
  } = await import('electron');
  app.enableSandbox();

  await app.whenReady();

  const preloadPath = join(import.meta.dirname, '..', 'preload', 'index.js');
  const rendererPath = join(import.meta.dirname, '..', '..', 'renderer', 'index.html');
  const packagedUrl = pathToFileURL(rendererPath).toString();
  const configuredDevelopmentUrl = process.env.SWH_TEACHER_DEV_URL;
  const developmentUrl =
    configuredDevelopmentUrl !== undefined &&
    isAllowedDevelopmentUrl(configuredDevelopmentUrl)
      ? configuredDevelopmentUrl
      : undefined;
  const allowedUrl = developmentUrl ?? packagedUrl;
  const programDataRoot =
    process.env.ProgramData ?? app.getPath('appData');
  const localDataRoot =
    process.env.LOCALAPPDATA ?? app.getPath('userData');
  const policyPath =
    process.env.SWH_TEACHER_POLICY_PATH ??
    join(
      programDataRoot,
      'SchoolWorkHub',
      'TeacherClient',
      'server-policy.json',
    );
  const cacheDirectory =
    process.env.SWH_TEACHER_CACHE_DIR ??
    join(localDataRoot, 'SchoolWorkHub', 'TeacherClient', 'cache');
  const ipcPort = createIpcMainPort(ipcMain);
  const validateSender = createSenderUrlValidator(
    packagedUrl,
    developmentUrl,
  );
  let restartScheduled = false;

  const scheduleRestart = (): void => {
    if (restartScheduled) {
      return;
    }
    restartScheduled = true;
    globalThis.setTimeout(() => {
      app.relaunch();
      app.exit(0);
    }, 250);
  };

  const createWindow = async (): Promise<void> => {
    const window = new BrowserWindow(createWindowOptions(preloadPath));
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, targetUrl) => {
      if (targetUrl !== allowedUrl) {
        event.preventDefault();
      }
    });

    const emitRenderer = (channel: string, payload?: unknown): void => {
      if (window.isDestroyed()) {
        return;
      }
      if (payload === undefined) {
        window.webContents.send(channel);
      } else {
        window.webContents.send(channel, payload);
      }
    };
    const defaultSession = session.defaultSession;
    const certificateSession = {
      setCertificateVerifyProc: (
        handler: Parameters<
          typeof import('./network/certificatePinning.js').installCertificatePinning
        >[0]['setCertificateVerifyProc'] extends (candidate: infer T) => void
          ? T
          : never,
      ): void => {
        defaultSession.setCertificateVerifyProc((request, callback) => {
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
    };
    const transport = async (url: string, init: RequestInit) => {
      const response = await defaultSession.fetch(url, init);
      return {
        status: response.status,
        json: async () => (await response.json()) as unknown,
      };
    };

    let disposeRuntime: () => void;
    try {
      const runtime = await createProductionTeacherClientRuntime({
        policyPath,
        cacheDirectory,
        certificateSession,
        transport,
        safeStorage,
        emitRenderer,
        onPolicyChanged: scheduleRestart,
      });
      const unregister = registerIpcHandlers(
        ipcPort,
        runtime.services,
        validateSender,
      );
      disposeRuntime = () => {
        unregister();
        runtime.dispose();
      };
    } catch {
      const unregister = registerIpcHandlers(
        ipcPort,
        createRecoveryIpcServices(policyPath, scheduleRestart),
        validateSender,
      );
      disposeRuntime = unregister;
    }

    window.once('closed', disposeRuntime);
    window.once('ready-to-show', () => window.show());
    await window.loadURL(allowedUrl);
  };

  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

if (process.env.NODE_ENV !== 'test') {
  void bootstrapElectron();
}
