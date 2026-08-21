# Polished Direct-View Document UI Spec

## Goal
Refresh the Android home screen to the approved polished card-based design and make every document card open its content immediately in the internal viewer.

## UX requirements
- Keep the app title `모든 문서` and subtitle `필요한 문서를 한곳에서 빠르게 열어보세요`.
- Use a light gray app background, white elevated cards, rounded corners, restrained blue accent, consistent spacing, and stronger visual hierarchy.
- Keep the search field, document type filters, recent documents, all documents, favorite toggle, and add-document action.
- Make the add action a prominent circular primary button.
- Make category chips compact, consistent, horizontally scrollable, and visually distinguish selected state.
- Make document cards larger and easier to scan with a file-type icon tile, primary filename, type label, and favorite action.
- Tapping a document card must immediately render the document in the existing internal viewer; no extra detail screen, confirmation, or external app handoff.
- Opening a document must update its recency so the latest opened item appears first in `최근 문서`.
- Newly selected documents should be opened immediately after being added.
- Preserve internal rendering support for PDF, text, image, HWP/HWPX, and Office formats.
- Preserve existing security hardening and bounded-memory rendering behavior.

## Technical approach
- Keep the existing single-activity Compose architecture and `selectedDocument` viewer switch rather than introducing Navigation Compose.
- Add a `lastOpenedAt` timestamp to `DocumentItem` with backward-compatible persistence.
- Add `openDocument(item)` in `DocumentViewModel` to persist recency.
- Change the picker callback to return the new `DocumentItem` from `addDocument` and immediately select it for viewing.
- Replace the current compact home layout with a polished Material 3 composition in `AllDocumentsApp.kt`.
- Extend the UI contract script so CI enforces the new visual structure and direct-open behavior.

## Non-goals
- No external viewer integration.
- No unrelated renderer refactor.
- No new network dependency.
- No change to document size or security limits.
