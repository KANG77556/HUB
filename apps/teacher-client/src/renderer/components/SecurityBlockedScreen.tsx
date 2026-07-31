export type SecurityBlockedScreenProps = {
  code: string;
};

export function SecurityBlockedScreen({
  code,
}: SecurityBlockedScreenProps): React.JSX.Element {
  return (
    <main className="security-blocked-screen">
      <section className="security-blocked-card">
        <div className="security-icon" aria-hidden="true">!</div>
        <p className="eyebrow">보안 차단</p>
        <h1>학교 서버 연결을 차단했습니다</h1>
        <p>
          서버 인증서 또는 학교 서버 신원을 확인할 수 없어 업무 자료를
          표시하지 않았습니다. 저장된 오프라인 자료도 이 화면에서는 열리지 않습니다.
        </p>
        <dl>
          <div>
            <dt>진단 코드</dt>
            <dd>{code}</dd>
          </div>
          <div>
            <dt>필요한 조치</dt>
            <dd>학교 시스템 관리자에게 서버 설정 확인을 요청하세요.</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
