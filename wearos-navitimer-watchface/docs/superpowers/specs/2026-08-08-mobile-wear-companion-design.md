# Mobile + Wear Companion Design

## Goal
Build a two-module Android project that lets the user install a phone companion app, preview and configure a premium black/rose-gold watch face, and apply matching settings to a Wear OS watch face.

## Architecture
- `mobile`: Android phone companion app.
- `wear`: Wear OS watch-face app using Watch Face Format resources.
- Shared settings model: style id, accent choice, complication preferences, and AOD preference.
- Phone app persists choices locally and uses Wearable Data Layer to send settings to the paired watch.
- Wear module reads settings and renders the selected style without making the watch face dependent on the phone at runtime.

## Mobile module
- Home screen with large watch-face preview.
- Controls for accent theme and AOD preference.
- Status area showing whether a paired Wear OS node is reachable.
- Apply button writes local preferences and sends a `/watchface/config` DataItem.
- Clear user feedback for success, unavailable watch, and transport errors.

## Wear module
- Premium black dial with rose-gold accents.
- Time hands, date, battery, steps, and complications where supported.
- AOD mode with reduced content.
- Data Layer listener receives config updates and persists them locally.
- Watch face must remain usable even if the phone is disconnected.

## Packaging
- One Gradle project with `mobile` and `wear` application modules.
- Separate APK outputs: `mobile-debug.apk` and `wear-debug.apk`.
- GitHub Actions workflow at repository root `.github/workflows/build-watchface.yml` with project working directory `wearos-navitimer-watchface`.
- Workflow uploads both APK files as artifacts.

## Validation
- Gradle configuration compiles both modules.
- Unit tests cover settings serialization and fallback behavior.
- Workflow paths are at repository root so GitHub Actions can detect them.
- APK artifacts are produced only after successful Gradle build.
