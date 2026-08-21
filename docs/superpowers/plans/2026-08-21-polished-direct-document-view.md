# Polished Direct-View Document UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved polished home-screen design and make document selection open content immediately while keeping recent-document ordering accurate.

**Architecture:** Keep the existing single-activity Compose architecture. The home screen continues to switch to `DocumentViewer` through `selectedDocument`, while `DocumentViewModel` owns persistent document metadata and recency. Extend `DocumentItem`/`DocumentStore` with a backward-compatible `lastOpenedAt` field, then update the UI contract to enforce the polished components and direct-open hooks.

**Tech Stack:** Kotlin, Jetpack Compose Material 3, Android `OpenDocument`, StateFlow, SharedPreferences, existing internal PDF/RHWP/Office renderers.

**Spec:** `docs/superpowers/specs/2026-08-21-polished-direct-document-view.md`

## Global Constraints

- Keep internal-only viewing; do not add `ACTION_VIEW` or external handoff.
- Preserve PDF/text/image/HWP/HWPX/Office renderer paths and security/memory limits.
- Keep the current primary blue `#2563EB` and background `#F7F8FA`.
- Newly added files open immediately.
- Opening any existing file updates recent ordering persistently.
- Existing stored records without `lastOpenedAt` remain readable.

---

### Task 1: Define direct-open and polished UI regression contract

**Files:**
- Modify: `android-source/scripts/test-ui-design.cmd`

**Interfaces:**
- Consumes: source files only.
- Produces: CI contract checks for `openDocument`, immediate picker opening, polished card/search constants, and no external viewer handoff.

- [ ] **Step 1: Add failing checks** for `fun openDocument`, `viewModel.addDocument(uri)?.let`, `shadowElevation`, `RoundedCornerShape(24.dp)`, and `lastOpenedAt`.
- [ ] **Step 2: Confirm current code would fail** because those exact direct-open/recency hooks are not present.
- [ ] **Step 3: Keep existing security checks** including rejection of `ACTION_VIEW`.
- [ ] **Step 4: Re-run the contract after Tasks 2-4 and require PASS.**

### Task 2: Persist last-opened recency

**Files:**
- Modify: `android-source/app/src/main/java/kr/co/alldocuments/domain/DocumentModels.kt`
- Modify: `android-source/app/src/main/java/kr/co/alldocuments/data/DocumentStore.kt`

**Interfaces:**
- Produces: `DocumentItem.lastOpenedAt: Long`.

- [ ] **Step 1: Add `lastOpenedAt: Long = addedAt`** to `DocumentItem`.
- [ ] **Step 2: Append `lastOpenedAt` as the eighth encoded field.**
- [ ] **Step 3: Decode older seven-field rows with `lastOpenedAt = addedAt`.**
- [ ] **Step 4: Sort store loads by `lastOpenedAt` descending.**

### Task 3: Add immediate-open state operations

**Files:**
- Modify: `android-source/app/src/main/java/kr/co/alldocuments/ui/DocumentViewModel.kt`

**Interfaces:**
- Produces: `fun addDocument(uri: Uri): DocumentItem?` and `fun openDocument(item: DocumentItem): DocumentItem`.

- [ ] **Step 1: Change `addDocument` to return the persisted item** while preserving URI permission handling.
- [ ] **Step 2: Preserve favorite state when re-adding the same URI.**
- [ ] **Step 3: Add `openDocument` that stamps `System.currentTimeMillis()`, persists the list, updates StateFlow, and returns the refreshed item.**
- [ ] **Step 4: Change `recentDocuments` to sort by `lastOpenedAt`.**

### Task 4: Apply polished home screen and direct viewer transition

**Files:**
- Modify: `android-source/app/src/main/java/kr/co/alldocuments/ui/AllDocumentsApp.kt`

**Interfaces:**
- Consumes: `DocumentViewModel.addDocument`, `DocumentViewModel.openDocument`.
- Produces: polished Material 3 home UI and direct transition to existing `DocumentViewer`.

- [ ] **Step 1: In picker callback, call `viewModel.addDocument(uri)?.let { selectedDocument = viewModel.openDocument(it) }`.**
- [ ] **Step 2: Route existing card taps through `selectedDocument = viewModel.openDocument(item)`.**
- [ ] **Step 3: Increase top-level horizontal spacing and hierarchy while retaining Korean title/subtitle.**
- [ ] **Step 4: Restyle search field to a 24dp rounded elevated white surface.**
- [ ] **Step 5: Restyle filter chips with consistent pill geometry and compact category labels.**
- [ ] **Step 6: Restyle document cards with 22-24dp corners, subtle elevation, larger file-type tile, clearer typography, and a 44dp favorite touch target.**
- [ ] **Step 7: Keep empty-state add action and all existing behaviors.**

### Task 5: Verify build and release path

**Files:**
- Verify: `.github/workflows/build-all-documents-apk.yml`

**Interfaces:**
- Consumes: all modified source and contract files.
- Produces: passing UI/security contract, signed release APK, signature verification, and SHA-256 publication after merge to `main`.

- [ ] **Step 1: Review final diffs for accidental renderer/security changes.**
- [ ] **Step 2: Merge the focused branch to `main`.**
- [ ] **Step 3: Let the existing self-hosted workflow run UI contract, security contract, release build, APK signature verification, SHA-256, and repository publication.**
- [ ] **Step 4: Confirm the published APK commit and hash before claiming completion.**
