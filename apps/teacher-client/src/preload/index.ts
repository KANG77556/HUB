import { contextBridge, ipcRenderer } from 'electron';

import type {
  BridgeResult,
  SchoolWorkHubBridge,
} from '../shared/bridge.js';
import {
  connectionStateSchema,
  syncSummarySchema,
  type ConnectionState,
  type DashboardSnapshot,
  type LoginInput,
  type SessionView,
  type SyncSummary,
} from '../shared/contracts.js';
import { IPC_CHANNELS } from '../main/ipc/channels.js';

export type IpcRendererPort = {
  invoke: (channel: string, ...args: readonly unknown[]) => Promise<unknown>;
  on: (
    channel: string,
    listener: (event: unknown, payload?: unknown) => void,
  ) => void;
  removeListener: (
    channel: string,
    listener: (event: unknown, payload?: unknown) => void,
  ) => void;
};

async function invoke<T>(
  renderer: IpcRendererPort,
  channel: string,
  ...args: readonly unknown[]
): Promise<BridgeResult<T>> {
  const result: unknown = await renderer.invoke(channel, ...args);
  return result as BridgeResult<T>;
}

function subscribeValidated<T>(
  renderer: IpcRendererPort,
  channel: string,
  parse: (value: unknown) => T | null,
  listener: (value: T) => void,
): () => void {
  const wrapped = (_event: unknown, payload?: unknown): void => {
    const parsed = parse(payload);
    if (parsed !== null) {
      listener(parsed);
    }
  };
  renderer.on(channel, wrapped);
  return () => {
    renderer.removeListener(channel, wrapped);
  };
}

export function createSchoolWorkHubBridge(
  renderer: IpcRendererPort,
): SchoolWorkHubBridge {
  return {
    auth: {
      login: (input: LoginInput) =>
        invoke<SessionView>(renderer, IPC_CHANNELS.authLogin, input),
      restoreSession: () =>
        invoke<SessionView | null>(renderer, IPC_CHANNELS.authRestore),
      logout: () => invoke<void>(renderer, IPC_CHANNELS.authLogout),
    },
    dashboard: {
      load: () =>
        invoke<DashboardSnapshot>(renderer, IPC_CHANNELS.dashboardLoad),
    },
    connection: {
      getStatus: () =>
        invoke<ConnectionState>(renderer, IPC_CHANNELS.connectionStatus),
    },
    events: {
      onConnectionChanged: (listener) =>
        subscribeValidated(
          renderer,
          IPC_CHANNELS.connectionChanged,
          (value) => {
            const parsed = connectionStateSchema.safeParse(value);
            return parsed.success ? parsed.data : null;
          },
          listener,
        ),
      onSyncSummary: (listener) =>
        subscribeValidated<SyncSummary>(
          renderer,
          IPC_CHANNELS.syncSummary,
          (value) => {
            const parsed = syncSummarySchema.safeParse(value);
            return parsed.success ? parsed.data : null;
          },
          listener,
        ),
      onSessionInvalidated: (listener) => {
        const wrapped = (): void => listener();
        renderer.on(IPC_CHANNELS.sessionInvalidated, wrapped);
        return () => {
          renderer.removeListener(IPC_CHANNELS.sessionInvalidated, wrapped);
        };
      },
    },
  };
}

const rendererPort: IpcRendererPort = {
  invoke: async (channel, ...args) => {
    const result: unknown = await ipcRenderer.invoke(channel, ...args);
    return result;
  },
  on: (channel, listener) => {
    ipcRenderer.on(channel, listener);
  },
  removeListener: (channel, listener) => {
    ipcRenderer.removeListener(channel, listener);
  },
};

contextBridge.exposeInMainWorld(
  'schoolWorkHub',
  createSchoolWorkHubBridge(rendererPort),
);
