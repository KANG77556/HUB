# Internal-only Document Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 외부 앱 없이 앱 내부에서 주요 문서 형식을 읽는 모바일 중심 문서 뷰어를 구현한다.

**Architecture:** Compose 뷰어 셸을 최소 툴바 구조로 정리하고, 기존 PDF/이미지/TXT/RHWP 렌더러는 유지하면서 Office OOXML을 내부 구조화 미리보기로 확장한다. 파일은 로컬 ContentResolver에서만 읽으며 외부 Intent와 네트워크 전송은 제거한다.

**Tech Stack:** Kotlin, Jetpack Compose, Android WebView/WebKit, RHWP WASM/JS, java.util.zip, XML parser

**Spec:** `docs/superpowers/specs/2026-08-19-internal-document-viewer.md`

## Global Constraints
- 외부 앱 호출 금지
- 네트워크 업로드 금지
- 기존 RHWP 오프라인 자산 유지
- 문서 영역 우선 모바일 UI
- 모든 새 형식은 내부 화면에서 처리

---

### Task 1: Viewer shell redesign
**Files:**
- Modify: `android-source/app/src/main/java/kr/co/alldocuments/ui/DocumentViewer.kt`
- Test: `android-source/scripts/test-internal-viewer.sh`

- [ ] 외부 Intent/버튼이 없음을 검사하는 실패 테스트 작성
- [ ] 큰 파일명/양쪽 버튼 구조를 최소 툴바로 변경
- [ ] 테스트 통과 확인

### Task 2: Internal Office preview
**Files:**
- Create: `android-source/app/src/main/java/kr/co/alldocuments/ui/InternalOfficePreview.kt`
- Modify: domain viewer kind/resolver files
- Test: `android-source/scripts/test-internal-viewer.sh`

- [ ] DOCX/XLSX/PPTX 내부 분류 테스트 작성
- [ ] ZIP/XML 기반 로컬 텍스트·표·슬라이드 추출 구현
- [ ] Compose 내부 미리보기 구현
- [ ] 테스트 통과 확인

### Task 3: RHWP mobile viewer polish
**Files:**
- Modify: `android-source/app/src/main/assets/rhwp-viewer/index.html`
- Modify: `DocumentViewer.kt`
- Test: `android-source/scripts/test-rhwp-webview.sh`

- [ ] 페이지 비율/잘림/줌 회귀 테스트 유지
- [ ] 모바일 여백과 상태 표시 최소화
- [ ] 렌더링 완료 시 상태 영역 축소/숨김
- [ ] 테스트 통과 확인

### Task 4: Full verification and APK
**Files:**
- Modify: build verification workflow only if required

- [ ] 도메인 테스트 실행
- [ ] 내부 뷰어 테스트 실행
- [ ] RHWP 테스트 실행
- [ ] assembleDebug 실행
- [ ] APK ZIP 무결성 및 RHWP 자산 검사
- [ ] 검증 APK 게시
