#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${TMPDIR:-/tmp}/all-documents-domain-tests.jar"
kotlinc \
  "$ROOT/app/src/main/java/kr/co/alldocuments/domain/DocumentModels.kt" \
  "$ROOT/app/src/main/java/kr/co/alldocuments/domain/DocumentClassifier.kt" \
  "$ROOT/domain-tests/DomainTest.kt" \
  -include-runtime -d "$OUT"
java -jar "$OUT"
