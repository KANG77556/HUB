# Internal Document Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make supported documents open inside the Android app and provide an explicit external fallback for formats without a trustworthy native renderer.

**Architecture:** Add a pure viewer-strategy resolver plus a Compose viewer screen. PDF uses Android PdfRenderer, images use ContentResolver/BitmapFactory, and text/CSV use ContentResolver text streams. Unsupported Office/HWP/OpenDocument binaries show an explanatory screen with external-open fallback.

**Tech Stack:** Kotlin, Jetpack Compose, Android ContentResolver, PdfRenderer, BitmapFactory, GitHub Actions/Gradle.

**Spec:** `android-source/docs/superpowers/specs/2026-08-18-internal-document-viewer-design.md`

## Global Constraints
- Preserve the original persisted content URI; do not rewrite or convert source documents.
- minSdk 26, targetSdk 35, Java/Kotlin JVM 17.
- Unsupported binary formats must fail explicitly and retain external-open fallback.

---

### Task 1: Viewer strategy dispatch

**Files:**
- Create: `android-source/app/src/main/java/kr/co/alldocuments/domain/DocumentViewerStrategy.kt`
- Modify: `android-source/domain-tests/DomainTest.kt`

**Interfaces:**
- Produces: `DocumentViewerStrategy.resolve(name: String, mimeType: String?): ViewerKind`

- [ ] Write failing assertions for PDF, image, TXT/CSV and unsupported DOCX/HWP.
- [ ] Run `bash scripts/test-domain.sh` and verify the new assertions fail.
- [ ] Implement `ViewerKind` and deterministic strategy resolution.
- [ ] Run `bash scripts/test-domain.sh` and verify all domain tests pass.

### Task 2: In-app viewer UI

**Files:**
- Create: `android-source/app/src/main/java/kr/co/alldocuments/ui/DocumentViewer.kt`
- Modify: `android-source/app/src/main/java/kr/co/alldocuments/ui/AllDocumentsApp.kt`

**Interfaces:**
- Consumes: `DocumentViewerStrategy.resolve(...)`
- Produces: `DocumentViewer(item: DocumentItem, onBack: () -> Unit)`

- [ ] Route document-card taps to selected-document state instead of immediately starting ACTION_VIEW.
- [ ] Implement PDF rendering using `PdfRenderer` and a duplicated file descriptor per rendered page lifecycle.
- [ ] Implement image rendering from the original content URI.
- [ ] Implement bounded UTF-8 text/CSV reading with a clear read-error state.
- [ ] Implement unsupported-format screen and external ACTION_VIEW fallback with URI read grant.
- [ ] Build with `gradle --no-daemon assembleDebug`.

### Task 3: CI verification and APK publication

**Files:**
- Modify only if required: `.github/workflows/build-all-documents-apk.yml`

**Interfaces:**
- Produces: `downloads/all-documents-debug.apk`

- [ ] Run domain tests in CI.
- [ ] Build debug APK in CI.
- [ ] Verify APK is non-empty and `unzip -t` succeeds.
- [ ] Publish the verified APK to the stable repository path.
