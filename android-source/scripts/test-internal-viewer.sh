#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VIEWER="$ROOT/app/src/main/java/kr/co/alldocuments/ui/DocumentViewer.kt"
STRATEGY="$ROOT/app/src/main/java/kr/co/alldocuments/domain/DocumentViewerStrategy.kt"
OFFICE="$ROOT/app/src/main/java/kr/co/alldocuments/ui/InternalOfficePreview.kt"

! grep -q 'ACTION_VIEW' "$VIEWER"
! grep -q '외부 앱으로 열기' "$VIEWER"
grep -q 'maxLines = 1' "$VIEWER"
grep -q 'TextOverflow.Ellipsis' "$VIEWER"
grep -q 'ViewerKind.OFFICE' "$STRATEGY"
grep -q 'docx' "$STRATEGY"
grep -q 'xlsx' "$STRATEGY"
grep -q 'pptx' "$STRATEGY"
test -f "$OFFICE"
grep -q 'ZipInputStream' "$OFFICE"
grep -q 'word/document.xml' "$OFFICE"
grep -q 'xl/sharedStrings.xml' "$OFFICE"
grep -q 'ppt/slides/slide' "$OFFICE"

echo "Internal-only viewer integration test passed"
