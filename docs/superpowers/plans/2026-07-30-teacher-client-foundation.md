# SchoolWorkHub 교사용 클라이언트 기반 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인, 자동 세션 복구, 복수 역할 권한 통합 대시보드, DPAPI 보호 오프라인 읽기 전용 캐시, TLS 인증서 지문 고정과 보호된 서버 변경이 실제 API와 연동되는 Windows Electron 교사용 클라이언트를 만든다.

**Architecture:** FastAPI 서버는 짧은 수명의 액세스 토큰과 회전형 갱신 토큰, 서버 식별 응답, 대시보드 스냅샷을 제공한다. Electron 메인 프로세스가 네트워크, 토큰, Windows 자격 증명 관리자, DPAPI, SQLite, 인증서 검증을 독점하고, 프리로드는 고정된 타입의 IPC만 React 렌더러에 노출한다.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2, PostgreSQL 16, Alembic, Electron 43.2.0, Node.js 24, React 19, TypeScript 5.7, Vite 6, Zod 4.4.3, `@github/keytar` 7.10.6, `better-sqlite3` 13.0.1, Vitest 4.1.10, Windows Credential Manager, Electron `safeStorage`/Windows DPAPI.

## Global Constraints

- 액세스 토큰 수명은 정확히 15분이며 Electron 메인 프로세스 메모리에만 존재한다.
- 갱신 토큰 수명은 정확히 30일이며 Windows 자격 증명 관리자에만 저장한다.
- 로그인과 갱신은 갱신 토큰을 회전하며 서버에는 토큰 원문이 아니라 SHA-256 해시만 저장한다.
- 렌더러에는 토큰, 서버 설정 파일 경로, 인증서 원문, 원시 IPC 객체를 전달하지 않는다.
- `BrowserWindow`는 `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`를 사용한다.
- 오프라인 캐시는 최근 30일의 대시보드·일정·문서 목록·제출 요약·권한 스냅샷만 저장한다.
- 문서 본문, 첨부파일, 비밀번호, 액세스 토큰, 갱신 토큰은 캐시에 저장하지 않는다.
- 오프라인 상태에서는 모든 생성·수정·제출 동작을 차단하고 조회만 허용한다.
- TLS 연결은 Chromium 기본 체인·호스트 검증이 `OK`인 경우에만 현재 또는 다음 SHA-256 지문을 추가 검증한다.
- 인증서 지문 불일치 시 오프라인 캐시를 포함한 업무 화면 전체를 차단한다.
- 서버 주소 변경은 관리자 인증, 서버 식별, API 버전, 인증서 지문 시험 연결이 모두 성공한 후 원자적으로 저장한다.
- 로그아웃, 갱신 토큰 거부, 계정 비활성화 시 갱신 토큰과 해당 사용자 캐시를 즉시 삭제한다.
- API 코드는 Ruff와 strict mypy를 통과해야 한다.
- 클라이언트 코드는 TypeScript strict, ESLint, Vitest, Windows CI를 통과해야 한다.

## File Structure Map

### API server

- `services/api-server/src/schoolworkhub/models.py`: 갱신 세션 영속 모델.
- `services/api-server/src/schoolworkhub/security.py`: 액세스 토큰과 불투명 갱신 토큰 생성·해시.
- `services/api-server/src/schoolworkhub/refresh_sessions.py`: 갱신 세션 발급, 회전, 폐기.
- `services/api-server/src/schoolworkhub/schemas.py`: 인증, 서버 식별, 대시보드 응답 계약.
- `services/api-server/src/schoolworkhub/routers/auth.py`: 로그인, 갱신, 로그아웃, 현재 사용자.
- `services/api-server/src/schoolworkhub/routers/system.py`: 서버 신원과 API 호환성 응답.
- `services/api-server/src/schoolworkhub/routers/dashboard.py`: 권한 통합 대시보드 스냅샷.
- `services/api-server/alembic/versions/0002_refresh_sessions.py`: 갱신 세션 테이블.
- `services/api-server/tests/test_refresh_sessions.py`: 회전·폐기·만료 통합 테스트.
- `services/api-server/tests/test_dashboard.py`: 역할 합집합과 스냅샷 테스트.

### Electron main and preload

- `apps/teacher-client/src/shared/contracts.ts`: IPC와 API 공유 타입·Zod 스키마.
- `apps/teacher-client/src/shared/errors.ts`: 사용자 오류 분류.
- `apps/teacher-client/src/main/index.ts`: 앱 시작과 보안 BrowserWindow.
- `apps/teacher-client/src/main/ipc/registerIpc.ts`: 고정 IPC 핸들러.
- `apps/teacher-client/src/main/security/credentialStore.ts`: Windows Credential Manager 어댑터.
- `apps/teacher-client/src/main/security/cacheCrypto.ts`: AES-256-GCM 데이터 암호화와 DPAPI 키 보호.
- `apps/teacher-client/src/main/security/windowsIdentity.ts`: Windows SID 조회.
- `apps/teacher-client/src/main/config/serverPolicy.ts`: 서버 주소와 현재·다음 지문 정책.
- `apps/teacher-client/src/main/network/certificatePinning.ts`: TLS 체인·호스트·지문 검증.
- `apps/teacher-client/src/main/network/apiClient.ts`: 토큰 비노출 API 클라이언트.
- `apps/teacher-client/src/main/auth/authService.ts`: 로그인, 자동 복구, 단일 갱신 잠금, 로그아웃.
- `apps/teacher-client/src/main/storage/cacheRepository.ts`: 암호화 SQLite 스냅샷 저장소.
- `apps/teacher-client/src/main/sync/syncService.ts`: 온라인·오프라인·재연결 상태와 증분 동기화.
- `apps/teacher-client/src/main/settings/serverChangeService.ts`: 관리자 보호 서버 변경.
- `apps/teacher-client/src/preload/index.ts`: 제한된 `contextBridge` API.

### React renderer

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

### Task 1: Restore a Green Baseline and Upgrade the Electron Toolchain

**Files:**
- Modify: `services/api-server/src/schoolworkhub/routers/admin.py:1-32`
- Modify: `services/api-server/pyproject.toml:7-10`
- Modify: `apps/teacher-client/package.json`
- Modify: `apps/teacher-client/tsconfig.main.json`
- Modify: `apps/teacher-client/tsconfig.renderer.json`
- Create: `apps/teacher-client/eslint.config.js`
- Create: `apps/teacher-client/vitest.config.ts`
- Create: `apps/teacher-client/src/test/setup.ts`

**Interfaces:**
- Consumes: 현재 API와 Electron 설정.
- Produces: API CI가 통과하는 기준점과 `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` 명령.

- [ ] **Step 1: Reproduce the existing API lint failure**

Run:

```bash
cd services/api-server
ruff check src/schoolworkhub/routers/admin.py
```

Expected: import-order failure in `routers/admin.py`.

- [ ] **Step 2: Apply Ruff's deterministic import order**

Run:

```bash
cd services/api-server
ruff check src/schoolworkhub/routers/admin.py --fix
ruff check .
```

Expected: both commands exit with code 0.

- [ ] **Step 3: Align the API package version with the current application version**

Change:

```toml
[project]
name = "schoolworkhub-api"
version = "0.3.0"
```

Run:

```bash
cd services/api-server
mypy && pytest
```

Expected: strict type check and existing tests pass.

- [ ] **Step 4: Replace the teacher-client scripts and dependency set**

Use these package entries:

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

Preserve `name`, `version`, `private`, and `type` from the existing file.

- [ ] **Step 5: Expand the Electron TypeScript compilation roots**

Set `tsconfig.main.json` to compile main, preload, and shared code:

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

Add `src/shared` and `src/test` to `tsconfig.renderer.json`'s `include` array.

- [ ] **Step 6: Add ESLint and Vitest configuration**

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

Add `@eslint/js` version `9.39.2` to dev dependencies.

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

- [ ] **Step 7: Install and verify the empty toolchain**

Run:

```bash
cd apps/teacher-client
npm install
npm run lint
npm run typecheck
```

Expected: installation succeeds and the commands exit with code 0 before feature files are added.

- [ ] **Step 8: Commit**

```bash
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
- Consumes: `User`, `School`, `AsyncSession`, application secret settings.
- Produces: `issue_refresh_session(session, user) -> IssuedRefreshSession`, `rotate_refresh_session(session, raw_token) -> tuple[User, IssuedRefreshSession]`, `revoke_refresh_session(session, raw_token) -> bool`.

- [ ] **Step 1: Write failing token-helper tests**

Add:

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

Run:

```bash
cd services/api-server
pytest tests/test_refresh_sessions.py::test_refresh_token_is_random_and_hash_is_stable -v
```

Expected: FAIL because the functions do not exist.

- [ ] **Step 2: Add exact token settings and helpers**

Set:

```python
access_token_ttl_minutes: int = 15
refresh_token_ttl_days: int = 30
```

Add to `security.py`:

```python
import hashlib
import secrets


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
```

Run the single test again; expect PASS.

- [ ] **Step 3: Add the refresh-session SQLAlchemy model**

Add:

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

- [ ] **Step 4: Write migration `0002_refresh_sessions.py`**

Create the table with UUID primary key, `created_at`, `updated_at`, foreign keys with `CASCADE`, unique `token_hash`, and indexes for `user_id`, `school_id`, `token_hash`, and `expires_at`. Set `down_revision = "0001_identity_rbac"`. The downgrade drops indexes before dropping the table.

Run:

```bash
cd services/api-server
alembic upgrade head
alembic downgrade 0001_identity_rbac
alembic upgrade head
```

Expected: all three commands succeed.

- [ ] **Step 5: Write failing issue/rotate/revoke integration tests**

Use a real PostgreSQL test session and assert:

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

Run the test and expect import failures.

- [ ] **Step 6: Implement the refresh-session service**

Define:

```python
@dataclass(frozen=True)
class IssuedRefreshSession:
    raw_token: str
    expires_at: datetime


class RefreshSessionRejected(ValueError):
    pass
```

`issue_refresh_session` creates a random token, stores only its hash, and flushes. `rotate_refresh_session` selects the unrevoked hash with `with_for_update()`, rejects missing, expired, inactive-user, and school mismatch states, sets `revoked_at` and `last_used_at`, then issues a replacement. `revoke_refresh_session` returns `False` for missing or already revoked tokens.

- [ ] **Step 7: Run API quality gates**

```bash
cd services/api-server
ruff check .
mypy
pytest tests/test_refresh_sessions.py -v
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
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
- Consumes: Task 2 refresh-session service.
- Produces: `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`.

- [ ] **Step 1: Update failing API expectations**

Change login assertions to require:

```python
body = login_response.json()
assert body["token_type"] == "bearer"
assert body["expires_in_seconds"] == 900
assert body["refresh_expires_in_seconds"] == 2_592_000
assert body["access_token"]
assert body["refresh_token"]
```

Add a refresh request and assert token rotation:

```python
refresh_response = client.post(
    "/api/v1/auth/refresh",
    json={"refresh_token": body["refresh_token"]},
)
assert refresh_response.status_code == 200
refreshed = refresh_response.json()
assert refreshed["refresh_token"] != body["refresh_token"]
assert refreshed["access_token"] != body["access_token"]
```

Run the test and expect schema/route failures.

- [ ] **Step 2: Add exact Pydantic contracts**

Add:

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

Extend `CurrentUserResponse` with:

```python
school_name: str
department_names: list[str]
```

Remove the obsolete `TokenResponse` after all references are migrated.

- [ ] **Step 3: Change login to issue a token pair**

After successful password verification:

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

Ensure the audit log and refresh-session insert share the same transaction.

- [ ] **Step 4: Add refresh and logout routes**

Refresh:

```python
@router.post("/refresh", response_model=TokenPairResponse)
async def refresh(payload: RefreshRequest, session: SessionDep) -> TokenPairResponse:
    try:
        user, issued = await rotate_refresh_session(session, payload.refresh_token)
    except RefreshSessionRejected as exc:
        await session.rollback()
        raise authentication_error() from exc
    await session.commit()
    settings = get_settings()
    return TokenPairResponse(
        access_token=create_access_token(user.id, user.school_id),
        refresh_token=issued.raw_token,
        expires_in_seconds=settings.access_token_ttl_minutes * 60,
        refresh_expires_in_seconds=settings.refresh_token_ttl_days * 24 * 60 * 60,
    )
```

Logout returns HTTP 204 and commits revocation even when the token was already absent, preventing token-existence disclosure.

- [ ] **Step 5: Expand `/auth/me` queries**

Join `School` and optional `Department`, return one school name and zero-or-one department name while preserving deduplicated ordered roles and permissions.

- [ ] **Step 6: Test revoked, expired, inactive, and reused refresh tokens**

Assertions:

```python
assert client.post("/api/v1/auth/refresh", json={"refresh_token": old_token}).status_code == 401
assert client.post("/api/v1/auth/logout", json={"refresh_token": new_token}).status_code == 204
assert client.post("/api/v1/auth/refresh", json={"refresh_token": new_token}).status_code == 401
```

Create an expired database record directly and assert 401. Deactivate the user and assert 401 plus server-side session revocation.

- [ ] **Step 7: Run complete API checks**

```bash
cd services/api-server
ruff check .
mypy
pytest --cov=schoolworkhub --cov-report=term-missing
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
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
- Consumes: current-user dependency and RBAC queries.
- Produces: `GET /api/v1/system/identity`, `GET /api/v1/dashboard`.

- [ ] **Step 1: Write failing identity and dashboard tests**

Assert unauthenticated identity:

```python
response = client.get("/api/v1/system/identity")
assert response.status_code == 200
assert response.json() == {
    "service": "schoolworkhub",
    "api_version": "v1",
    "school_code": "sample-school",
    "school_name": "샘플학교",
}
```

Assert dashboard rejects anonymous requests and returns the authenticated user's role/permission union.

- [ ] **Step 2: Add response contracts**

```python
class ServerIdentityResponse(BaseModel):
    service: str = "schoolworkhub"
    api_version: str = "v1"
    school_code: str | None
    school_name: str | None


class DashboardMetric(BaseModel):
    key: str
    count: int


class DashboardSnapshotResponse(BaseModel):
    generated_at: datetime
    roles: list[str]
    permissions: list[str]
    metrics: list[DashboardMetric]
    schedule_items: list[dict[str, object]]
    document_items: list[dict[str, object]]
```

The first implementation returns zero counts and empty lists because schedule, document, and submission business tables are outside this sub-project. The response is still a real authenticated, cacheable API contract.

- [ ] **Step 3: Implement the identity route**

Query the single school row with deterministic ordering. Before bootstrap, return `school_code=None` and `school_name=None`; after bootstrap return the configured school.

- [ ] **Step 4: Implement permission-derived dashboard metrics**

Return only metrics whose read permission exists:

```python
metric_permissions = {
    "schedule.today": "calendar.read",
    "documents.new": "documents.read",
    "submissions.pending": "submissions.read",
}
```

Each included metric starts at count `0`. Do not expose a metric for a missing permission.

- [ ] **Step 5: Register both routers and run tests**

```bash
cd services/api-server
ruff check .
mypy
pytest tests/test_dashboard.py tests/test_auth.py -v
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add services/api-server
git commit -m "feat: add client bootstrap APIs"
```

### Task 5: Define Shared Contracts and the Secure Electron Shell

**Files:**
- Create: `apps/teacher-client/src/shared/contracts.ts`
- Create: `apps/teacher-client/src/shared/errors.ts`
- Create: `apps/teacher-client/src/main/index.ts`
- Create: `apps/teacher-client/src/main/ipc/channels.ts`
- Create: `apps/teacher-client/src/main/index.test.ts`

**Interfaces:**
- Consumes: Task 1 Electron toolchain.
- Produces: `SessionView`, `ConnectionState`, `DashboardSnapshot`, `SchoolWorkHubBridge`, and a hardened BrowserWindow.

- [ ] **Step 1: Write failing window-security tests**

Extract a pure function `createWindowOptions(preloadPath: string): BrowserWindowConstructorOptions` and assert:

```ts
expect(options.webPreferences).toMatchObject({
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  preload: 'C:\\app\\preload.js',
});
```

Also assert `webSecurity` is never disabled.

- [ ] **Step 2: Define exact state and IPC contracts**

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
  scheduleItems: Array<Record<string, unknown>>;
  documentItems: Array<Record<string, unknown>>;
};
```

Define Zod schemas for every input crossing IPC: login, logout, restore, dashboard load, and server-change request.

- [ ] **Step 3: Define fixed IPC channel constants**

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

No dynamic channel construction is allowed.

- [ ] **Step 4: Implement the hardened main entry point**

Call `app.enableSandbox()` before readiness. Create one window, deny new windows with `setWindowOpenHandler(() => ({ action: 'deny' }))`, and prevent navigation away from the packaged renderer URL. Load Vite dev URL only when `!app.isPackaged` and `SWH_TEACHER_DEV_URL` exactly matches `http://127.0.0.1:<port>`.

- [ ] **Step 5: Run tests and build**

```bash
cd apps/teacher-client
npm test -- src/main/index.test.ts
npm run typecheck
npm run build:electron
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/teacher-client
git commit -m "feat: add secure electron shell"
```

### Task 6: Store Refresh Tokens in Windows Credential Manager

**Files:**
- Create: `apps/teacher-client/src/main/security/credentialStore.ts`
- Create: `apps/teacher-client/src/main/security/credentialStore.test.ts`

**Interfaces:**
- Consumes: `@github/keytar`.
- Produces: `CredentialStore.readActive()`, `CredentialStore.writeActive(session)`, `CredentialStore.deleteActive()`.

- [ ] **Step 1: Write failing adapter tests with an injected keytar port**

```ts
const keytar = {
  getPassword: vi.fn(),
  setPassword: vi.fn(),
  deletePassword: vi.fn(),
};
const store = new CredentialStore(keytar);
await store.writeActive({ schoolCode: 'sample-school', userId: 'u-1', refreshToken: 'r-1' });
expect(keytar.setPassword).toHaveBeenCalledWith(
  'SchoolWorkHub.TeacherClient',
  'active-session',
  JSON.stringify({ schoolCode: 'sample-school', userId: 'u-1', refreshToken: 'r-1' }),
);
```

Add tests for missing credential, malformed JSON, and deletion.

- [ ] **Step 2: Implement the credential payload schema**

```ts
const storedSessionSchema = z.object({
  schoolCode: z.string().min(2).max(30),
  userId: z.string().uuid(),
  refreshToken: z.string().min(32).max(512),
});
```

Malformed values are deleted and treated as no session. Never log the returned password string or parse error input.

- [ ] **Step 3: Implement the adapter**

Use fixed service and account constants. `writeActive` replaces the active session atomically through `setPassword`; `deleteActive` ignores a missing entry but propagates OS access failures.

- [ ] **Step 4: Run tests**

```bash
cd apps/teacher-client
npm test -- src/main/security/credentialStore.test.ts
npm run typecheck
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
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
- Consumes: Electron `Session`, filesystem path under `app.getPath('userData')`.
- Produces: `ServerPolicyStore.load()`, `ServerPolicyStore.replaceAtomically(candidate)`, `installCertificatePinning(session, policy)`.

- [ ] **Step 1: Write failing policy-validation tests**

Required schema:

```ts
const serverPolicySchema = z.object({
  baseUrl: z.string().url().refine((value) => new URL(value).protocol === 'https:'),
  schoolCode: z.string().min(2).max(30),
  currentFingerprint: z.string().regex(/^[A-F0-9]{64}$/),
  nextFingerprint: z.string().regex(/^[A-F0-9]{64}$/).nullable(),
});
```

Assert HTTP URLs, malformed hashes, and unrelated fields are rejected.

- [ ] **Step 2: Implement canonical fingerprint normalization**

```ts
export function normalizeFingerprint(value: string): string {
  return value.replaceAll(':', '').trim().toUpperCase();
}
```

The normalized result must contain exactly 64 hexadecimal characters.

- [ ] **Step 3: Write failing certificate-decision tests**

Extract:

```ts
export function decideCertificate(
  request: Pick<CertificateVerifyProcRequest, 'hostname' | 'verificationResult' | 'certificate'>,
  policy: ServerPolicy,
): 0 | -2 | -3
```

Test these exact outcomes:

- unrelated hostname: `-3` to use Chromium's result;
- configured hostname with `verificationResult !== 'OK'`: `-2`;
- configured hostname with current fingerprint: `0`;
- configured hostname with next fingerprint: `0`;
- configured hostname with any other fingerprint: `-2`.

- [ ] **Step 4: Implement and install pinning**

```ts
session.setCertificateVerifyProc((request, callback) => {
  callback(decideCertificate(request, policy));
});
```

Do not accept a pinned certificate when Chromium reports an invalid chain or hostname.

- [ ] **Step 5: Implement atomic policy replacement**

Write JSON with mode `0o600` to `<policy>.tmp`, call `fsync`, rename over the final file, then remove a leftover temporary file on the next load. Keep the previous final file when validation or write fails.

- [ ] **Step 6: Run tests**

```bash
cd apps/teacher-client
npm test -- src/main/config src/main/network/certificatePinning.test.ts
npm run typecheck
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
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
- Consumes: server policy, credential store, Electron `net.fetch`, API contracts.
- Produces: `ApiClient.request<T>()`, `AuthService.login()`, `restoreSession()`, `authenticatedRequest()`, `logout()`.

- [ ] **Step 1: Write failing API response-validation tests**

Inject a `Transport` interface:

```ts
export type Transport = (
  url: string,
  init: RequestInit,
) => Promise<{ status: number; json(): Promise<unknown> }>;
```

Assert malformed token and current-user payloads throw `ClientError('SERVER_RESPONSE_INVALID')` without leaking response data.

- [ ] **Step 2: Implement API schemas and request behavior**

Use Zod for token pair, current user, server identity, and dashboard. Build URLs with `new URL(path, policy.baseUrl)`. Set `Accept: application/json` and `Content-Type: application/json`; add `Authorization` only inside the main process.

Classify failures as:

```ts
export type ClientErrorCode =
  | 'NETWORK_UNAVAILABLE'
  | 'AUTHENTICATION_REQUIRED'
  | 'ACCOUNT_LOCKED'
  | 'SERVER_RESPONSE_INVALID'
  | 'API_VERSION_UNSUPPORTED'
  | 'SECURITY_BLOCKED';
```

- [ ] **Step 3: Write failing login and restore tests**

Login test asserts the refresh token is written to Credential Manager, access token stays in an in-memory field, and returned `SessionView` contains no token fields. Restore test begins from `readActive`, rotates the token, overwrites the credential, and fetches `/auth/me`.

- [ ] **Step 4: Write the concurrent 401 test**

Start three authenticated requests whose first response is 401. Assert the refresh transport is called once and all three requests retry once with the new access token.

```ts
expect(refreshCalls).toBe(1);
expect(successfulRetries).toBe(3);
```

- [ ] **Step 5: Implement `AuthService`**

Maintain:

```ts
private accessToken: string | null = null;
private refreshInFlight: Promise<void> | null = null;
private currentSession: SessionView | null = null;
```

`authenticatedRequest` retries only once. `restoreSession` maps a network failure to an offline candidate rather than deleting credentials. A 401 from refresh deletes credentials and user cache through an injected cleanup callback. `logout` calls the server when reachable, then always clears memory, credential, and cache locally.

- [ ] **Step 6: Run tests**

```bash
cd apps/teacher-client
npm test -- src/main/network/apiClient.test.ts src/main/auth/authService.test.ts
npm run typecheck
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
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
- Consumes: Electron `safeStorage`, `better-sqlite3`, Windows `whoami.exe`.
- Produces: encrypted cache `put`, `get`, `pruneExpired`, `deleteUser`.

- [ ] **Step 1: Write failing AES-GCM tests**

Assert round-trip and tamper detection:

```ts
const encrypted = crypto.encrypt(Buffer.from('{"count":3}', 'utf8'));
expect(crypto.decrypt(encrypted).toString('utf8')).toBe('{"count":3}');
encrypted.ciphertext[0] ^= 1;
expect(() => crypto.decrypt(encrypted)).toThrow('CACHE_DECRYPT_FAILED');
```

- [ ] **Step 2: Implement the DPAPI-protected data key**

Generate a random 32-byte AES key once. Store only `safeStorage.encryptString(key.toString('base64'))` in `cache.key`. Reject startup if `safeStorage.isEncryptionAvailable()` is false on Windows. Encrypt payloads using AES-256-GCM with a random 12-byte nonce and a 16-byte authentication tag.

- [ ] **Step 3: Write and implement Windows SID retrieval**

Execute:

```ts
execFile('whoami.exe', ['/user', '/fo', 'csv', '/nh'], { windowsHide: true }, callback);
```

Parse the second CSV field as a SID matching `/^S-1-/`. Inject the command runner for tests. Do not fall back to username because the design requires a Windows SID boundary.

- [ ] **Step 4: Define the SQLite schema**

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

- [ ] **Step 5: Write failing repository tests**

Cover encrypted put/get, different SID rejection, different user rejection, 30-day cutoff, expired-row pruning, corrupted ciphertext deletion, and `deleteUser`.

- [ ] **Step 6: Implement cache repository semantics**

Serialize a single `CachedDashboardEnvelope` containing dashboard, schedule list, document list, submission summary, role/permission snapshot, and `lastSyncAt`. Set `expires_at` to `captured_at + 30 days`. On decryption or identity mismatch, delete the row and return `null`.

- [ ] **Step 7: Run tests and native rebuild**

```bash
cd apps/teacher-client
npm run rebuild:native
npm test -- src/main/security/cacheCrypto.test.ts src/main/security/windowsIdentity.test.ts src/main/storage/cacheRepository.test.ts
npm run typecheck
```

Expected: all pass on Windows; non-Windows unit tests use injected safe-storage and SID ports.

- [ ] **Step 8: Commit**

```bash
git add apps/teacher-client
git commit -m "feat: add encrypted offline cache"
```

### Task 10: Implement Connection State and Background Resynchronization

**Files:**
- Create: `apps/teacher-client/src/main/sync/syncService.ts`
- Create: `apps/teacher-client/src/main/sync/syncService.test.ts`

**Interfaces:**
- Consumes: AuthService, ApiClient, CacheRepository.
- Produces: connection events, cached fallback, sync summaries.

- [ ] **Step 1: Write state-transition tests**

Test exact transitions:

```text
startup + online session -> online
startup + network failure + cache -> offline-readonly
startup + network failure + no cache -> offline-readonly with null snapshot
online + network failure -> offline-readonly
offline-readonly + reachability restored -> reconnecting -> online
certificate mismatch from any state -> security-blocked
refresh rejection -> signed-out cleanup event
```

- [ ] **Step 2: Define a pure transition reducer**

```ts
export function reduceConnection(
  current: ConnectionState,
  event: ConnectionEvent,
): ConnectionState
```

The reducer must never transition from `security-blocked` back to online through a timer event; only a newly validated server policy can clear it.

- [ ] **Step 3: Implement startup load**

Attempt session restore and live dashboard load. On network failure, load the identity-matched cache. On successful live load, write a fresh encrypted cache before emitting `online`.

- [ ] **Step 4: Implement reconnect with bounded backoff**

Use delays of 5, 15, 30, and 60 seconds, then continue at 60 seconds while the app remains open. Cancel pending timers on logout and shutdown. Do not poll while online.

- [ ] **Step 5: Implement sync summary calculation**

Compare stable item IDs and status fields between cached and live snapshots. Emit:

```ts
export type SyncSummary = {
  newScheduleCount: number;
  changedScheduleCount: number;
  newDocumentCount: number;
  changedSubmissionCount: number;
};
```

Preserve renderer route and scroll position by emitting data rather than reloading the page.

- [ ] **Step 6: Run tests**

```bash
cd apps/teacher-client
npm test -- src/main/sync/syncService.test.ts
npm run typecheck
```

Expected: fake timers finish with no leaked timers and all transitions pass.

- [ ] **Step 7: Commit**

```bash
git add apps/teacher-client
git commit -m "feat: add offline sync state machine"
```

### Task 11: Expose Validated IPC and Build the Login/Dashboard Renderer

**Files:**
- Create: `apps/teacher-client/src/main/ipc/registerIpc.ts`
- Create: `apps/teacher-client/src/main/ipc/registerIpc.test.ts`
- Create: `apps/teacher-client/src/preload/index.ts`
- Create: `apps/teacher-client/src/renderer/index.html`
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
- Consumes: auth, sync, cache, and shared contracts.
- Produces: renderer-safe `window.schoolWorkHub` bridge and approved UI.

- [ ] **Step 1: Write failing IPC boundary tests**

Assert unknown channels are never registered, malformed login and server-change payloads are rejected by Zod, and handler results contain no keys named `accessToken`, `refreshToken`, `token`, `certificate`, or `policyPath`.

- [ ] **Step 2: Register fixed handlers**

Each `ipcMain.handle` parses input, calls one injected service method, and maps internal exceptions to a public error code. Verify `event.senderFrame.url` is the packaged renderer URL or the exact allowed development origin.

- [ ] **Step 3: Expose a narrow preload bridge**

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

Add event subscription methods that return cleanup functions and remove only their own listener.

- [ ] **Step 4: Write renderer behavior tests**

Use jsdom and Testing Library. Cover:

- restoring state then login state;
- successful login to dashboard;
- all role badges displayed;
- menu visibility by permission union;
- offline fixed banner and last sync time;
- write buttons disabled in offline mode;
- reconnect summary toast;
- security-blocked screen hides dashboard and cache;
- logout returns to login.

- [ ] **Step 5: Implement the app controller**

Use a discriminated union:

```ts
type AppState =
  | { kind: 'restoring' }
  | { kind: 'signed-out'; message: string | null }
  | { kind: 'ready'; session: SessionView; dashboard: DashboardSnapshot; connection: ConnectionState }
  | { kind: 'security-blocked'; code: string };
```

Subscribe on mount, unsubscribe on unmount, and never store token-like data.

- [ ] **Step 6: Implement permission-driven navigation**

Use a fixed mapping:

```ts
const navigation = [
  { id: 'dashboard', label: '대시보드', permission: null },
  { id: 'documents', label: '문서·지식', permission: 'documents.read' },
  { id: 'submissions', label: '자료 제출', permission: 'submissions.read' },
  { id: 'calendar', label: '일정·회의', permission: 'calendar.read' },
  { id: 'users', label: '구성원', permission: 'users.manage' },
];
```

Hide unauthorized entries instead of disabling them.

- [ ] **Step 7: Implement approved visual structure**

Build the two-column desktop login, responsive common dashboard, role badges, top search, metric cards, and workflow list. The offline banner is fixed below the application header and includes the last successful sync time. The security-blocked screen contains no cached values.

- [ ] **Step 8: Run renderer checks**

```bash
cd apps/teacher-client
npm test -- src/main/ipc/registerIpc.test.ts src/renderer/App.test.tsx
npm run lint
npm run typecheck
npm run build
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
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
- Consumes: candidate server policy, certificate verifier, API client factory.
- Produces: validated atomic server policy replacement.

- [ ] **Step 1: Write failing protected-change tests**

Assert the old policy remains unchanged when any of these fail:

- URL is not HTTPS;
- Chromium certificate verification is not `OK`;
- current or next fingerprint does not match;
- `/api/v1/system/identity` service is not `schoolworkhub`;
- API version is not `v1`;
- school code differs from the submitted school code;
- administrator login fails;
- `/auth/me` lacks `system.admin`;
- atomic write fails.

Assert a completely valid candidate replaces the policy once.

- [ ] **Step 2: Implement the candidate probe sequence**

Use a temporary in-memory Electron session. Install candidate pinning on that session, request identity, login with administrator credentials, request `/auth/me`, verify `system.admin`, logout the temporary refresh session, and only then call `replaceAtomically`.

- [ ] **Step 3: Expose the protected IPC command**

Input:

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

Do not return the password, token, certificate, or raw internal error. Clear the password field from renderer state after every attempt.

- [ ] **Step 4: Implement the dialog visibility rule**

Show the server-change entry only for `ADMIN_ACTION_REQUIRED` connection failures or from the security-blocked recovery action. Do not expose it as an ordinary teacher preference.

- [ ] **Step 5: Run tests**

```bash
cd apps/teacher-client
npm test -- src/main/settings/serverChangeService.test.ts src/renderer/App.test.tsx
npm run verify
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/teacher-client
git commit -m "feat: protect school server changes"
```

### Task 13: Add Windows CI, Security Smoke Tests, and End-to-End Verification

**Files:**
- Create: `.github/workflows/teacher-client-ci.yml`
- Create: `apps/teacher-client/scripts/windows-security-smoke.ts`
- Create: `apps/teacher-client/scripts/verify-foundation.ps1`
- Create: `apps/teacher-client/README.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: all previous tasks.
- Produces: repeatable Linux static checks, Windows native checks, and an operator verification command.

- [ ] **Step 1: Add cross-platform CI jobs**

Use Node.js 24 and `npm ci`.

Ubuntu job:

```yaml
- run: npm run lint
- run: npm run typecheck
- run: npm test -- --coverage
- run: npm run build
```

Windows job:

```yaml
- run: npm run rebuild:native
- run: npm test
- run: npm run build
- run: node dist/electron/scripts/windows-security-smoke.js
```

Set `working-directory: apps/teacher-client` and trigger on teacher-client paths plus the workflow file.

- [ ] **Step 2: Add a Windows security smoke program**

The program runs under Electron after build and performs these assertions with a random test account:

1. `@github/keytar` writes, reads, and deletes a value in Windows Credential Manager.
2. `safeStorage.isEncryptionAvailable()` returns true.
3. A string encrypted by `safeStorage.encryptString` decrypts correctly.
4. The temporary credential is deleted in a `finally` block.
5. The process exits nonzero on any failed assertion.

Do not print the test secret.

- [ ] **Step 3: Add `verify-foundation.ps1`**

The script executes:

```powershell
npm ci
npm run rebuild:native
npm run verify
```

Then it starts the configured SchoolWorkHub API and verifies these scenarios through the built Electron service layer test harness:

1. first login;
2. app restart and automatic login;
3. access-token expiry and single refresh;
4. multiple-role permission union;
5. network failure and encrypted read-only cache;
6. reconnection and sync summary;
7. certificate mismatch and security block;
8. logout and credential/cache deletion.

The script writes a timestamped JSON result under `artifacts/teacher-client-foundation-verification.json` with one boolean and one diagnostic code per scenario. It never writes passwords or tokens.

- [ ] **Step 4: Document setup and operational constraints**

Document Node 24, Windows 11/Windows Server support, native rebuild, server-policy JSON deployment, current/next fingerprint rotation, local cache location, credential service name, CI commands, and the exact verification script command.

- [ ] **Step 5: Run every repository quality gate**

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

Expected: every command exits with code 0.

- [ ] **Step 6: Run the Windows foundation verifier**

```powershell
cd apps/teacher-client
powershell -ExecutionPolicy Bypass -File scripts/verify-foundation.ps1
```

Expected: eight scenario results are `true`; no token or password appears in the artifact.

- [ ] **Step 7: Inspect GitHub Actions**

Push the branch and confirm API CI, Server Manager CI, and Teacher Client CI all complete successfully for the same head commit. Do not update the PR verification section until all three conclusions are `success`.

- [ ] **Step 8: Commit**

```bash
git add .github apps/teacher-client README.md
git commit -m "ci: verify teacher client foundation"
```

## Plan Self-Review

- Spec coverage: authentication, automatic restoration, 15-minute/30-day token policy, refresh rotation, role union, permission-driven UI, recent-30-day encrypted cache, offline read-only behavior, reconnection summary, current/next certificate pins, protected server change, logout cleanup, API tests, renderer tests, Windows security smoke, and CI each map to at least one task.
- Placeholder scan: the plan contains no `TBD`, `TODO`, incomplete implementation marker, or undefined neighboring interface.
- Type consistency: `SessionView`, `ConnectionState`, `DashboardSnapshot`, `ServerPolicy`, `SyncSummary`, `CredentialStore`, `ApiClient`, and `AuthService` names are stable across producing and consuming tasks.
- Scope check: document and calendar editing, offline writes, installers, release signing, and updater work remain outside this sub-project exactly as the approved design requires.
