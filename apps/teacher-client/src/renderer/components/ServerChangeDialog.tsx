import { useState, type FormEvent } from 'react';

import type { ServerChangeInput } from '../../shared/contracts.js';
import './ServerChangeDialog.css';

export type ServerChangeDialogProps = {
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (input: ServerChangeInput) => Promise<boolean>;
};

export function ServerChangeDialog({
  busy,
  error,
  onCancel,
  onSubmit,
}: ServerChangeDialogProps): React.JSX.Element {
  const [baseUrl, setBaseUrl] = useState('');
  const [schoolCode, setSchoolCode] = useState('');
  const [currentFingerprint, setCurrentFingerprint] = useState('');
  const [nextFingerprint, setNextFingerprint] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    try {
      const changed = await onSubmit({
        baseUrl,
        schoolCode,
        currentFingerprint,
        nextFingerprint: nextFingerprint.trim().length === 0
          ? null
          : nextFingerprint,
        adminUsername,
        adminPassword,
      });
      if (changed) {
        setBaseUrl('');
        setSchoolCode('');
        setCurrentFingerprint('');
        setNextFingerprint('');
        setAdminUsername('');
      }
    } finally {
      setAdminPassword('');
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="server-change-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="server-change-title"
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">관리자 복구</p>
            <h2 id="server-change-title">학교 서버 설정 변경</h2>
          </div>
          <button
            className="dialog-close"
            type="button"
            aria-label="닫기"
            onClick={onCancel}
            disabled={busy}
          >
            ×
          </button>
        </div>

        <p className="dialog-description">
          새 서버가 이 학교의 SchoolWorkHub인지 확인하고 관리자 권한을 검증한 뒤에만
          기존 설정을 교체합니다.
        </p>

        {error === null ? null : (
          <div className="form-message" role="alert">{error}</div>
        )}

        <form className="server-change-form" onSubmit={(event) => void submit(event)}>
          <label className="full-width-field">
            <span>새 서버 주소</span>
            <input
              name="baseUrl"
              type="url"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.currentTarget.value)}
              placeholder="https://school.example/"
              autoComplete="url"
              required
              disabled={busy}
            />
          </label>

          <label className="full-width-field">
            <span>학교 코드</span>
            <input
              name="schoolCode"
              value={schoolCode}
              onChange={(event) => setSchoolCode(event.currentTarget.value)}
              autoComplete="organization"
              minLength={2}
              maxLength={30}
              required
              disabled={busy}
            />
          </label>

          <label className="full-width-field">
            <span>현재 인증서 지문</span>
            <input
              name="currentFingerprint"
              value={currentFingerprint}
              onChange={(event) => setCurrentFingerprint(event.currentTarget.value)}
              autoComplete="off"
              spellCheck={false}
              minLength={64}
              maxLength={95}
              required
              disabled={busy}
            />
          </label>

          <label className="full-width-field">
            <span>다음 인증서 지문 (선택)</span>
            <input
              name="nextFingerprint"
              value={nextFingerprint}
              onChange={(event) => setNextFingerprint(event.currentTarget.value)}
              autoComplete="off"
              spellCheck={false}
              maxLength={95}
              disabled={busy}
            />
          </label>

          <label>
            <span>관리자 사용자 이름</span>
            <input
              name="adminUsername"
              value={adminUsername}
              onChange={(event) => setAdminUsername(event.currentTarget.value)}
              autoComplete="username"
              minLength={3}
              maxLength={80}
              required
              disabled={busy}
            />
          </label>

          <label>
            <span>관리자 비밀번호</span>
            <input
              name="adminPassword"
              type="password"
              value={adminPassword}
              onChange={(event) => setAdminPassword(event.currentTarget.value)}
              autoComplete="current-password"
              maxLength={256}
              required
              disabled={busy}
            />
          </label>

          <p className="dialog-security-note full-width-field">
            관리자 비밀번호와 임시 토큰은 저장되지 않으며, 확인이 끝나면 임시 세션을 폐기합니다.
          </p>

          <div className="dialog-actions full-width-field">
            <button
              className="secondary-button"
              type="button"
              onClick={onCancel}
              disabled={busy}
            >
              취소
            </button>
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? '확인 중…' : '연결 확인 후 변경'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
