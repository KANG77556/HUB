# Internal Document Viewer Design

## Goal
Replace the document-card primary action that always delegates to an external Android app with an in-app viewer flow, while preserving the original persisted content URI and never rewriting the source document.

## Architecture
`AllDocumentsApp` owns lightweight navigation between the library and a viewer screen. `DocumentViewer` dispatches by document type/MIME to a focused renderer. PDF uses Android `PdfRenderer`; images use Android bitmap decoding; text/CSV use `ContentResolver` text streams. Formats for which this app has no trustworthy native renderer (DOC/DOCX, XLS/XLSX, PPT/PPTX, HWP/HWPX, ODT/ODS/ODP and unknown binaries) get an explicit unsupported-internal-renderer screen with an external-open fallback rather than pretending to preserve layout.

## Data and permissions
The existing `OpenDocument` contract and persisted URI permission remain the source of truth. Viewer code consumes the original `content://` URI through `ContentResolver`; it does not copy, convert, edit, or replace the document.

## UI
Tapping a document opens an in-app viewer. The viewer has a back action, document name, content area, loading/error states, and an `외부 앱으로 열기` fallback. PDF pages are rendered as page images in a vertical list. Images are shown fit-to-width. Text and CSV are displayed as scrollable text.

## Failure behavior
Missing permission, unreadable/corrupt content, unsupported internal formats, and renderer exceptions are surfaced as explicit Korean messages. Unsupported formats retain a working external-view intent with read permission.

## Verification
Add pure dispatch tests for viewer strategy selection, keep existing domain tests, compile the Android app, run the debug APK build, verify the APK archive, and publish it to `downloads/all-documents-debug.apk` through the existing workflow.
