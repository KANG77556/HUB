# rhwp HWP/HWPX Internal Viewer Design

## Goal
Provide a free, offline-first in-app HWP/HWPX viewer that preserves the original source file and renders documents through the open-source `rhwp` WebAssembly engine instead of converting them to plain text or rewriting them.

## Chosen approach
Embed a local Android `WebView` viewer backed by a vendored `@rhwp/core` browser bundle and `rhwp_bg.wasm`. The Android layer reads the original persisted `content://` URI as bytes, passes those bytes to the local viewer without network access, and the viewer constructs `HwpDocument` and renders pages as SVG using rhwp's WASM API.

This follows rhwp's documented browser integration model: initialize the WASM module, create `HwpDocument` from a `Uint8Array`, provide `measureTextWidth` through Canvas, and render pages via `renderPageSvg(pageIndex)`.

## Scope
- HWP 5.x and HWPX handled through rhwp where supported by the bundled version.
- Original file remains unchanged and is never overwritten.
- No cloud upload and no remote document conversion.
- Viewer works from app-packaged HTML/JS/WASM assets.
- PDF/image/text viewers already in the app remain unchanged.
- Unsupported/corrupt documents show an explicit Korean error and retain an `외부 앱으로 열기` fallback.

## Android architecture
### `RhwpViewerScreen`
Compose screen that hosts an Android `WebView`, controls loading/error state, title, back navigation, zoom, and external-open fallback.

### `RhwpViewerBridge`
Small Android-to-JavaScript bridge. Android reads bytes from `ContentResolver`, Base64-encodes them for transport, and invokes a single JavaScript entry point such as `window.rhwpViewer.openDocument(base64, fileName)` after the viewer reports readiness.

The bridge exposes no arbitrary filesystem or network capability to JavaScript.

### Local web assets
`app/src/main/assets/rhwp-viewer/index.html` contains the viewer shell. A bundled JavaScript module initializes rhwp and renders page SVGs into a vertical document container. `rhwp_bg.wasm` and its generated JS glue are shipped inside the APK.

## Rendering behavior
- Pages are displayed vertically as SVG with white page backgrounds and document aspect ratios preserved.
- Canvas `measureText` is used for rhwp font metrics.
- WebView supports pinch zoom and scrolling.
- The viewer does not synthesize or simplify unsupported layout objects silently; renderer errors are surfaced.

## Security and privacy
- `WebView` loads only app assets.
- General internet navigation is blocked.
- File/content URL access that is not required by the local viewer is disabled.
- JavaScript receives only bytes of the user-selected document.
- No document leaves the device.

## Dependency and license policy
Use an MIT-licensed rhwp release and include required attribution/license text in app notices. Pin the exact rhwp package/version and vendor its deterministic build output into the Android project so runtime viewing does not depend on npm, a CDN, or internet connectivity.

## Fidelity statement
The target is the highest fidelity achievable with the selected open-source rhwp release, including text, tables, images, equations, headers/footers, columns, and pagination where supported. The app must not claim pixel-identical parity with Hancom Office when rhwp itself does not guarantee it.

## Verification
1. Unit-test viewer strategy routing so `.hwp` and `.hwpx` select the RHWP strategy.
2. Add a local viewer smoke test that verifies required asset names and JS entry points are packaged.
3. Build `assembleDebug` in GitHub Actions.
4. Verify APK integrity with `unzip -t` and SHA-256.
5. Publish the verified APK to the existing artifact and stable download path.
