export const IPC_CHANNELS = {
  authLogin: 'auth:login',
  authRestore: 'auth:restore-session',
  authLogout: 'auth:logout',
  dashboardLoad: 'dashboard:load',
  connectionStatus: 'connection:get-status',
  serverChange: 'settings:request-server-change',
  connectionChanged: 'event:connection-changed',
  syncSummary: 'event:sync-summary',
  sessionInvalidated: 'event:session-invalidated',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
