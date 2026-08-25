# SchoolWorkHub

학교 업무·지식·시간표 공유 시스템입니다.

## 현재 상태

- FastAPI + PostgreSQL 기반 학교·사용자·역할·권한·감사 기반
- 회전형 갱신 세션과 권한 통합 대시보드 API
- Electron 교직원 클라이언트 로그인·자동 복구·오프라인 읽기 전용 기반
- TLS 인증서 고정과 관리자 보호 서버 변경
- WPF 서버 관리자 기반
- API, Server Manager, Teacher Client GitHub Actions 검증

## 구성

- `services/api-server`: Python 3.12 FastAPI 서버
- `apps/teacher-client`: Node.js 24 Electron/React 교직원 클라이언트
- `apps/server-manager`: Windows WPF 서버 관리자·복구 도구

교직원 클라이언트 설치, 정책 배포, 인증서 핀 교체와 기반 검증 방법은 [`apps/teacher-client/README.md`](apps/teacher-client/README.md)를 참고합니다.

## 주요 검증

API 서버:

```bash
cd services/api-server
alembic upgrade head
ruff check .
mypy
pytest --cov=schoolworkhub --cov-report=term-missing
```

교직원 클라이언트:

```powershell
cd apps/teacher-client
npm ci
npm run rebuild:native
npm run verify
powershell -ExecutionPolicy Bypass -File scripts/verify-foundation.ps1
```

## 후속 범위

- 문서·지식·일정·제출 업무 편집 모듈
- 설치·서명·자동 업데이트
- 백업·복구와 운영 관측
- 로컬 AI 검색·요약
