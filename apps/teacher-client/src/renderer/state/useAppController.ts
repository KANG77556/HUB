import { useCallback, useEffect, useState } from 'react';

import type {
  ConnectionState,
  DashboardSnapshot,
  LoginInput,
  SessionView,
  SyncSummary,
} from '../../shared/contracts.js';
import type { AppErrorView } from '../../shared/errors.js';

export type AppState =
  | { kind: 'restoring' }
  | { kind: 'signed-out'; message: string | null }
  | {
      kind: 'ready';
      session: SessionView;
      dashboard: DashboardSnapshot;
      connection: ConnectionState;
    }
  | { kind: 'security-blocked'; code: string };

export type AppController = {
  state: AppState;
  summary: SyncSummary | null;
  busy: boolean;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
};

function errorMessage(error: AppErrorView): string {
  return error.message;
}

function unexpectedMessage(): string {
  return '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

export function useAppController(): AppController {
  const [state, setState] = useState<AppState>({ kind: 'restoring' });
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const loadReadyState = useCallback(async (session: SessionView): Promise<void> => {
    try {
      const [dashboardResult, connectionResult] = await Promise.all([
        window.schoolWorkHub.dashboard.load(),
        window.schoolWorkHub.connection.getStatus(),
      ]);

      if (!connectionResult.ok) {
        setState({
          kind: 'signed-out',
          message: errorMessage(connectionResult.error),
        });
        return;
      }
      if (connectionResult.value.kind === 'security-blocked') {
        setState({
          kind: 'security-blocked',
          code: connectionResult.value.code,
        });
        return;
      }
      if (!dashboardResult.ok) {
        setState({
          kind: 'signed-out',
          message: errorMessage(dashboardResult.error),
        });
        return;
      }

      setState({
        kind: 'ready',
        session,
        dashboard: dashboardResult.value,
        connection: connectionResult.value,
      });
    } catch {
      setState({ kind: 'signed-out', message: unexpectedMessage() });
    }
  }, []);

  useEffect(() => {
    let active = true;
    const cleanupConnection = window.schoolWorkHub.events.onConnectionChanged(
      (connection) => {
        if (!active) {
          return;
        }
        if (connection.kind === 'security-blocked') {
          setSummary(null);
          setState({ kind: 'security-blocked', code: connection.code });
          return;
        }
        setState((current) =>
          current.kind === 'ready'
            ? { ...current, connection }
            : current,
        );
      },
    );
    const cleanupSummary = window.schoolWorkHub.events.onSyncSummary(
      (nextSummary) => {
        if (active) {
          setSummary(nextSummary);
        }
      },
    );
    const cleanupInvalidated = window.schoolWorkHub.events.onSessionInvalidated(
      () => {
        if (active) {
          setSummary(null);
          setState({
            kind: 'signed-out',
            message: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
          });
        }
      },
    );

    void (async () => {
      try {
        const result = await window.schoolWorkHub.auth.restoreSession();
        if (!active) {
          return;
        }
        if (!result.ok) {
          setState({
            kind: 'signed-out',
            message: errorMessage(result.error),
          });
          return;
        }
        if (result.value === null) {
          setState({ kind: 'signed-out', message: null });
          return;
        }
        await loadReadyState(result.value);
      } catch {
        if (active) {
          setState({ kind: 'signed-out', message: unexpectedMessage() });
        }
      }
    })();

    return () => {
      active = false;
      cleanupConnection();
      cleanupSummary();
      cleanupInvalidated();
    };
  }, [loadReadyState]);

  const login = useCallback(
    async (input: LoginInput): Promise<void> => {
      setBusy(true);
      setSummary(null);
      try {
        const result = await window.schoolWorkHub.auth.login(input);
        if (!result.ok) {
          setState({
            kind: 'signed-out',
            message: errorMessage(result.error),
          });
          return;
        }
        await loadReadyState(result.value);
      } catch {
        setState({ kind: 'signed-out', message: unexpectedMessage() });
      } finally {
        setBusy(false);
      }
    },
    [loadReadyState],
  );

  const logout = useCallback(async (): Promise<void> => {
    setBusy(true);
    setSummary(null);
    let message: string | null = null;
    try {
      const result = await window.schoolWorkHub.auth.logout();
      if (!result.ok) {
        message = errorMessage(result.error);
      }
    } catch {
      message = unexpectedMessage();
    } finally {
      setState({ kind: 'signed-out', message });
      setBusy(false);
    }
  }, []);

  return { state, summary, busy, login, logout };
}
