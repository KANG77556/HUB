import type {
  ConnectionState,
  DashboardSnapshot,
  LoginInput,
  SessionView,
  SyncSummary,
} from './contracts.js';
import type { AppErrorView } from './errors.js';

export type BridgeResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: AppErrorView };

export type SchoolWorkHubBridge = {
  auth: {
    login: (input: LoginInput) => Promise<BridgeResult<SessionView>>;
    restoreSession: () => Promise<BridgeResult<SessionView | null>>;
    logout: () => Promise<BridgeResult<void>>;
  };
  dashboard: {
    load: () => Promise<BridgeResult<DashboardSnapshot>>;
  };
  connection: {
    getStatus: () => Promise<BridgeResult<ConnectionState>>;
  };
  events: {
    onConnectionChanged: (listener: (state: ConnectionState) => void) => () => void;
    onSyncSummary: (listener: (summary: SyncSummary) => void) => () => void;
    onSessionInvalidated: (listener: () => void) => () => void;
  };
};
