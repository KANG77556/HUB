import type {
  ConnectionState,
  DashboardSnapshot,
  SessionView,
  SyncSummary,
} from '../../shared/contracts.js';
import { ConnectionBanner } from './ConnectionBanner.js';

const navigation = [
  { id: 'dashboard', label: '대시보드', permission: null },
  { id: 'documents', label: '문서·지식', permission: 'documents.read' },
  { id: 'submissions', label: '자료 제출', permission: 'submissions.read' },
  { id: 'calendar', label: '일정·회의', permission: 'calendar.read' },
  { id: 'users', label: '구성원', permission: 'users.manage' },
] as const;

const metricLabels: Record<string, string> = {
  'submissions.pending': '대기 중인 제출',
  'documents.recent': '최근 문서',
  'calendar.upcoming': '다가오는 일정',
  'announcements.unread': '읽지 않은 알림',
};

function formatSummary(summary: SyncSummary): string {
  return [
    `새 일정 ${summary.newScheduleCount}건`,
    `변경 일정 ${summary.changedScheduleCount}건`,
    `새 문서 ${summary.newDocumentCount}건`,
    `제출 상태 변경 ${summary.changedSubmissionCount}건`,
  ].join(' · ');
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ko-KR');
}

export type DashboardScreenProps = {
  session: SessionView;
  dashboard: DashboardSnapshot;
  connection: ConnectionState;
  summary: SyncSummary | null;
  busy: boolean;
  onLogout: () => Promise<void>;
};

export function DashboardScreen({
  session,
  dashboard,
  connection,
  summary,
  busy,
  onLogout,
}: DashboardScreenProps): React.JSX.Element {
  const permissions = new Set(session.permissions);
  const writeLocked = connection.kind !== 'online';
  const visibleNavigation = navigation.filter(
    (item) => item.permission === null || permissions.has(item.permission),
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark compact" aria-hidden="true">SW</div>
          <div>
            <strong>SchoolWorkHub</strong>
            <span>교사용 클라이언트</span>
          </div>
        </div>

        <nav className="navigation" aria-label="주요 메뉴">
          {visibleNavigation.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={index === 0 ? 'navigation-item active' : 'navigation-item'}
            >
              <span className="nav-dot" aria-hidden="true" />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-account">
          <span>{session.schoolName}</span>
          <strong>{session.displayName}</strong>
          <small>{session.departmentNames.join(' · ') || '부서 미지정'}</small>
        </div>
      </aside>

      <main className="dashboard-main">
        <ConnectionBanner connection={connection} />

        <header className="dashboard-header">
          <div>
            <p className="eyebrow">오늘의 학교 업무</p>
            <h1>업무 대시보드</h1>
          </div>
          <div className="header-actions">
            <label className="search-box">
              <span className="sr-only">전체 검색</span>
              <input type="search" placeholder="문서, 일정, 구성원 검색" aria-label="전체 검색" />
            </label>
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => void onLogout()}
            >
              로그아웃
            </button>
          </div>
        </header>

        <section className="identity-strip" aria-label="현재 역할과 연결 상태">
          <div className="role-list">
            {session.roles.map((role) => (
              <span className="role-badge" key={role}>{role}</span>
            ))}
          </div>
          <span className={`connection-pill ${connection.kind}`}>
            {connection.kind === 'online'
              ? '온라인'
              : connection.kind === 'reconnecting'
                ? '재연결 중'
                : '읽기 전용'}
          </span>
        </section>

        {summary === null ? null : (
          <div className="sync-summary" aria-live="polite">
            <strong>재연결 동기화 완료</strong>
            <span>{formatSummary(summary)}</span>
          </div>
        )}

        <section className="metric-grid" aria-label="업무 지표">
          {dashboard.metrics.length === 0 ? (
            <article className="metric-card empty-card">
              <span>표시할 지표가 없습니다.</span>
            </article>
          ) : dashboard.metrics.map((metric) => (
            <article className="metric-card" key={metric.key}>
              <span>{metricLabels[metric.key] ?? metric.key}</span>
              <strong>{metric.count}</strong>
              <small>마지막 동기화 기준</small>
            </article>
          ))}
        </section>

        <section className="dashboard-grid">
          <article className="content-card workflow-card">
            <div className="card-heading">
              <div>
                <p className="eyebrow">빠른 업무</p>
                <h2>업무 시작</h2>
              </div>
              <span>{writeLocked ? '읽기 전용' : '사용 가능'}</span>
            </div>
            <div className="quick-actions">
              <button
                type="button"
                disabled={writeLocked || !permissions.has('documents.write')}
              >
                문서 작성
              </button>
              <button
                type="button"
                disabled={writeLocked || !permissions.has('submissions.write')}
              >
                자료 제출하기
              </button>
            </div>
            <p className="muted small-copy">
              권한이 없거나 오프라인 상태에서는 변경 작업을 실행할 수 없습니다.
            </p>
          </article>

          <article className="content-card">
            <div className="card-heading">
              <div>
                <p className="eyebrow">일정</p>
                <h2>다가오는 업무</h2>
              </div>
              <span>{dashboard.scheduleItems.length}건</span>
            </div>
            <ul className="item-list">
              {dashboard.scheduleItems.length === 0 ? (
                <li className="empty-list">예정된 일정이 없습니다.</li>
              ) : dashboard.scheduleItems.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <span>{formatTime(item.updatedAt)}</span>
                  </div>
                  <span className="status-chip">{item.status}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="content-card document-card">
            <div className="card-heading">
              <div>
                <p className="eyebrow">문서·지식</p>
                <h2>최근 문서</h2>
              </div>
              <span>{dashboard.documentItems.length}건</span>
            </div>
            <ul className="item-list">
              {dashboard.documentItems.length === 0 ? (
                <li className="empty-list">최근 문서가 없습니다.</li>
              ) : dashboard.documentItems.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <span>{formatTime(item.updatedAt)}</span>
                  </div>
                  <span className="status-chip">{item.status}</span>
                </li>
              ))}
            </ul>
          </article>
        </section>
      </main>
    </div>
  );
}
