# SchoolWorkHub Teacher Client

Windows 교직원용 Electron 클라이언트 기반입니다. Electron 메인 프로세스가 인증 토큰, 네트워크, 인증서 검증, Windows 자격 증명 관리자, DPAPI 보호 키와 암호화 캐시를 소유합니다. React 렌더러에는 검증된 고정 IPC 계약만 노출됩니다.

## 지원 기준

- Node.js 24
- npm 11
- Python 3.12: FastAPI 기반 통합 하네스 실행에 필요
- Windows 10/11 x64: 운영 대상
- GitHub Actions `windows-latest`: 네이티브 모듈, Windows Credential Manager와 DPAPI 스모크 검증

## 설치와 품질 명령

```powershell
cd apps/teacher-client
npm ci
npm run rebuild:native
npm run lint
npm run typecheck
npm test
npm run build
```

전체 정적·테스트·빌드 게이트는 다음 명령으로 실행합니다.

```powershell
npm run verify
```

`@github/keytar`와 `better-sqlite3`는 Electron ABI에 맞게 반드시 다시 빌드해야 합니다.

```powershell
npm run rebuild:native
```

## 서버 정책 배포

운영 배포 기준 정책 경로는 다음과 같습니다.

```text
%ProgramData%\SchoolWorkHub\TeacherClient\server-policy.json
```

예시:

```json
{
  "baseUrl": "https://school.example/",
  "schoolCode": "sample-school",
  "currentFingerprint": "64자리 SHA-256 인증서 지문",
  "nextFingerprint": null
}
```

정책 조건:

- `baseUrl`은 HTTPS만 허용합니다.
- 인증서 체인과 호스트 검증이 정상인 경우에만 현재 또는 다음 SHA-256 지문을 추가 확인합니다.
- 학교 코드, `schoolworkhub` 서비스 신원과 API `v1`이 모두 일치해야 합니다.
- 정책 파일은 설치 관리자 또는 학교 관리 도구가 배포하고, 일반 교직원 계정에는 쓰기 권한을 주지 않습니다.
- 연결 복구 화면의 정책 변경은 새 서버 시험 연결, 관리자 로그인, `system.admin` 권한과 임시 세션 폐기가 모두 성공한 후 원자적으로 저장합니다.

### 인증서 교체

1. 기존 인증서가 유효한 동안 새 인증서의 SHA-256 지문을 `nextFingerprint`로 함께 배포합니다.
2. 교직원 단말에 이중 핀 정책이 배포된 것을 확인합니다.
3. 서버 인증서를 새 인증서로 교체합니다.
4. 전환 완료 후 새 지문을 `currentFingerprint`로 옮기고 이전 지문을 제거합니다.

인증서 불일치 상태에서는 오프라인 캐시를 포함한 모든 업무 자료 표시를 차단합니다. 같은 신뢰되지 않은 연결에서 받은 값만으로 교체 핀을 신뢰해서는 안 됩니다.

## 로컬 보안 데이터

### Windows Credential Manager

- 서비스 이름: `SchoolWorkHub.TeacherClient`
- 계정 이름: `active-session`
- 저장 항목: 학교 코드, 사용자 ID, 30일 회전형 갱신 토큰
- 액세스 토큰은 15분 동안 Electron 메인 프로세스 메모리에만 유지합니다.

### 암호화 오프라인 캐시

운영 배포 기준 위치:

```text
%LOCALAPPDATA%\SchoolWorkHub\TeacherClient\cache\teacher-cache.db
%LOCALAPPDATA%\SchoolWorkHub\TeacherClient\cache\cache.key
```

- 최근 30일의 대시보드, 일정 목록, 문서 목록, 제출 요약과 역할·권한만 저장합니다.
- 문서 본문, 첨부파일, 비밀번호와 토큰은 저장하지 않습니다.
- 페이로드는 AES-256-GCM으로 암호화합니다.
- 무작위 데이터 키는 Windows 사용자별 DPAPI를 사용하는 Electron `safeStorage`로 보호합니다.
- 로그아웃, 갱신 토큰 거부 또는 계정 비활성화 시 활성 자격 증명과 해당 사용자 캐시를 삭제합니다.
- 오프라인 상태에서는 조회만 허용하고 모든 생성·수정·제출 동작을 차단합니다.

## Windows 네이티브 보안 스모크

빌드 후 다음 명령은 임의 값을 Windows Credential Manager에 쓰고 읽고 삭제하며, DPAPI 암호화·복호화를 실제로 확인합니다. 비밀값은 출력하지 않습니다.

```powershell
npx electron dist/electron/main/scripts/windowsSecuritySmoke.js
```

## 기반 검증기

```powershell
powershell -ExecutionPolicy Bypass -File scripts/verify-foundation.ps1
```

검증기는 설치, 네이티브 재빌드, 린트, 타입 검사, 전체 테스트와 빌드를 실행한 뒤 다음 파일을 생성합니다.

```text
artifacts/foundation-vitest.json
artifacts/teacher-client-foundation-verification.json
```

최종 JSON은 다음 여덟 시나리오마다 boolean 결과와 진단 코드 하나를 포함합니다.

1. 최초 로그인
2. 재시작 후 자동 로그인
3. 액세스 토큰 만료 시 동시 요청의 단일 갱신
4. 복수 역할 권한 합집합
5. 네트워크 손실과 암호화 읽기 전용 캐시
6. 재연결과 변경 요약
7. 인증서 불일치 보안 차단
8. 로그아웃 후 자격 증명·캐시 삭제

검증 결과에 `password`, `access_token` 또는 `refresh_token` 필드가 나타나면 검증기는 실패합니다.
