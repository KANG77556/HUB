#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VIEWER="$ROOT/app/src/main/java/kr/co/alldocuments/ui/DocumentViewer.kt"
GRADLE="$ROOT/app/build.gradle.kts"
HTML="$ROOT/app/src/main/assets/rhwp-viewer/index.html"

grep -q 'WebViewAssetLoader' "$VIEWER"
grep -q 'https://appassets.androidplatform.net/assets/rhwp-viewer/index.html' "$VIEWER"
grep -q 'androidx.webkit:webkit' "$GRADLE"
grep -q 'onConsoleMessage' "$VIEWER"
grep -q 'onReceivedError' "$VIEWER"
grep -q 'RHWP 초기화 시간 초과' "$VIEWER"
grep -q 'window.addEventListener.*error' "$HTML"
grep -q 'unhandledrejection' "$HTML"

echo "RHWP WebView diagnostics integration test passed"
