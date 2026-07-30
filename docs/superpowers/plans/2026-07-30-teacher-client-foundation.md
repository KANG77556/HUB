# SchoolWorkHub 교사용 클라이언트 기반 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인, 자동 세션 복구, 복수 역할 권한 통합 대시보드, DPAPI 보호 오프라인 읽기 전용 캐시, TLS 인증서 지문 고정과 보호된 서버 변경이 실제 API와 연동되는 Windows Electron 교사용 클라이언트를 만든다.

**Architecture:** FastAPI는 15분 액세스 토큰과 회전형 30일 갱신 토큰, 서버 식별 응답, 대시보드 스냅샷을 제공한다. Electron 메인 프로세스가 네트워크, 토큰, Windows 자격 증명 관리자, DPAPI, SQLite, 인증서 검증을 독점하고, 프리로드는 고정된 타입의 IPC만 React 렌더러에 노출한다.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2, PostgreSQL 16, Alembic, Electron 43.2.0, Node.js 24, React 19, TypeScript 5.7, Vite 6, Zod 4.4.3, `@github/keytar` 7.10.6, `better-sqlite3` 13.0.1, Vitest 4.1.10, Windows Credential Manager, Electron `safeStorage`/Windows DPAPI.

## Global Constraints

- 액세스 토큰 수명은 정확히 15분이며 Electron 메인 프로세스 메모리에만 둔다.
- 갱신 토큰 수명은 정확히 30일이며 Windows 자격 증명 관리자에만 저장한다.
- 서버에는 갱신 토큰 원문 대신 SHA-256 해시만 저장하고 갱신 때마다 토큰을 회전한다.
- 렌더러에는 토큰, 서버 정책 파일 경로, 인증서 원문, 원시 IPC 객체를 전달하지 않는다.
- `BrowserWindow`는 `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`를 사용한다.
- 오프라인 캐시는 최근 30일의 대시보드·일정·문서 목록·제출 요약·권한 스냅샷만 저장한다.
- 문서 본문, 첨부파일, 비밀번호, 액세스 토큰, 갱신 토큰은 캐시에 저장하지 않는다.
- 오프라인 상태에서는 모든 생성·수정·제출 동작을 차단하고 조회만 허용한다.
- Chromium의 인증서 체인·호스트 검증 결과가 `OK`일 때만 현재 또는 다음 SHA-256 지문을 추가 검증한다.
- 인증서 지문이 맞지 않으면 오프라인 캐시를 포함한 모든 업무 화면을 차단한다.
- 서버 주소 변경은 관리자 인증, 서버 식별, API 버전, 지문 시험 연결이 모두 성공한 후 원자적으로 저장한다.
- 로그아웃, 갱신 토큰 거부, 계정 비활성화 시 갱신 토큰과 해당 사용자 캐시를 즉시 삭제한다.
- API는 Ruff와 strict mypy를 통과해야 한다.
- 클라이언트는 TypeScript strict, ESLint, Vitest, Windows CI를 통과해야 한다.

## File Structure Map

### API server

- `services/api-server/src/schoolworkhub/models.py`: 갱신 세션 영속 모델.
- `services/api-server/src/schoolworkhub/security.py`: 액세스 토큰과 불투명 갱신 토큰 생성·해시.
- `services/api-server/src/schoolworkhub/refresh_sessions.py`: 갱신 세션 발급, 회전, 폐기.
- `services/api-server/src/schoolworkhub/schemas.py`: 인증, 서버 식별, 대시보드 응답 계약.
- `services/api-server/src/schoolworkhub/routers/auth.py`: 로그인, 갱신, 로그아웃, 현재 사용자.
- `services/api-server/src/schoolworkhub/routers/system.py`: 서버 신원과 API 버전 응답.
- `services/api-server/src/schoolworkhub/routers/dashboard.py`: 권한 통합 대시보드 스냅샷.
- `services/api-server/alembic/versions/0002_refresh_sessions.py`: 갱신 세션 테이블.

### Electron main and preload

- `apps/teacher-client/src/shared/contracts.ts`: IPC와 API 공유 타입·Zod 스키마.
- `apps/teacher-client/src/shared/errors.ts`: 공개 오류 분류.
- `apps/teacher-client/src/main/index.ts`: 앱 시작과 보안 BrowserWindow.
- `apps/teacher-client/src/main/ipc/registerIpc.ts`: 고정 IPC 핸들러.
- `apps/teacher-client/src/main/security/credentialStore.ts`: Windows Credential Manager 어댑터.
- `apps/teacher-client/src/main/security/cacheCrypto.ts`: AES-256-GCM 암호화와 DPAPI 키 보호.
- `apps/teacher-client/src/main/security/windowsIdentity.ts`: Windows SID 조회.
- `apps/teacher-client/src/main/config/serverPolicy.ts`: 서버 주소와 현재·다음 지문 정책.
- `apps/teacher-client/src/main/network/certificatePinning.ts`: TLS 체인·호스트·지문 검증.
- `apps/teacher-client/src/main/network/apiClient.ts`: 토큰 비노출 API 클라이언트.
- `apps/teacher-client/src/main/auth/authService.ts`: 로그인, 자동 복구, 단일 갱신 잠금, 로그아웃.
- `apps/teacher-client/src/main/storage/cacheRepository.ts`: 암호화 SQLite 스냅샷 저장소.
- `apps/teacher-client/src/main/sync/syncService.ts`: 온라인·오프라인·재연결 상태와 증분 동기화.
- `apps/teacher-client/src/main/settings/serverChangeService.ts`: 관리자 보호 서버 변경.
- `apps/teacher-client/src/main/scripts/windowsSecuritySmoke.ts`: Windows Credential Manager와 DPAPI 실제 점검.
- `apps/teacher-client/src/preload/index.ts`: 제한된 `contextBridge` API.

### React renderer

- `apps/teacher-client/index.html`: Vite HTML 진입점.
- `apps/teacher-client/src/renderer/main.tsx`: React 진입점.
- `apps/teacher-client/src/renderer/App.tsx`: 상태별 최상위 화면 전환.
- `apps/teacher-client/src/renderer/state/useAppController.ts`: IPC 기반 앱 상태 조정.
- `apps/teacher-client/src/renderer/components/LoginScreen.tsx`: 로그인 화면.
- `apps/teacher-client/src/renderer/components/DashboardScreen.tsx`: 권한 기반 공통 대시보드.
- `apps/teacher-client/src/renderer/components/ConnectionBanner.tsx`: 오프라인·재연결 고정 배너.
- `apps/teacher-client/src/renderer/components/SecurityBlockedScreen.tsx`: 인증서 보안 차단.
- `apps/teacher-client/src/renderer/components/ServerChangeDialog.tsx`: 관리자 보호 서버 변경.
- `apps/teacher-client/src/renderer/types/global.d.ts`: `window.schoolWorkHub` 타입.
- `apps/teacher-client/src/renderer/styles.css`: 반응형 화면 스타일.

---

### Task 1: Restore a Green Baseline and Prepare the Toolchains

**Files:**
- Modify: `services/api-server/src/schoolworkhub/routers/admin.py:1-32`
- Modify: `services/api-server/pyproject.toml`
- Modify: `apps/teacher-client/package.json`
- Modify: `apps/teacher-client/tsconfig.main.json`
- Modify: `apps/teacher-client/tsconfig.renderer.json`
- Create: `apps/teacher-client/eslint.config.js`
- Create: `apps/teacher-client/vitest.config.ts`
- Create: `apps/teacher-client/src/test/setup.ts`

**Interfaces:**
- Consumes: 현재 API와 Electron 설정.
- Produces: `ruff`, `mypy`, `pytest`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` 기준점.

- [ ] **Step 1: Reproduce and fix the current API lint failure**

```bash
cd services/api-server
ruff check src/schoolworkhub/routers/admin.py
ruff check src/schoolworkhub/routers/admin.py --fix
ruff check .
```

Expected: 첫 명령은 import-order 오류를 재현하고 마지막 명령은 code 0으로 끝난다.

- [ ] **Step 2: Align API metadata and async test support**

Set the project version to `0.3.0`, keep Python `>=3.12,<3.13`, and add this development dependency:

```toml
"pytest-asyncio>=0.25,<1.0",
```

Add:

```toml
[tool.pytest.ini_options]
pythonpath = ["src"]
testpaths = ["tests"]
addopts = "-q --strict-markers --disable-warnings"
asyncio_mode = "auto"
```

Run:

```bash
mypy
pytest
```

Expected: existing checks pass.

- [ ] **Step 3: Replace the teacher-client scripts and dependencies**

Preserve `name`, `version`, `private`, and `type`, then use:

```json
{
  "main": "dist/electron/main/index.js",
  "scripts": {
    "build": "npm run build:electron && npm run build:renderer",
    "build:electron": "tsc -p tsconfig.main.json",
    "build:renderer": "vite build",
    "lint": "eslint src vite.config.ts vitest.config.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.main.json --noEmit && tsc -p tsconfig.renderer.json --noEmit",
    "rebuild:native": "electron-rebuild -f -w @github/keytar -w better-sqlite3",
    "verify": "npm run lint && npm run typecheck && npm test && npm run build"
  },
  "dependencies": {
    "@github/keytar": "7.10.6",
    "better-sqlite3": "13.0.1",
    "electron": "43.2.0",
    "react": "19.0.0",
    "react-dom": "19.0.0",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@electron/rebuild": "4.2.0",
    "@eslint/js": "9.39.2",
    "@testing-library/jest-dom": "6.8.0",
    "@testing-library/react": "16.3.0",
    "@types/better-sqlite3": "7.6.13",
    "@types/node": "24.1.0",
    "@types/react": "19.0.8",
    "@types/react-dom": "19.0.3",
    "@vitejs/plugin-react": "4.3.4",
    "eslint": "9.39.2",
    "jsdom": "26.1.0",
    "typescript": "5.7.3",
    "typescript-eslint": "8.46.1",
    "vite": "6.1.0",
    "vitest": "4.1.10"
  }
}
```

- [ ] **Step 4: Expand the TypeScript compilation roots**

`tsconfig.main.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022", "DOM"],
    "rootDir": "src",
    "outDir": "dist/electron",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "types": ["node", "electron"]
  },
  "include": ["src/main/**/*.ts", "src/preload/**/*.ts", "src/shared/**/*.ts"]
}
```

Keep the current renderer compiler options and set its include list to:

```json
["src/renderer", "src/shared", "src/test", "vite.config.ts", "vitest.config.ts"]
```

- [ ] **Step 5: Add ESLint and Vitest configuration**

`eslint.config.js`:

```js
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['src/**/*.{ts,tsx}', '*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.main.json', './tsconfig.renderer.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  { ignores: ['dist/**', 'node_modules/**'] },
);
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['src/test/setup.ts'],
    coverage: { reporter: ['text', 'lcov'] },
  },
});
```

`src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 6: Install, verify, and commit**

```bash
cd apps/teacher-client
npm install
npm run lint
npm run typecheck

git add services/api-server apps/teacher-client
git commit -m "chore: prepare teacher client toolchain"
```

### Task 2: Add Opaque Refresh-Session Persistence

**Files:**
- Modify: `services/api-server/src/schoolworkhub/settings.py`
- Modify: `services/api-server/src/schoolworkhub/models.py`
- Modify: `services/api-server/src/schoolworkhub/security.py`
- Create: `services/api-server/src/schoolworkhub/refresh_sessions.py`
- Create: `services/api-server/alembic/versions/0002_refresh_sessions.py`
- Create: `services/api-server/tests/test_refresh_sessions.py`

**Interfaces:**
- Produces: `issue_refresh_session(session, user)`, `rotate_refresh_session(session, raw_token)`, `revoke_refresh_session(session, raw_token)`.

- [ ] **Step 1: Write failing token-helper tests**

```python
from schoolworkhub.security import generate_refresh_token, hash_refresh_token


def test_refresh_token_is_random_and_hash_is_stable() -> None:
    first = generate_refresh_token()
    second = generate_refresh_token()
    assert first != second
    assert len(first) >= 43
    assert hash_refresh_token(first) == hash_refresh_token(first)
    assert hash_refresh_token(first) != hash_refresh_token(second)
```

```bash
cd services/api-server
pytest tests/test_refresh_sessions.py::test_refresh_token_is_random_and_hash_is_stable -v
```

Expected: missing-function failure.

- [ ] **Step 2: Add exact token settings and helpers**

```python
access_token_ttl_minutes: int = 15
refresh_token_ttl_days: int = 30
```

```python
import hashlib
import secrets
from uuid import uuid4


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
```

Add `"jti": str(uuid4())` to every access-token payload so two tokens issued in the same second remain distinct.

- [ ] **Step 3: Add the model and migration**

```python
class RefreshSession(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "refresh_sessions"

    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    school_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("schools.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
```

Migration revision is `0002_refresh_sessions`, down revision is `0001_identity_rbac`, and downgrade removes indexes before the table.

- [ ] **Step 4: Write failing service tests**

```python
issued = await issue_refresh_session(session, user)
assert issued.raw_token
assert issued.expires_at > datetime.now(UTC)

rotated_user, rotated = await rotate_refresh_session(session, issued.raw_token)
assert rotated_user.id == user.id
assert rotated.raw_token != issued.raw_token

with pytest.raises(RefreshSessionRejected):
    await rotate_refresh_session(session, issued.raw_token)

assert await revoke_refresh_session(session, rotated.raw_token) is True
assert await revoke_refresh_session(session, rotated.raw_token) is False
```

- [ ] **Step 5: Implement transactional issue, rotation, and revocation**

```python
@dataclass(frozen=True)
class IssuedRefreshSession:
    raw_token: str
    expires_at: datetime


class RefreshSessionRejected(ValueError):
    pass
```

Rotation selects the unrevoked hash with `with_for_update()`, rejects missing, expired, inactive-user, and school-mismatch states, marks the old row revoked, then inserts the replacement in the same transaction.

- [ ] **Step 6: Verify and commit**

```bash
alembic upgrade head
alembic downgrade 0001_identity_rbac
alembic upgrade head
ruff check .
mypy
pytest tests/test_refresh_sessions.py -v

git add services/api-server
git commit -m "feat: add refresh session persistence"
```

### Task 3: Expose Login, Refresh, Logout, and Expanded Current User Contracts

**Files:**
- Modify: `services/api-server/src/schoolworkhub/schemas.py`
- Modify: `services/api-server/src/schoolworkhub/routers/auth.py`
- Modify: `services/api-server/tests/test_auth.py`
- Modify: `services/api-server/tests/test_refresh_sessions.py`

**Interfaces:**
- Produces: `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`.

- [ ] **Step 1: Write failing HTTP contract tests**

```python
body = login_response.json()
assert body["token_type"] == "bearer"
assert body["expires_in_seconds"] == 900
assert body["refresh_expires_in_seconds"] == 2_592_000
assert body["access_token"]
assert body["refresh_token"]

refresh_response = client.post(
    "/api/v1/auth/refresh",
    json={"refresh_token": body["refresh_token"]},
)
assert refresh_response.status_code == 200
assert refresh_response.json()["refresh_token"] != body["refresh_token"]
assert refresh_response.json()["access_token"] != body["access_token"]
```

- [ ] **Step 2: Add exact schemas**

```python
class TokenPairResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in_seconds: int
    refresh_expires_in_seconds: int


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=32, max_length=512)


class LogoutRequest(BaseModel):
    refresh_token: str = Field(min_length=32, max_length=512)
```

Extend `CurrentUserResponse` with `school_name: str` and `department_names: list[str]`.

- [ ] **Step 3: Change login to issue and commit a token pair**

```python
issued = await issue_refresh_session(session, user)
await session.commit()
return TokenPairResponse(
    access_token=create_access_token(user.id, user.school_id),
    refresh_token=issued.raw_token,
    expires_in_seconds=settings.access_token_ttl_minutes * 60,
    refresh_expires_in_seconds=settings.refresh_token_ttl_days * 24 * 60 * 60,
)
```

The success audit row and refresh session must share one transaction.

- [ ] **Step 4: Add refresh and logout routes**

Refresh rotates once and returns a new pair. Logout always returns HTTP 204 after attempting revocation so callers cannot infer whether a token existed.

```python
@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(payload: LogoutRequest, session: SessionDep) -> None:
    await revoke_refresh_session(session, payload.refresh_token)
    await session.commit()
```

- [ ] **Step 5: Test reuse, expiry, deactivation, and logout**

Assert the old token returns 401 after rotation, a logged-out token returns 401, an expired database row returns 401, and a deactivated user cannot refresh.

- [ ] **Step 6: Verify and commit**

```bash
ruff check .
mypy
pytest --cov=schoolworkhub --cov-report=term-missing

git add services/api-server
git commit -m "feat: add rotating authentication sessions"
```

### Task 4: Add Server Identity and Dashboard Snapshot APIs

**Files:**
- Modify: `services/api-server/src/schoolworkhub/schemas.py`
- Create: `services/api-server/src/schoolworkhub/routers/system.py`
- Create: `services/api-server/src/schoolworkhub/routers/dashboard.py`
- Modify: `services/api-server/src/schoolworkhub/routers/__init__.py`
- Modify: `services/api-server/src/schoolworkhub/main.py`
- Create: `services/api-server/tests/test_dashboard.py`

**Interfaces:**
- Produces: `GET /api/v1/system/identity`, `GET /api/v1/dashboard`.

- [ ] **Step 1: Write failing identity and dashboard tests**

After bootstrap:

```python
assert client.get("/api/v1/system/identity").json() == {
    "service": "schoolworkhub",
    "api_version": "v1",
    "school_code": "sample-school",
    "school_name": "샘플학교",
}
```

Assert the dashboard rejects anonymous access and returns the authenticated user's deduplicated role and permission union.

- [ ] **Step 2: Add typed response contracts**

```python
class ServerIdentityResponse(BaseModel):
    service: str = "schoolworkhub"
    api_version: str = "v1"
    school_code: str | None
    school_name: str | None


class DashboardMetric(BaseModel):
    key: str
    count: int


class DashboardItemSummary(BaseModel):
    id: str
    title: str
    status: str
    updated_at: datetime


class DashboardSnapshotResponse(BaseModel):
    generated_at: datetime
    roles: list[str]
    permissions: list[str]
    metrics: list[DashboardMetric]
    schedule_items: list[DashboardItemSummary]
    document_items: list[DashboardItemSummary]
```

- [ ] **Step 3: Implement identity and permission-derived metrics**

Before bootstrap, identity returns null school fields. Dashboard includes only metrics allowed by these permissions:

```python
metric_permissions = {
    "schedule.today": "calendar.read",
    "documents.new": "documents.read",
    "submissions.pending": "submissions.read",
}
```

Counts and lists begin empty because the business tables are outside this sub-project.

- [ ] **Step 4: Register routers, verify, and commit**

```bash
ruff check .
mypy
pytest tests/test_dashboard.py tests/test_auth.py -v

git add services/api-server
git commit -m "feat: add client bootstrap APIs"
```

### Task 5: Define Shared Contracts and a Hardened Electron Shell

**Files:**
- Create: `apps/teacher-client/src/shared/contracts.ts`
- Create: `apps/teacher-client/src/shared/errors.ts`
- Create: `apps/teacher-client/src/main/ipc/channels.ts`
- Create: `apps/teacher-client/src/main/index.ts`
- Create: `apps/teacher-client/src/main/index.test.ts`

**Interfaces:**
- Produces: `SessionView`, `ConnectionState`, `DashboardSnapshot`, fixed IPC channel constants, secure BrowserWindow options.

- [ ] **Step 1: Write failing BrowserWindow option tests**

```ts
expect(createWindowOptions('C:\\app\\preload.js').webPreferences).toMatchObject({
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  preload: 'C:\\app\\preload.js',
});
```

Assert `webSecurity` is not disabled.

- [ ] **Step 2: Define exact shared types**

```ts
export type SessionView = {
  userId: string;
  displayName: string;
  schoolName: string;
  departmentNames: string[];
  roles: string[];
  permissions: string[];
};

export type ConnectionState =
  | { kind: 'online'; lastSyncAt: string }
  | { kind: 'offline-readonly'; lastSyncAt: string | null }
  | { kind: 'reconnecting'; lastSyncAt: string | null }
  | { kind: 'security-blocked'; code: 'CERTIFICATE_MISMATCH' | 'SERVER_IDENTITY_INVALID' };

export type DashboardSnapshot = {
  generatedAt: string;
  metrics: Array<{ key: string; count: number }>;
  scheduleItems: Array<{ id: string; title: string; status: string; updatedAt: string }>;
  documentItems: Array<{ id: string; title: string; status: string; updatedAt: string }>;
};
```

Add Zod schemas for all IPC inputs and API responses.

- [ ] **Step 3: Define fixed channels**

```ts
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
```

- [ ] **Step 4: Implement the hardened main entry**

Call `app.enableSandbox()` before readiness, deny new windows, reject navigation away from the packaged renderer, and allow a development URL only when it exactly matches `http://127.0.0.1:<port>`.

- [ ] **Step 5: Verify and commit**

```bash
cd apps/teacher-client
npm test -- src/main/index.test.ts
npm run typecheck
npm run build:electron

git add apps/teacher-client
git commit -m "feat: add secure electron shell"
```

### Task 6: Store Refresh Tokens in Windows Credential Manager

**Files:**
- Create: `apps/teacher-client/src/main/security/credentialStore.ts`
- Create: `apps/teacher-client/src/main/security/credentialStore.test.ts`

**Interfaces:**
- Produces: `readActive()`, `writeActive(session)`, `deleteActive()`.

- [ ] **Step 1: Write failing keytar adapter tests**

```ts
const payload = {
  schoolCode: 'sample-school',
  userId: '3d594650-3436-4bc4-a593-8d9eea56f26d',
  refreshToken: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG',
};
await store.writeActive(payload);
expect(keytar.setPassword).toHaveBeenCalledWith(
  'SchoolWorkHub.TeacherClient',
  'active-session',
  JSON.stringify(payload),
);
```

Also test missing, malformed, and deleted credentials.

- [ ] **Step 2: Implement validated storage**

```ts
const storedSessionSchema = z.object({
  schoolCode: z.string().min(2).max(30),
  userId: z.string().uuid(),
  refreshToken: z.string().min(32).max(512),
});
```

Use fixed service `SchoolWorkHub.TeacherClient` and account `active-session`. Delete malformed stored values and never log their contents.

- [ ] **Step 3: Verify and commit**

```bash
npm test -- src/main/security/credentialStore.test.ts
npm run typecheck

git add apps/teacher-client
git commit -m "feat: add windows credential storage"
```

### Task 7: Add Server Policy and TLS Certificate Pinning

**Files:**
- Create: `apps/teacher-client/src/main/config/serverPolicy.ts`
- Create: `apps/teacher-client/src/main/config/serverPolicy.test.ts`
- Create: `apps/teacher-client/src/main/network/certificatePinning.ts`
- Create: `apps/teacher-client/src/main/network/certificatePinning.test.ts`

**Interfaces:**
- Produces: `ServerPolicyStore.load()`, `replaceAtomically(candidate)`, `installCertificatePinning(session, policy)`.

- [ ] **Step 1: Write policy validation tests**

```ts
const serverPolicySchema = z.object({
  baseUrl: z.string().url().refine((value) => new URL(value).protocol === 'https:'),
  schoolCode: z.string().min(2).max(30),
  currentFingerprint: z.string().regex(/^[A-F0-9]{64}$/),
  nextFingerprint: z.string().regex(/^[A-F0-9]{64}$/).nullable(),
});
```

Assert HTTP URLs and malformed hashes are rejected.

- [ ] **Step 2: Implement canonical normalization and a pure decision function**

```ts
export function normalizeFingerprint(value: string): string {
  return value.replaceAll(':', '').trim().toUpperCase();
}
```

```ts
export function decideCertificate(request: CertificateDecisionInput, policy: ServerPolicy): 0 | -2 | -3
```

Expected decisions: unrelated host `-3`; configured host with non-OK Chromium result `-2`; current pin `0`; next pin `0`; other pin `-2`.

- [ ] **Step 3: Install pinning and atomic policy replacement**

```ts
session.setCertificateVerifyProc((request, callback) => {
  callback(decideCertificate(request, policy));
});
```

Write policy JSON to a mode-`0o600` temporary file, flush it, rename it over the final file, and keep the previous file if validation or writing fails.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- src/main/config/serverPolicy.test.ts src/main/network/certificatePinning.test.ts
npm run typecheck

git add apps/teacher-client
git commit -m "feat: pin school server certificates"
```

### Task 8: Implement the Main-Process API Client and Single-Flight Auth Service

**Files:**
- Create: `apps/teacher-client/src/main/network/apiClient.ts`
- Create: `apps/teacher-client/src/main/network/apiClient.test.ts`
- Create: `apps/teacher-client/src/main/auth/authService.ts`
- Create: `apps/teacher-client/src/main/auth/authService.test.ts`

**Interfaces:**
- Produces: `ApiClient.request<T>()`, `AuthService.login()`, `restoreSession()`, `authenticatedRequest()`, `logout()`.

- [ ] **Step 1: Write failing response-validation tests**

```ts
export type Transport = (
  url: string,
  init: RequestInit,
) => Promise<{ status: number; json(): Promise<unknown> }>;
```

Malformed token, identity, user, and dashboard payloads must throw `SERVER_RESPONSE_INVALID` without exposing response content.

- [ ] **Step 2: Implement the API client**

Use `new URL(path, policy.baseUrl)`, `Accept: application/json`, JSON request bodies, Electron `net.fetch`, and Zod response parsing. Add authorization only inside the main process.

```ts
export type ClientErrorCode =
  | 'NETWORK_UNAVAILABLE'
  | 'AUTHENTICATION_REQUIRED'
  | 'ACCOUNT_LOCKED'
  | 'SERVER_RESPONSE_INVALID'
  | 'API_VERSION_UNSUPPORTED'
  | 'SECURITY_BLOCKED';
```

- [ ] **Step 3: Write login, restore, and concurrent-401 tests**

Assert login stores only the refresh token in Credential Manager, access token remains an in-memory private field, returned `SessionView` has no token fields, and restore rotates and overwrites the credential.

Start three requests that initially return 401:

```ts
expect(refreshCalls).toBe(1);
expect(successfulRetries).toBe(3);
```

- [ ] **Step 4: Implement `AuthService`**

```ts
private accessToken: string | null = null;
private refreshInFlight: Promise<void> | null = null;
private currentSession: SessionView | null = null;
```

Retry each request at most once. Network failure during restore preserves the credential for offline use. Refresh rejection invokes an injected credential-and-cache cleanup. Logout attempts server revocation, then always clears memory, credential, and cache locally.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- src/main/network/apiClient.test.ts src/main/auth/authService.test.ts
npm run typecheck

git add apps/teacher-client
git commit -m "feat: add secure teacher authentication"
```

### Task 9: Add DPAPI-Protected SQLite Offline Cache

**Files:**
- Create: `apps/teacher-client/src/main/security/cacheCrypto.ts`
- Create: `apps/teacher-client/src/main/security/cacheCrypto.test.ts`
- Create: `apps/teacher-client/src/main/security/windowsIdentity.ts`
- Create: `apps/teacher-client/src/main/security/windowsIdentity.test.ts`
- Create: `apps/teacher-client/src/main/storage/cacheRepository.ts`
- Create: `apps/teacher-client/src/main/storage/cacheRepository.test.ts`

**Interfaces:**
- Produces: encrypted `put`, `get`, `pruneExpired`, `deleteUser` operations.

- [ ] **Step 1: Write AES-GCM round-trip and tamper tests**

```ts
const encrypted = crypto.encrypt(Buffer.from('{"count":3}', 'utf8'));
expect(crypto.decrypt(encrypted).toString('utf8')).toBe('{"count":3}');
encrypted.ciphertext[0] ^= 1;
expect(() => crypto.decrypt(encrypted)).toThrow('CACHE_DECRYPT_FAILED');
```

- [ ] **Step 2: Implement the DPAPI-protected data key**

Generate one random 32-byte AES key. Store only `safeStorage.encryptString(key.toString('base64'))` in `cache.key`. Reject Windows startup when `safeStorage.isEncryptionAvailable()` is false. Encrypt payloads with AES-256-GCM, a random 12-byte nonce, and a 16-byte authentication tag.

- [ ] **Step 3: Retrieve the Windows SID**

```ts
execFile('whoami.exe', ['/user', '/fo', 'csv', '/nh'], { windowsHide: true }, callback);
```

Parse the second CSV field and require `/^S-1-/`. Inject the command runner in tests and do not fall back to username.

- [ ] **Step 4: Define and test the SQLite schema**

```sql
CREATE TABLE IF NOT EXISTS cache_entries (
  identity_key TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  nonce BLOB NOT NULL,
  auth_tag BLOB NOT NULL,
  ciphertext BLOB NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_cache_entries_expiry ON cache_entries(expires_at);
CREATE INDEX IF NOT EXISTS ix_cache_entries_user ON cache_entries(school_id, user_id);
```

`identity_key` is SHA-256 of `windowsSid + ':' + schoolId + ':' + userId`.

- [ ] **Step 5: Implement repository semantics**

Store one encrypted envelope with dashboard, schedule list, document list, submission summary, role/permission snapshot, and `lastSyncAt`. Set expiry to capture time plus 30 days. Different SID/user, expired data, corrupt ciphertext, or decryption failure deletes the row and returns `null`.

- [ ] **Step 6: Verify and commit**

```bash
npm run rebuild:native
npm test -- src/main/security/cacheCrypto.test.ts src/main/security/windowsIdentity.test.ts src/main/storage/cacheRepository.test.ts
npm run typecheck

git add apps/teacher-client
git commit -m "feat: add encrypted offline cache"
```

### Task 10: Implement Connection State and Background Resynchronization

**Files:**
- Create: `apps/teacher-client/src/main/sync/syncService.ts`
- Create: `apps/teacher-client/src/main/sync/syncService.test.ts`

**Interfaces:**
- Produces: connection events, cached fallback, `SyncSummary`.

- [ ] **Step 1: Write exact transition tests**

Cover:

```text
startup + live session -> online
startup + network failure + cache -> offline-readonly
startup + network failure + no cache -> offline-readonly with null snapshot
online + network failure -> offline-readonly
offline-readonly + restored reachability -> reconnecting -> online
any state + certificate mismatch -> security-blocked
refresh rejection -> signed-out cleanup event
```

- [ ] **Step 2: Implement a pure reducer**

```ts
export function reduceConnection(
  current: ConnectionState,
  event: ConnectionEvent,
): ConnectionState
```

A timer event cannot move `security-blocked` back online; only a newly validated policy can clear it.

- [ ] **Step 3: Implement startup, reconnect, and cache updates**

Attempt live restore and dashboard load. On network failure, load identity-matched cache. On success, write cache before emitting online. Use reconnect delays 5, 15, 30, and 60 seconds, then remain at 60 seconds. Cancel timers on logout and shutdown.

- [ ] **Step 4: Implement sync summaries**

```ts
export type SyncSummary = {
  newScheduleCount: number;
  changedScheduleCount: number;
  newDocumentCount: number;
  changedSubmissionCount: number;
};
```

Compare stable IDs and status fields, emit updated data without reloading the renderer, and preserve route and scroll state.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- src/main/sync/syncService.test.ts
npm run typecheck

git add apps/teacher-client
git commit -m "feat: add offline sync state machine"
```

### Task 11: Expose Validated IPC and Build the Login/Dashboard Renderer

**Files:**
- Create: `apps/teacher-client/src/main/ipc/registerIpc.ts`
- Create: `apps/teacher-client/src/main/ipc/registerIpc.test.ts`
- Create: `apps/teacher-client/src/preload/index.ts`
- Create: `apps/teacher-client/index.html`
- Create: `apps/teacher-client/src/renderer/main.tsx`
- Create: `apps/teacher-client/src/renderer/App.tsx`
- Create: `apps/teacher-client/src/renderer/state/useAppController.ts`
- Create: `apps/teacher-client/src/renderer/components/LoginScreen.tsx`
- Create: `apps/teacher-client/src/renderer/components/DashboardScreen.tsx`
- Create: `apps/teacher-client/src/renderer/components/ConnectionBanner.tsx`
- Create: `apps/teacher-client/src/renderer/components/SecurityBlockedScreen.tsx`
- Create: `apps/teacher-client/src/renderer/types/global.d.ts`
- Create: `apps/teacher-client/src/renderer/styles.css`
- Create: `apps/teacher-client/src/renderer/App.test.tsx`

**Interfaces:**
- Produces: renderer-safe `window.schoolWorkHub` bridge and approved UI.

- [ ] **Step 1: Write IPC boundary tests**

Assert only fixed channels are registered, malformed payloads are rejected by Zod, and handler results contain no keys named `accessToken`, `refreshToken`, `token`, `certificate`, or `policyPath`.

- [ ] **Step 2: Register handlers and expose the preload bridge**

Each handler parses input, checks the exact packaged renderer URL or allowed development origin, calls one service method, and maps internal errors to public codes.

```ts
contextBridge.exposeInMainWorld('schoolWorkHub', {
  auth: {
    login: (input: LoginInput) => ipcRenderer.invoke(IPC_CHANNELS.authLogin, input),
    restoreSession: () => ipcRenderer.invoke(IPC_CHANNELS.authRestore),
    logout: () => ipcRenderer.invoke(IPC_CHANNELS.authLogout),
  },
  dashboard: {
    load: () => ipcRenderer.invoke(IPC_CHANNELS.dashboardLoad),
  },
  connection: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.connectionStatus),
  },
});
```

Event subscription functions return cleanup functions that remove only their own listener.

- [ ] **Step 3: Write renderer tests**

Start `App.test.tsx` with:

```ts
// @vitest-environment jsdom
```

Cover restoring to login, login to dashboard, all role badges, permission-driven menu hiding, offline fixed banner, disabled write actions, reconnect summary, security-blocked cache hiding, and logout.

- [ ] **Step 4: Implement the state controller**

```ts
type AppState =
  | { kind: 'restoring' }
  | { kind: 'signed-out'; message: string | null }
  | { kind: 'ready'; session: SessionView; dashboard: DashboardSnapshot; connection: ConnectionState }
  | { kind: 'security-blocked'; code: string };
```

Subscribe on mount, unsubscribe on unmount, and never store token-like data.

- [ ] **Step 5: Implement permission-driven navigation and approved layout**

```ts
const navigation = [
  { id: 'dashboard', label: '대시보드', permission: null },
  { id: 'documents', label: '문서·지식', permission: 'documents.read' },
  { id: 'submissions', label: '자료 제출', permission: 'submissions.read' },
  { id: 'calendar', label: '일정·회의', permission: 'calendar.read' },
  { id: 'users', label: '구성원', permission: 'users.manage' },
];
```

Hide unauthorized entries. Build the approved two-column login, responsive dashboard, role badges, top search, metric cards, workflow list, fixed offline banner, and data-free security block screen.

- [ ] **Step 6: Verify and commit**

```bash
npm test -- src/main/ipc/registerIpc.test.ts src/renderer/App.test.tsx
npm run lint
npm run typecheck
npm run build

git add apps/teacher-client
git commit -m "feat: add teacher login and dashboard"
```

### Task 12: Add the Administrator-Protected Server Change Flow

**Files:**
- Create: `apps/teacher-client/src/main/settings/serverChangeService.ts`
- Create: `apps/teacher-client/src/main/settings/serverChangeService.test.ts`
- Create: `apps/teacher-client/src/renderer/components/ServerChangeDialog.tsx`
- Modify: `apps/teacher-client/src/renderer/App.tsx`
- Modify: `apps/teacher-client/src/main/ipc/registerIpc.ts`

**Interfaces:**
- Produces: validated atomic server policy replacement.

- [ ] **Step 1: Write protected-change tests**

The old policy must remain unchanged when HTTPS, Chromium verification, pin match, service identity, API version, school code, administrator login, `system.admin`, or atomic write validation fails. A completely valid candidate replaces the policy once.

- [ ] **Step 2: Implement the candidate probe**

Use a temporary in-memory Electron session. Install candidate pinning, request identity, login with administrator credentials, request `/auth/me`, require `system.admin`, revoke the temporary refresh session, and only then replace the policy.

- [ ] **Step 3: Expose the protected input**

```ts
export type ServerChangeInput = {
  baseUrl: string;
  schoolCode: string;
  currentFingerprint: string;
  nextFingerprint: string | null;
  adminUsername: string;
  adminPassword: string;
};
```

Return no password, token, certificate, or raw internal error. Clear the renderer password field after every attempt.

- [ ] **Step 4: Limit dialog visibility**

Show the entry only for administrator-action-required connection failures or the security-block recovery action, not as an ordinary teacher preference.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- src/main/settings/serverChangeService.test.ts src/renderer/App.test.tsx
npm run verify

git add apps/teacher-client
git commit -m "feat: protect school server changes"
```

### Task 13: Add Windows CI, Native Security Smoke Tests, and Foundation Verification

**Files:**
- Create: `.github/workflows/teacher-client-ci.yml`
- Create: `apps/teacher-client/src/main/scripts/windowsSecuritySmoke.ts`
- Create: `apps/teacher-client/src/main/integration/foundationHarness.test.ts`
- Create: `apps/teacher-client/scripts/verify-foundation.ps1`
- Create: `apps/teacher-client/README.md`
- Modify: `README.md`

**Interfaces:**
- Produces: cross-platform static checks, Windows native checks, and a machine-readable eight-scenario verification result.

- [ ] **Step 1: Add CI jobs using Node.js 24**

Ubuntu steps:

```yaml
- run: npm ci
- run: npm run lint
- run: npm run typecheck
- run: npm test -- --coverage
- run: npm run build
```

Windows steps:

```yaml
- run: npm ci
- run: npm run rebuild:native
- run: npm test
- run: npm run build
- run: npx electron dist/electron/main/scripts/windowsSecuritySmoke.js
```

Use `working-directory: apps/teacher-client` and trigger on teacher-client paths and the workflow file.

- [ ] **Step 2: Add a real Windows security smoke program**

The Electron main script writes, reads, and deletes a random test value with `@github/keytar`; asserts `safeStorage.isEncryptionAvailable()`; encrypts and decrypts a string; deletes the credential in `finally`; never prints the secret; and exits nonzero on failure.

- [ ] **Step 3: Add the eight-scenario integration harness**

`foundationHarness.test.ts` uses the real FastAPI test server plus injected transport fault controls to verify:

1. first login;
2. restart and automatic login;
3. access-token expiry and one refresh for concurrent requests;
4. multiple-role permission union;
5. network loss and encrypted read-only cache;
6. reconnection and sync summary;
7. certificate mismatch and security block;
8. logout and credential/cache deletion.

The Windows-only credential and DPAPI paths use the real adapters; network failures and certificate decisions use deterministic fault controls around the real service layer.

- [ ] **Step 4: Add `verify-foundation.ps1`**

```powershell
npm ci
npm run rebuild:native
npm run verify
npm test -- src/main/integration/foundationHarness.test.ts --reporter=json --outputFile=artifacts/foundation-vitest.json
```

Parse the Vitest JSON into `artifacts/teacher-client-foundation-verification.json` with one boolean and one diagnostic code for each of the eight named scenarios. Reject output containing fields named `password`, `access_token`, or `refresh_token`.

- [ ] **Step 5: Document setup and operations**

Document Node 24, supported Windows versions, native rebuild, server-policy deployment, current/next pin rotation, cache location, credential service name, quality commands, and the verifier command.

- [ ] **Step 6: Run all repository gates**

```bash
cd services/api-server
alembic upgrade head
ruff check .
mypy
pytest --cov=schoolworkhub --cov-report=term-missing

cd ../../apps/teacher-client
npm ci
npm run rebuild:native
npm run verify
```

On Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/verify-foundation.ps1
```

Expected: all commands exit 0 and all eight scenario booleans are true.

- [ ] **Step 7: Verify GitHub Actions and commit**

Push the branch and require API CI, Server Manager CI, and Teacher Client CI to report `success` for the same head commit before updating the PR verification text.

```bash
git add .github apps/teacher-client README.md
git commit -m "ci: verify teacher client foundation"
```

## Plan Self-Review

- Spec coverage: authentication, automatic restoration, exact token lifetimes, refresh rotation, role union, permission-driven UI, recent-30-day encrypted cache, offline read-only behavior, reconnection summary, dual certificate pins, protected server change, logout cleanup, API tests, renderer tests, Windows native smoke, and CI each map to a task.
- Completion scan: every task names concrete files, commands, expected outcomes, interfaces, tests, and a commit boundary.
- Type consistency: `SessionView`, `ConnectionState`, `DashboardSnapshot`, `ServerPolicy`, `SyncSummary`, `CredentialStore`, `ApiClient`, and `AuthService` keep the same names across producer and consumer tasks.
- Scope check: document and calendar editing, offline writes, installers, release signing, and updater work remain outside this sub-project as required by the approved design.
