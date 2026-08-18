# 모든 문서 (Android)

PDF, Word, Excel, PowerPoint, 텍스트 등 로컬 문서를 한 화면에서 추가하고 검색·분류·즐겨찾기한 뒤 설치된 호환 앱으로 여는 Android 앱입니다.

## 주요 기능
- Android Storage Access Framework 기반 문서 선택
- PDF / Word / Excel / PowerPoint / 텍스트 / 기타 자동 분류
- 파일명 통합 검색과 유형 필터
- 최근 문서와 즐겨찾기
- URI 읽기 권한 유지 및 로컬 목록 저장
- 외부 문서 뷰어로 안전하게 열기

## 개발 환경
- JDK 17+
- Android SDK 35
- Gradle 8.9+
- Kotlin 2.0.21

## 테스트
```bash
./scripts/test-domain.sh
```

## APK 빌드
Android SDK와 Gradle Wrapper가 준비된 환경에서:
```bash
./gradlew assembleDebug
```
산출물: `app/build/outputs/apk/debug/app-debug.apk`
