# All Documents Android Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an installable Android app that selects, classifies, searches, favorites, and opens local documents.

**Architecture:** A single Compose application module uses Storage Access Framework for URI selection and a small pure-Kotlin domain layer for classification/filtering. UI state is held in a ViewModel and document opening is delegated to Android ACTION_VIEW.

**Tech Stack:** Kotlin 2.0.21, Android Gradle Plugin 8.7.2, Jetpack Compose BOM 2024.10.01, Material 3, AndroidX Lifecycle ViewModel Compose.

**Spec:** `docs/superpowers/specs/2026-08-18-all-documents-android-design.md`

## Global Constraints
- minSdk 26
- targetSdk 35
- compileSdk 35
- Offline-first local document workflow
- UI must remain simple and immediately understandable

---

### Task 1: Domain classification and filtering
**Files:**
- Create: `app/src/main/java/kr/co/alldocuments/domain/DocumentModels.kt`
- Create: `app/src/main/java/kr/co/alldocuments/domain/DocumentClassifier.kt`
- Test: `domain-tests/DomainTest.kt`

**Interfaces:**
- Produces: `DocumentType`, `DocumentItem`, `DocumentClassifier.classify(name, mime)`, `filterDocuments(items, query, type)`

- [ ] Write failing Kotlin tests for classification and filtering.
- [ ] Run tests and verify failure because production symbols do not exist.
- [ ] Implement the minimal domain classes and functions.
- [ ] Run tests and verify pass.

### Task 2: Android project and document repository
**Files:**
- Create: root Gradle files and `app/build.gradle.kts`
- Create: `AndroidManifest.xml`
- Create: `data/DocumentMetadataReader.kt`
- Create: `ui/DocumentViewModel.kt`

**Interfaces:**
- Consumes: domain model/classifier
- Produces: ViewModel state and document add/favorite behavior

- [ ] Configure Android application and Compose dependencies.
- [ ] Implement ContentResolver metadata extraction and URI permission handling.
- [ ] Implement ViewModel document state/search/filter/favorite behavior.

### Task 3: Compose interface and document opening
**Files:**
- Create: `MainActivity.kt`
- Create: `ui/AllDocumentsApp.kt`
- Create: `ui/theme/Theme.kt`

**Interfaces:**
- Consumes: ViewModel state
- Produces: file picker, search/filter UI, favorites, ACTION_VIEW opening

- [ ] Build a single-screen Material 3 UI with top app bar, search, filter chips, recent/all document cards and empty state.
- [ ] Wire OpenDocument picker and URI opening with error snackbar.
- [ ] Add vector-free launcher defaults and app strings.

### Task 4: Verification and APK
**Files:**
- Create: `README.md`
- Create: `scripts/test-domain.sh`

- [ ] Run domain tests.
- [ ] Run `./gradlew assembleDebug`.
- [ ] Verify `app/build/outputs/apk/debug/app-debug.apk` exists and report SHA-256.
