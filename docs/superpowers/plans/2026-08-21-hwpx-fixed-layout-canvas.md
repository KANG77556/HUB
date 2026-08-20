# HWPX Fixed-Layout Canvas Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the SVG/DOM HWP/HWPX preview path with RHWP's page-layer Canvas renderer so complex tables are painted at fixed page coordinates instead of being reinterpreted by browser SVG/font CSS.

**Architecture:** Keep the Android WebView and bundled `@rhwp/core` 0.8.4 runtime, but change each HWP/HWPX page from `renderPageSvg()` output to an HTML `<canvas>` rendered by `HwpDocument.renderPageToCanvas()`. Preserve page aspect ratio and mobile fit-to-width by CSS scaling the backing canvas rather than rewriting SVG text/font attributes. Retain the existing internal-only viewer contract and no external app fallback.

**Tech Stack:** Android Kotlin/Compose, Android WebView, HTML/JavaScript, `@rhwp/core` 0.8.4 WASM Canvas/PageLayerTree renderer, shell regression tests, GitHub Actions self-hosted Windows runner.

**Spec:** Approved in chat on 2026-08-21: complex HWP/HWPX tables must use a fixed-layout internal rendering path, preserve merged cells/row heights/page layout as far as the RHWP page paint IR supports, retain zoom/scroll, and never invoke external apps.

## Global Constraints

- HWP/HWPX must remain readable only inside the app UI; no `ACTION_VIEW` or external viewer fallback.
- Keep `@rhwp/core` pinned to `0.8.4`.
- Keep page-by-page scrolling and WebView zoom.
- Do not rewrite SVG text/font properties because the new path must not use SVG pages.
- Build and verification must run on the existing Windows self-hosted runner.
- Publish the verified APK to `downloads/all-documents-debug.apk`.

---

### Task 1: Canvas renderer regression contract

**Files:**
- Modify: `android-source/scripts/test-rhwp-webview.sh`

**Interfaces:**
- Consumes: `android-source/app/src/main/assets/rhwp-viewer/index.html`
- Produces: static regression gate requiring Canvas rendering and forbidding the old SVG page path.

- [ ] Add assertions for `renderPageToCanvas`, `canvas-page`, and fixed backing dimensions.
- [ ] Add a negative assertion forbidding `renderPageSvg` in the viewer HTML.
- [ ] Keep existing WebView/internal-viewer checks.
- [ ] Commit the failing test before production code.

### Task 2: Fixed-layout Canvas page rendering

**Files:**
- Modify: `android-source/app/src/main/assets/rhwp-viewer/index.html`

**Interfaces:**
- Consumes: `HwpDocument.pageCount()` and `HwpDocument.renderPageToCanvas(page, canvas, scale)`.
- Produces: one fixed-layout `<canvas>` per HWP/HWPX page, wrapped in a responsive page shell.

- [ ] Remove the SVG page normalization and DOM font rewriting path.
- [ ] Create a canvas per page and call `renderPageToCanvas` at a high-quality backing scale.
- [ ] CSS-scale each rendered canvas to page width while preserving the pixel aspect ratio.
- [ ] Render pages sequentially to limit peak memory and keep status/error reporting.
- [ ] Re-run the static regression gate.

### Task 3: Build and APK verification

**Files:**
- Existing: `.github/workflows/build-internal-viewer-selfhosted.yml`

**Interfaces:**
- Consumes: branch source and pinned RHWP runtime.
- Produces: verified `downloads/all-documents-debug.apk` and SHA-256 file.

- [ ] Trigger the self-hosted workflow with the source change.
- [ ] Verify JDK/Gradle preparation, RHWP vendoring, internal-only source guard, and `assembleDebug` all succeed.
- [ ] Verify the APK contains `assets/rhwp-viewer/index.html`, `rhwp.js`, and `rhwp_bg.wasm`.
- [ ] Verify the published APK SHA-256 and copy the successful artifact to `main` for reliable download.
