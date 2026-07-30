import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { BrowserWindowConstructorOptions } from 'electron';

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

async function bootstrapElectron(): Promise<void> {
  const { app, BrowserWindow } = await import('electron');
  app.enableSandbox();

  await app.whenReady();

  const preloadPath = join(import.meta.dirname, '..', 'preload', 'index.js');
  const rendererPath = join(import.meta.dirname, '..', '..', 'renderer', 'index.html');
  const packagedUrl = pathToFileURL(rendererPath).toString();
  const developmentUrl = process.env.SWH_TEACHER_DEV_URL;
  const allowedUrl =
    developmentUrl !== undefined && isAllowedDevelopmentUrl(developmentUrl)
      ? developmentUrl
      : packagedUrl;

  const window = new BrowserWindow(createWindowOptions(preloadPath));
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, targetUrl) => {
    if (targetUrl !== allowedUrl) {
      event.preventDefault();
    }
  });
  window.once('ready-to-show', () => window.show());
  await window.loadURL(allowedUrl);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void bootstrapElectron();
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
