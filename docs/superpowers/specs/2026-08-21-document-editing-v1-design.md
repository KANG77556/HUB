# Document Editing v1 Design

## Goal
Add safe in-app editing and saving to All Documents without weakening the existing internal-only viewer or release hardening.

## Scope

### Phase A — TXT editing
- TXT opens in the current internal viewer as today.
- The top bar shows `편집` for supported text documents even when the source URI is read-only, because read-only sources can still be edited and saved through Save As.
- Entering edit mode replaces the read-only text surface with a multiline Compose text editor.
- `저장` writes UTF-8 text back to the existing document URI when write access is available.
- If the existing URI cannot be written, the app opens Android `CreateDocument` and saves a copy instead.
- `취소` discards unsaved changes after confirmation when the buffer is dirty.
- Saving is explicit; no background overwrite of the source file.

### Phase B — HWP/HWPX editing
- Keep the current hardened RHWP canvas viewer as the default read-only path.
- Add `편집` for HWP/HWPX only after the offline editor bundle is successfully vendored and verified.
- Vendor RHWP Studio/editor assets into `app/src/main/assets/rhwp-editor/`; do not load a remote editor page, CDN script, web font, or network API.
- Use the existing `WebViewAssetLoader` origin (`https://appassets.androidplatform.net`) and retain blocked external requests.
- Pass the opened document to the editor through a bounded Base64 bridge, using the same 50 MB source limit as the current RHWP viewer.
- Receive exported HWP/HWPX bytes from JavaScript through a narrowly scoped Android bridge whose only responsibility is returning the edited binary to Kotlin.
- Do not expose arbitrary filesystem paths, Java reflection, network access, or general-purpose native methods to the editor page.
- On `저장`, write the exported bytes to the original URI when writable. Otherwise launch `CreateDocument` with the original extension and save a copy.
- Re-open the saved document through the existing viewer after a successful save to verify that it remains readable.

## Save model

### Original URI
The app requests persistent read and write grants from `ACTION_OPEN_DOCUMENT`. Existing read-only persisted grants remain valid; write capability is detected separately.

### Original overwrite
Use `ContentResolver.openOutputStream(uri, "wt")` (or the provider-supported truncate mode) and only report success after the stream is closed without error.

### Save As
Use `ActivityResultContracts.CreateDocument(mimeType)` and preserve the original extension. The save-as result is added to the document list and opened immediately.

### Failure handling
- Source read failure: stay in viewer and show the existing error state.
- Export failure: keep the editor buffer intact and show a save error.
- Write failure: do not clear dirty state; offer `다른 이름으로 저장`.
- Save-as cancellation: return to editor without discarding changes.
- Re-open validation failure for HWP/HWPX: report that the saved file could not be validated and keep the editor state available.

## UI
Viewer top bar states:

Read-only editable document:
`←  파일명                              편집`

Edit mode:
`취소  파일명                           저장`

Saving:
`취소  파일명                       저장 중…`

Unsupported/read-only document:
`←  파일명`

No Office/PDF editing is included in v1.

## Architecture

### `DocumentViewer.kt`
- Owns read/view state only.
- Determines whether the current `ViewerKind` is editable.
- Switches between viewer and editor surfaces.
- Delegates actual writes to `DocumentEditorRepository`.

### `DocumentEditorRepository.kt`
New data-layer component responsible for:
- `canWrite(uri: Uri): Boolean`
- `writeText(uri: Uri, text: String)`
- `writeBytes(uri: Uri, bytes: ByteArray)`
- bounded source reads required by editor flows

### `TextDocumentEditor.kt`
New Compose editor surface with:
- multiline editing
- dirty-state tracking
- save/cancel callbacks
- no independent file I/O

### `RhwpEditorWebView.kt`
New hardened WebView wrapper used only for HWP/HWPX edit mode.
- loads only `appassets.androidplatform.net/assets/rhwp-editor/index.html`
- blocks every non-appassets request
- exposes a single export callback bridge
- does not enable file/content access

### `AllDocumentsApp.kt`
- owns `CreateDocument` launcher used for Save As
- receives pending save payload from `DocumentViewer`
- adds/open the newly created document after a successful Save As

### Workflow
`.github/workflows/build-all-documents-apk.yml` vendors pinned RHWP editor/studio assets only after their exact source/version and SHA-256 are recorded. The build must fail if required editor assets are missing or hashes differ.

## Security constraints
- `usesCleartextTraffic=false` remains unchanged.
- No `ACTION_VIEW` external viewer fallback.
- No remote editor URLs.
- Existing WebView file/content/universal access restrictions remain enabled.
- Existing 50 MB RHWP input limit remains unchanged.
- Editor export is size-bounded before writing.
- No overwrite is considered successful until the output stream closes.

## Testing

### Static/contract tests
- TXT viewer exposes edit mode and save/cancel actions.
- `DocumentEditorRepository` uses `ContentResolver` output streams and has no filesystem-path writes.
- RHWP editor WebView blocks non-appassets URLs.
- Manifest still disables cleartext and backups.
- CI requires pinned RHWP editor assets before release build.

### Runtime tests
- Open TXT → edit → save → re-open shows modified text.
- TXT provider without write grant → edit → Save As → new file opens with modified text.
- Cancel dirty TXT edit → confirmation → original remains unchanged.
- HWP/HWPX editor loads offline with airplane mode enabled.
- HWP/HWPX edit → export → save → existing viewer can reopen the result.
- External requests from the editor page are blocked.

## Delivery order
1. Implement and release TXT editing/save first.
2. Vendor and validate RHWP editor assets on the self-hosted runner.
3. Integrate HWP/HWPX editor bridge and save flow.
4. Run release signing/content verification and publish the new APK.

## Non-goals
- DOCX editing
- XLSX editing
- PPTX editing
- PDF content editing
- cloud sync
- remote document conversion
