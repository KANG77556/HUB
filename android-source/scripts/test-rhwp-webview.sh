#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VIEWER="$ROOT/app/src/main/java/kr/co/alldocuments/ui/DocumentViewer.kt"
GRADLE="$ROOT/app/build.gradle.kts"

grep -q 'WebViewAssetLoader' "$VIEWER"
grep -q 'https://appassets.androidplatform.net/assets/rhwp-viewer/index.html' "$VIEWER"
grep -q 'androidx.webkit:webkit' "$GRADLE"
grep -q 'setTimeout(send' "$VIEWER"

echo "RHWP WebView integration test passed"
