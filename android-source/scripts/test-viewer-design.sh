#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VIEWER="$ROOT/app/src/main/java/kr/co/alldocuments/ui/DocumentViewer.kt"
HTML="$ROOT/app/src/main/assets/rhwp-viewer/index.html"

grep -q 'VIEWER_TOP_BAR_HEIGHT_DP = 52' "$VIEWER"
grep -q 'height(VIEWER_TOP_BAR_HEIGHT_DP.dp)' "$VIEWER"
grep -q 'Color(0xFFF9FAFB)' "$VIEWER"
grep -q 'Color(0xFFE5E7EB)' "$VIEWER"
grep -q 'contentDescription = "뒤로"' "$VIEWER"
grep -q 'MaterialTheme.typography.bodyMedium' "$VIEWER"
grep -q 'maxLines = 1' "$VIEWER"
grep -q 'TextOverflow.Ellipsis' "$VIEWER"
! grep -q '외부 앱으로 열기' "$VIEWER"
grep -q -- '--gap:8px;--pad:4px' "$HTML"
grep -q 'border:1px solid rgba(17,24,39,.08)' "$HTML"
grep -q 'box-shadow:0 1px 2px rgba(0,0,0,.10)' "$HTML"

echo "Compact document viewer design test passed"
