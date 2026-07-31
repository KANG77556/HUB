import { useState, type FormEvent } from 'react';

import type { LoginInput } from '../../shared/contracts.js';

export type LoginScreenProps = {
  message: string | null;
  busy: boolean;
  onLogin: (input: LoginInput) => Promise<void>;
};

export function LoginScreen({
  message,
  busy,
  onLogin,
}: LoginScreenProps): React.JSX.Element {
  const [schoolCode, setSchoolCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    try {
      await onLogin({ schoolCode, username, password });
    } finally {
      setPassword('');
    }
  };

  return (
    <main className="login-shell">
      <section className="login-brand" aria-label="SchoolWorkHub 소개">
        <div className="brand-mark" aria-hidden="true">SW</div>
        <p className="eyebrow">SchoolWorkHub</p>
        <h1>학교 업무의 흐름을<br />한곳에서 연결합니다.</h1>
        <p className="brand-copy">
          권한에 맞는 일정, 문서, 제출 업무를 안전하게 확인하고
          네트워크가 끊겨도 최근 동기화 자료를 읽을 수 있습니다.
        </p>
        <div className="security-note">
          <strong>보안 연결</strong>
          <span>학교 서버 인증서와 Windows 사용자 자격 증명을 확인합니다.</span>
        </div>
      </section>

      <section className="login-panel">
        <form className="login-form" onSubmit={(event) => void submit(event)}>
          <div>
            <p className="eyebrow">교사용 클라이언트</p>
            <h2>교직원 로그인</h2>
            <p className="muted">학교에서 안내받은 계정으로 로그인하세요.</p>
          </div>

          {message === null ? null : (
            <div className="form-message" role="alert">{message}</div>
          )}

          <label>
            <span>학교 코드</span>
            <input
              name="schoolCode"
              value={schoolCode}
              onChange={(event) => setSchoolCode(event.currentTarget.value)}
              autoComplete="organization"
              required
              minLength={2}
              maxLength={30}
              disabled={busy}
            />
          </label>

          <label>
            <span>사용자 이름</span>
            <input
              name="username"
              value={username}
              onChange={(event) => setUsername(event.currentTarget.value)}
              autoComplete="username"
              required
              minLength={3}
              maxLength={80}
              disabled={busy}
            />
          </label>

          <label>
            <span>비밀번호</span>
            <input
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              autoComplete="current-password"
              required
              maxLength={256}
              disabled={busy}
            />
          </label>

          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? '로그인 중…' : '로그인'}
          </button>

          <p className="login-footnote">
            로그인 정보는 이 화면에 저장되지 않으며, 갱신 자격 증명은
            Windows 자격 증명 관리자에서 보호됩니다.
          </p>
        </form>
      </section>
    </main>
  );
}
