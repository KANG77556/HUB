# rhwp HWP/HWPX Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a free offline HWP/HWPX in-app viewer using the open-source rhwp WASM renderer while preserving original document bytes.

**Architecture:** Android Compose routes HWP/HWPX documents to a dedicated WebView screen. Android reads the persisted content URI and sends document bytes to a local, APK-packaged rhwp HTML/JS/WASM viewer, which renders pages as SVG and never uploads or rewrites the document.

**Tech Stack:** Kotlin, Jetpack Compose, Android WebView, JavaScript, WebAssembly, rhwp/@rhwp/core, GitHub Actions/Gradle

**Spec:** `docs/superpowers/specs/2026-08-18-rhwp-viewer-design.md`

## Global Constraints
- Free/open-source rhwp integration only; no Hancom commercial SDK.
- Offline runtime: no CDN and no document upload.
- Preserve the original `content://` document and never overwrite it.
- Pin and vendor the exact rhwp browser/WASM build used by the app.
- Keep an external-open fallback for unsupported/corrupt documents.
- Do not claim pixel-identical Hancom Office parity.

---

## File structure
- Modify `app/src/main/java/kr/co/alldocuments/viewer/ViewerStrategy.kt`: add RHWP strategy/routing.
- Modify `app/src/main/java/kr/co/alldocuments/ui/DocumentViewer.kt`: dispatch HWP/HWPX to RHWP screen.
- Create `app/src/main/java/kr/co/alldocuments/viewer/RhwpViewerScreen.kt`: WebView host and lifecycle/error UI.
- Create `app/src/main/java/kr/co/alldocuments/viewer/RhwpDocumentLoader.kt`: ContentResolver byte loading and size/error handling.
- Create `app/src/main/assets/rhwp-viewer/index.html`: offline viewer shell.
- Create `app/src/main/assets/rhwp-viewer/viewer.js`: WASM initialization, document construction, SVG page rendering.
- Vendor pinned rhwp generated JS/WASM files under `app/src/main/assets/rhwp-viewer/vendor/`.
- Create/update domain tests for HWP/HWPX routing and asset smoke checks.
- Update notices/readme with rhwp MIT attribution and exact version.

## Task 1: Route HWP/HWPX to RHWP
- [ ] Write failing routing tests for `.hwp`, `.hwpx`, and their MIME types.
- [ ] Run domain tests and confirm the new assertions fail.
- [ ] Add `RHWP` viewer strategy and minimal routing implementation.
- [ ] Run domain tests and confirm they pass.
- [ ] Commit routing change.

## Task 2: Add safe Android document loader
- [ ] Write tests for readable, missing, empty, and oversized document input where testable.
- [ ] Implement focused `RhwpDocumentLoader` using `ContentResolver.openInputStream`.
- [ ] Return explicit typed errors rather than swallowing exceptions.
- [ ] Run tests.
- [ ] Commit loader change.

## Task 3: Vendor and wrap rhwp browser/WASM assets
- [ ] Pin an MIT-licensed rhwp release/package revision and record it in notices.
- [ ] Produce or obtain the deterministic browser JS/WASM build for that pinned revision.
- [ ] Vendor only runtime files required by the viewer under assets.
- [ ] Add `index.html` and `viewer.js` wrapper exposing one `openDocument` entry point.
- [ ] Block network navigation and avoid remote dependencies.
- [ ] Add an asset smoke check for index, JS glue, WASM, and the expected entry point.
- [ ] Commit vendored runtime and wrapper.

## Task 4: Implement Compose WebView viewer
- [ ] Add a failing/structural test or compile gate for RHWP screen dispatch.
- [ ] Implement `RhwpViewerScreen` with AndroidView/WebView.
- [ ] Enable JavaScript and WASM-required browser capabilities only; disable unnecessary file/content access.
- [ ] Load local viewer assets, wait for readiness, then inject Base64 document bytes through the fixed entry point.
- [ ] Enable scrolling/pinch zoom and surface renderer errors in Korean.
- [ ] Add `외부 앱으로 열기` fallback.
- [ ] Run tests/compile.
- [ ] Commit viewer integration.

## Task 5: Integrate with existing document screen
- [ ] Update `DocumentViewer` to dispatch RHWP without changing PDF/image/text behavior.
- [ ] Verify back navigation, title, loading, error, and fallback behavior.
- [ ] Run all domain tests.
- [ ] Commit integration.

## Task 6: Build and verify APK
- [ ] Run/trigger the existing GitHub Actions workflow for `build/all-documents-android`.
- [ ] Confirm domain tests complete with zero failures.
- [ ] Confirm Gradle `assembleDebug` exits successfully.
- [ ] Confirm `unzip -t` validates the APK.
- [ ] Record SHA-256 and verify the stable `downloads/all-documents-debug.apk` was updated.
- [ ] Download/install the artifact for device-level HWP/HWPX smoke testing when a representative sample file is available.
- [ ] Only after fresh evidence, report completion and provide the verified APK link.
