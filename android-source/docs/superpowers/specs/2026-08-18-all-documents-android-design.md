# 모든 문서 Android 앱 설계

## 목표
Android 기기에서 PDF, Word, Excel, PowerPoint, 텍스트 문서를 한 화면에서 선택·분류·검색하고 외부 호환 앱으로 열 수 있는 단순한 오프라인 문서 허브를 제공한다.

## 아키텍처
- Kotlin + Jetpack Compose 단일 Android 앱 모듈
- Android Storage Access Framework(OpenDocument)로 문서 선택
- URI 권한을 persistable permission으로 유지
- 순수 Kotlin 도메인 계층에서 문서 유형 분류와 검색 수행
- Compose UI는 홈/문서 목록/검색을 단일 화면 흐름으로 단순화

## 핵심 기능
1. 문서 추가: SAF 파일 선택기
2. 지원 유형: PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, TXT/CSV 및 기타
3. 통합 검색: 파일명 기준 대소문자 무시 검색
4. 문서 유형별 필터
5. 최근 추가 문서 표시
6. 즐겨찾기 토글
7. 문서 열기: ACTION_VIEW + 읽기 URI 권한

## 오류 처리
- 선택된 URI 메타데이터를 읽지 못하면 기본 파일명과 MIME으로 폴백
- 외부 뷰어가 없으면 사용자에게 스낵바로 안내
- URI 권한 유지 실패는 앱 사용을 중단시키지 않고 현재 세션에서만 사용

## 테스트
- 순수 Kotlin 도메인 로직: 유형 분류, 검색, 필터
- Android 빌드: assembleDebug
- 산출물: app-debug.apk
