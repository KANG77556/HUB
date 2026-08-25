import type { ConnectionState } from '../../shared/contracts.js';

export type ConnectionBannerProps = {
  connection: ConnectionState;
};

function formatLastSync(value: string | null): string {
  if (value === null) {
    return '동기화 기록 없음';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString('ko-KR');
}

export function ConnectionBanner({
  connection,
}: ConnectionBannerProps): React.JSX.Element | null {
  if (connection.kind === 'online' || connection.kind === 'security-blocked') {
    return null;
  }

  const reconnecting = connection.kind === 'reconnecting';
  return (
    <div className="connection-banner" role="status" aria-live="polite">
      <strong>{reconnecting ? '학교 서버에 다시 연결하는 중' : '오프라인 읽기 전용'}</strong>
      <span>
        {reconnecting
          ? '현재 화면을 유지하면서 변경 사항을 확인하고 있습니다.'
          : '수정과 제출 기능이 잠겼습니다.'}
        {' · 마지막 동기화: '}
        {formatLastSync(connection.lastSyncAt)}
      </span>
    </div>
  );
}
