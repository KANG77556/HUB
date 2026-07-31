// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ConnectionState,
  DashboardSnapshot,
  SessionView,
  SyncSummary,
} from '../shared/contracts.js';
import type {
  BridgeResult,
  SchoolWorkHubBridge,
} from '../shared/bridge.js';
import { App } from './App.js';

const session: SessionView = {
  userId: '3d594650-3436-4bc4-a593-8d9eea56f26d',
  displayName: '김선생',
  schoolName: '샘플학교',
  departmentNames: ['교무부'],
  roles: ['teacher', 'teacher_lead'],
  permissions: ['dashboard.read', 'documents.read', 'calendar.read'],
};
const dashboard: DashboardSnapshot = {
  generatedAt: '2026-07-31T07:20:00.000Z',
  metrics: [
    { key: 'submissions.pending', count: 2 },
    { key: 'documents.recent', count: 4 },
  ],
  scheduleItems: [
    {
      id: 'schedule-1',
      title: '교무회의',
      status: 'scheduled',
      updatedAt: '2026-07-31T07:10:00.000Z',
    },
  ],
  documentItems: [
    {
      id: 'document-1',
      title: '가정통신문',
      status: 'published',
      updatedAt: '2026-07-31T07:00:00.000Z',
    },
  ],
};
const online: ConnectionState = {
  kind: 'online',
  lastSyncAt: dashboard.generatedAt,
};

function success<T>(value: T): BridgeResult<T> {
  return { ok: true, value };
}

type EventCallbacks = {
  connection: ((state: ConnectionState) => void) | null;
  summary: ((summary: SyncSummary) => void) | null;
  invalidated: (() => void) | null;
};

function createBridge(options: {
  restored?: SessionView | null;
  connection?: ConnectionState;
} = {}): {
  bridge: SchoolWorkHubBridge;
  callbacks: EventCallbacks;
} {
  const callbacks: EventCallbacks = {
    connection: null,
    summary: null,
    invalidated: null,
  };
  const restored = options.restored ?? null;
  const connection = options.connection ?? online;
  const bridge: SchoolWorkHubBridge = {
    auth: {
      login: vi.fn<SchoolWorkHubBridge['auth']['login']>().mockResolvedValue(success(session)),
      restoreSession: vi
        .fn<SchoolWorkHubBridge['auth']['restoreSession']>()
        .mockResolvedValue(success(restored)),
      logout: vi.fn<SchoolWorkHubBridge['auth']['logout']>().mockResolvedValue(success(undefined)),
    },
    dashboard: {
      load: vi
        .fn<SchoolWorkHubBridge['dashboard']['load']>()
        .mockResolvedValue(success(dashboard)),
    },
    connection: {
      getStatus: vi
        .fn<SchoolWorkHubBridge['connection']['getStatus']>()
        .mockResolvedValue(success(connection)),
    },
    events: {
      onConnectionChanged: (listener) => {
        callbacks.connection = listener;
        return () => {
          if (callbacks.connection === listener) {
            callbacks.connection = null;
          }
        };
      },
      onSyncSummary: (listener) => {
        callbacks.summary = listener;
        return () => {
          if (callbacks.summary === listener) {
            callbacks.summary = null;
          }
        };
      },
      onSessionInvalidated: (listener) => {
        callbacks.invalidated = listener;
        return () => {
          if (callbacks.invalidated === listener) {
            callbacks.invalidated = null;
          }
        };
      },
    },
  };
  return { bridge, callbacks };
}

function installBridge(bridge: SchoolWorkHubBridge): void {
  window.schoolWorkHub = bridge;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('App', () => {
  it('restores to the login screen when no session exists', async () => {
    const { bridge } = createBridge();
    installBridge(bridge);

    render(<App />);

    expect(screen.getByText('세션을 확인하고 있습니다.')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: '교직원 로그인' })).toBeInTheDocument();
    expect(bridge.dashboard.load).not.toHaveBeenCalled();
  });

  it('logs in, shows all role badges, and hides unauthorized navigation', async () => {
    const { bridge } = createBridge();
    installBridge(bridge);
    render(<App />);
    await screen.findByRole('heading', { name: '교직원 로그인' });

    fireEvent.change(screen.getByLabelText('학교 코드'), {
      target: { value: 'sample-school' },
    });
    fireEvent.change(screen.getByLabelText('사용자 이름'), {
      target: { value: 'teacher' },
    });
    fireEvent.change(screen.getByLabelText('비밀번호'), {
      target: { value: 'password' },
    });
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));

    expect(await screen.findByRole('heading', { name: '업무 대시보드' })).toBeInTheDocument();
    expect(screen.getByText('teacher')).toBeInTheDocument();
    expect(screen.getByText('teacher_lead')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '문서·지식' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '일정·회의' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '자료 제출' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '구성원' })).not.toBeInTheDocument();
    expect(bridge.auth.login).toHaveBeenCalledWith({
      schoolCode: 'sample-school',
      username: 'teacher',
      password: 'password',
    });
  });

  it('shows a fixed offline banner and disables write actions', async () => {
    const offline: ConnectionState = {
      kind: 'offline-readonly',
      lastSyncAt: '2026-07-30T07:20:00.000Z',
    };
    const { bridge } = createBridge({ restored: session, connection: offline });
    installBridge(bridge);

    render(<App />);

    expect(await screen.findByRole('heading', { name: '업무 대시보드' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('오프라인 읽기 전용');
    expect(screen.getByRole('button', { name: '문서 작성' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '자료 제출하기' })).toBeDisabled();
  });

  it('renders a reconnection summary without replacing the dashboard', async () => {
    const { bridge, callbacks } = createBridge({ restored: session });
    installBridge(bridge);
    render(<App />);
    await screen.findByRole('heading', { name: '업무 대시보드' });

    act(() => {
      callbacks.summary?.({
        newScheduleCount: 2,
        changedScheduleCount: 1,
        newDocumentCount: 3,
        changedSubmissionCount: 1,
      });
    });

    expect(screen.getByText('새 일정 2건 · 변경 일정 1건 · 새 문서 3건 · 제출 상태 변경 1건')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '업무 대시보드' })).toBeInTheDocument();
  });

  it('hides cached business data on a security-blocked state', async () => {
    const blocked: ConnectionState = {
      kind: 'security-blocked',
      code: 'CERTIFICATE_MISMATCH',
    };
    const { bridge } = createBridge({ restored: session, connection: blocked });
    installBridge(bridge);

    render(<App />);

    expect(await screen.findByRole('heading', { name: '학교 서버 연결을 차단했습니다' })).toBeInTheDocument();
    expect(screen.queryByText('가정통신문')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '업무 대시보드' })).not.toBeInTheDocument();
  });

  it('logs out and returns to a cleared login screen', async () => {
    const { bridge } = createBridge({ restored: session });
    installBridge(bridge);
    render(<App />);
    await screen.findByRole('heading', { name: '업무 대시보드' });

    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));

    await waitFor(() => {
      expect(bridge.auth.logout).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByRole('heading', { name: '교직원 로그인' })).toBeInTheDocument();
    expect(screen.getByLabelText('비밀번호')).toHaveValue('');
  });
});
