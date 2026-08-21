# Document Editing v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe in-app TXT editing/save first, then offline HWP/HWPX editing/save, while preserving the internal-only viewer and release hardening.

**Architecture:** Keep `DocumentViewer` responsible for switching read/edit surfaces. Introduce `DocumentEditorRepository` for ContentResolver-based writes and bounded reads, `TextDocumentEditor` for Compose editing, and later `RhwpEditorWebView` for a fully offline editor bundle under the existing appassets origin. `AllDocumentsApp` owns Save As launchers and reopens saved copies.

**Tech Stack:** Android/Kotlin, Jetpack Compose Material3, Storage Access Framework, ContentResolver, Android WebView/WebViewAssetLoader, RHWP 0.8.4 editor/studio assets, GitHub Actions self-hosted Windows runner.

**Spec:** `docs/superpowers/specs/2026-08-21-document-editing-v1-design.md`

## Global Constraints
- `usesCleartextTraffic=false` and backups disabled remain unchanged.
- No `ACTION_VIEW` external viewer fallback.
- No remote editor URL, CDN script, remote web font, or cloud conversion.
- Existing 50 MB HWP/HWPX source limit remains unchanged.
- Existing WebView file/content/universal access restrictions remain enabled.
- Saving is explicit; failed writes must preserve dirty editor state.
- Unsupported Office/PDF formats stay read-only in v1.

---

### Task 1: Editing contract and write repository

**Files:**
- Create: `android-source/scripts/test-document-editing.cmd`
- Create: `android-source/app/src/main/java/kr/co/alldocuments/data/DocumentEditorRepository.kt`
- Modify: `.github/workflows/build-all-documents-apk.yml`

**Interfaces:**
- Produces: `DocumentEditorRepository.canWrite(uri: Uri): Boolean`
- Produces: `DocumentEditorRepository.writeText(uri: Uri, text: String): Result<Unit>`
- Produces: `DocumentEditorRepository.writeBytes(uri: Uri, bytes: ByteArray): Result<Unit>`
- Produces: `DocumentEditorRepository.readBytes(uri: Uri, maxBytes: Int): Result<ByteArray>`

- [ ] **Step 1: Write the failing contract test**

The CMD contract must fail until the repository and editor UI exist. It checks for `openOutputStream(uri, "wt")`, bounded reads, `TextDocumentEditor`, `CreateDocument`, edit/save/cancel labels, persisted write grant, and absence of `ACTION_VIEW`.

- [ ] **Step 2: Run test and verify RED**

Run: `cmd /c android-source\scripts\test-document-editing.cmd`
Expected: non-zero exit because `DocumentEditorRepository.kt` and editor UI are not present.

- [ ] **Step 3: Implement minimal repository**

Use only `ContentResolver` streams. `canWrite` checks persisted URI grants and provider write capability without filesystem paths. `writeText` delegates to UTF-8 `writeBytes`. `writeBytes` opens `openOutputStream(uri, "wt")`, writes, flushes, closes, and only then returns success. `readBytes` enforces `maxBytes` while streaming.

- [ ] **Step 4: Add contract to CI**

Add a `Verify document editing contract` step before JDK/Gradle setup.

- [ ] **Step 5: Re-run contract**

Expected: repository-related checks pass; UI-related checks still fail until Task 2.

- [ ] **Step 6: Commit**

Commit message: `test: define safe document editing contract`

---

### Task 2: TXT edit, overwrite, cancel, and Save As

**Files:**
- Create: `android-source/app/src/main/java/kr/co/alldocuments/ui/TextDocumentEditor.kt`
- Modify: `android-source/app/src/main/java/kr/co/alldocuments/ui/DocumentViewer.kt`
- Modify: `android-source/app/src/main/java/kr/co/alldocuments/ui/AllDocumentsApp.kt`
- Modify: `android-source/app/src/main/java/kr/co/alldocuments/ui/DocumentViewModel.kt`

**Interfaces:**
- `TextDocumentEditor(text: String, onTextChange: (String) -> Unit)` renders a multiline editor only.
- `DocumentViewer` emits `SaveAsRequest(fileName: String, mimeType: String, bytes: ByteArray)` when original overwrite is unavailable or fails.
- `DocumentViewModel.addDocument` requests persistent READ and WRITE flags when offered by the provider.

- [ ] **Step 1: Extend the failing contract for TXT UI behavior**

Require `편집`, `저장`, `취소`, dirty-state confirmation, `ActivityResultContracts.CreateDocument`, and `Intent.FLAG_GRANT_WRITE_URI_PERMISSION`.

- [ ] **Step 2: Run contract and verify RED**

Expected: fail on missing editor/save-as symbols.

- [ ] **Step 3: Implement `TextDocumentEditor`**

Use a full-size multiline `BasicTextField` or Material3 text field with existing typography, white document surface, and no file I/O.

- [ ] **Step 4: Add TXT edit mode to `DocumentViewer`**

For `ViewerKind.TEXT`, top bar exposes `편집`. In edit mode track original/current buffer, dirty state, saving state, save errors, and cancel confirmation. Attempt original URI write first. On failure or no write capability emit `SaveAsRequest` while retaining editor state.

- [ ] **Step 5: Add Save As launcher to `AllDocumentsApp`**

Use `ActivityResultContracts.CreateDocument(mimeType)`. Write the pending bytes to returned URI with `DocumentEditorRepository`, then add/open the new document. Cancel returns to the editor without clearing the pending buffer.

- [ ] **Step 6: Re-run contract**

Expected: PASS.

- [ ] **Step 7: Compile debug and release source**

Run: `gradle -p android-source --no-daemon assembleDebug`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 8: Commit**

Commit message: `feat: edit and save text documents in app`

---

### Task 3: Pin and vendor offline RHWP editor assets

**Files:**
- Modify: `.github/workflows/build-all-documents-apk.yml`
- Create/Update: `android-source/app/src/main/assets/rhwp-editor/**`
- Modify: `android-source/scripts/test-document-editing.cmd`

**Interfaces:**
- Editor bundle must load entirely from `https://appassets.androidplatform.net/assets/rhwp-editor/`.
- Use RHWP editor/studio version `0.8.4` only after exact package/build hashes are recorded.

- [ ] **Step 1: Add failing asset contract**

Require `rhwp-editor/index.html`, local JS/CSS/WASM assets, version marker `0.8.4`, and no `http://` or `https://` references except the appassets origin in Android code.

- [ ] **Step 2: Run contract and verify RED**

Expected: fail because editor assets are absent.

- [ ] **Step 3: Build/vendor pinned assets on self-hosted workflow**

Fetch source/package at exact version, verify SHA-256 before extraction/build, disable external web fonts, copy only required static assets into `rhwp-editor`.

- [ ] **Step 4: Extend release content verification**

Fail release if required editor entrypoint/assets are missing from APK.

- [ ] **Step 5: Re-run contract**

Expected: PASS for asset checks.

- [ ] **Step 6: Commit**

Commit message: `build: vendor pinned offline RHWP editor assets`

---

### Task 4: HWP/HWPX edit/export/save bridge

**Files:**
- Create: `android-source/app/src/main/java/kr/co/alldocuments/ui/RhwpEditorWebView.kt`
- Modify: `android-source/app/src/main/java/kr/co/alldocuments/ui/DocumentViewer.kt`
- Modify: `android-source/scripts/test-document-editing.cmd`

**Interfaces:**
- `RhwpEditorWebView(base64: String, fileName: String, onExported: (ByteArray) -> Unit, onError: (String) -> Unit)`.
- Export bytes must be bounded to the same 50 MB limit before persistence.
- HWP uses `exportHwp()`, HWPX uses `exportHwpx()`.

- [ ] **Step 1: Add failing hardened-WebView contract**

Require appassets-only navigation/interception, file/content access disabled, no universal access, exact editor URL, bounded export, and no arbitrary filesystem/native bridge methods.

- [ ] **Step 2: Run contract and verify RED**

Expected: fail because `RhwpEditorWebView.kt` does not exist.

- [ ] **Step 3: Implement hardened editor WebView**

Load local editor entrypoint, pass document bytes through a bounded JS command, expose only the minimum export callback, block every non-appassets request.

- [ ] **Step 4: Integrate edit/save flow**

HWP/HWPX default to existing viewer. `편집` switches to editor. `저장` exports matching format, tries original overwrite, otherwise Save As. Successful persistence returns to read-only viewer and reloads the saved document.

- [ ] **Step 5: Re-run contract and compile**

Expected: editing contract PASS and `assembleDebug` BUILD SUCCESSFUL.

- [ ] **Step 6: Commit**

Commit message: `feat: edit HWP and HWPX offline`

---

### Task 5: Release verification and delivery

**Files:**
- Modify only if required by verification findings.

- [ ] **Step 1: Run all static contracts**

Run:
- `cmd /c android-source\scripts\test-ui-design.cmd`
- `cmd /c android-source\scripts\test-security-hardening.cmd`
- `cmd /c android-source\scripts\test-document-editing.cmd`

Expected: all exit 0.

- [ ] **Step 2: Build signed release in CI**

Expected: release build, signature verification, asset-content verification, SHA-256 generation, and publish steps all succeed.

- [ ] **Step 3: Verify published APK provenance**

Confirm the bot publish commit is a direct descendant of the merged editing commit and the APK/hash changed.

- [ ] **Step 4: Report device-test boundary**

CI verification is complete; physical Android-device editing must still be exercised by the user with representative TXT/HWP/HWPX files.
