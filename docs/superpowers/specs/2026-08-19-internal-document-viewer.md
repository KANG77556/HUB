# Internal-only Document Viewer Design

## Goal
외부 앱 호출 없이 앱 내부에서 문서를 읽는 전용 뷰어로 전환한다. 모바일 화면에서 문서가 중심이 되도록 UI를 단순화하고, HWP/HWPX는 RHWP 렌더링 결과의 페이지 비율과 가독성을 최대한 보존한다.

## Scope
- 외부 앱으로 열기 기능 및 버튼 제거
- 상단 문서 뷰어 UI를 최소 툴바로 재설계
- PDF/이미지/TXT/HWP/HWPX는 기존 내부 렌더러 유지·개선
- DOC/DOCX/XLS/XLSX/PPT/PPTX는 외부 앱 호출 대신 앱 내부에서 로컬 구조화 미리보기 제공
- 모든 파일 처리에서 네트워크 업로드 금지
- HWP/HWPX는 RHWP 엔진 한계 밖의 기능까지 한컴과 100% 동일함을 보장하지 않음

## UX
- 상단: 뒤로가기, 한 줄 파일명, 확대 초기화 메뉴만 제공
- 문서 영역: 화면 대부분을 사용, 불필요한 큰 제목/버튼 제거
- 배경: 중성 회색, 페이지는 흰색 카드와 얕은 그림자
- 핀치 줌 및 WebView 확대 지원
- 파일명은 한 줄 말줄임 처리
- 지원하지 않는 세부 요소가 있어도 외부 앱 유도 대신 내부에서 가능한 범위의 내용을 표시

## Architecture
- `DocumentViewer.kt`: 뷰어 셸과 형식별 분기만 담당
- `InternalOfficePreview.kt`: OOXML/구형 Office 파일의 로컬 구조화 미리보기 담당
- `rhwp-viewer/index.html`: HWP/HWPX 페이지 렌더링, 비율 유지, 오류 표시 담당
- 도메인 분류기는 Office 형식을 내부 뷰어로 분기하도록 확장

## Fidelity policy
1. PDF/이미지: 원본 픽셀/페이지 기준 표시
2. HWP/HWPX: RHWP가 제공하는 SVG 페이지를 원본 비율로 표시
3. DOCX/XLSX/PPTX: 로컬 ZIP/XML 파싱 기반 구조화 미리보기. 편집용 원본 레이아웃 완전 복제는 목표가 아님
4. DOC/XLS/PPT 바이너리: 파일 정보와 내부 읽기 불가 안내를 앱 내부에서 표시하며 외부 앱 버튼은 제공하지 않음

## Acceptance criteria
- 뷰어 화면에 `외부 앱으로 열기` 문구/Intent 호출이 없음
- 파일명은 한 줄 툴바로 축소
- HWP/HWPX 페이지가 화면 폭을 넘지 않고 세로 비율을 유지
- 핀치 줌 가능
- DOCX/XLSX/PPTX는 앱 내부에서 최소 텍스트/표/슬라이드 내용을 확인 가능
- 빌드 및 도메인 테스트 통과
- APK에 RHWP 자산 포함 및 ZIP 무결성 검사 통과
