# Mobile + Wear Companion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build phone and Wear OS application modules that configure and render the approved premium black/rose-gold watch face.

**Architecture:** Replace the current single `app` module with focused `mobile` and `wear` application modules. The mobile app owns preview/configuration UI; Wear OS owns WFF resources and local rendering. Wearable Data Layer transfers a small versioned configuration payload.

**Tech Stack:** Kotlin, Android Gradle Plugin 8.7.3, compileSdk 35, minSdk 26 mobile, minSdk 30 wear, AndroidX, Google Play Services Wearable, Watch Face Format.

## Global Constraints
- Keep package namespace under `com.kang77556.premiumwatchface`.
- Wear OS minSdk remains 30.
- Phone and watch must continue working independently after configuration is stored.
- GitHub Actions workflow must live at repository root `.github/workflows/`.

---

### Task 1: Convert project to two modules

**Files:**
- Modify: `settings.gradle.kts`
- Create: `mobile/build.gradle.kts`
- Create: `wear/build.gradle.kts`
- Move/adapt: existing watch resources from `app/src/main` to `wear/src/main`

**Interfaces:**
- Produces Gradle modules `:mobile` and `:wear`.

- [ ] Update `settings.gradle.kts` to include `:mobile` and `:wear` and remove `:app`.
- [ ] Configure mobile application id `com.kang77556.premiumwatchface.mobile`, minSdk 26, targetSdk 35.
- [ ] Configure wear application id `com.kang77556.premiumwatchface.wear`, minSdk 30, targetSdk 35.
- [ ] Run `./gradlew :mobile:tasks :wear:tasks` and require exit code 0.
- [ ] Commit with `refactor: split phone and wear modules`.

### Task 2: Add versioned shared configuration contract

**Files:**
- Create: `mobile/src/main/java/com/kang77556/premiumwatchface/mobile/WatchConfig.kt`
- Create: `wear/src/main/java/com/kang77556/premiumwatchface/wear/WatchConfig.kt`
- Test: matching `WatchConfigTest.kt` in both modules.

**Interfaces:**
- Produces fields `version:Int`, `style:String`, `aod:Boolean` and Data Layer path `/watchface/config`.

- [ ] Write tests asserting default config is version 1, style `rose_gold_black`, AOD true.
- [ ] Run module unit tests and verify they fail before implementation.
- [ ] Implement immutable config model and constants.
- [ ] Run unit tests and require PASS.
- [ ] Commit with `feat: add watch configuration contract`.

### Task 3: Build phone companion screen

**Files:**
- Create: `mobile/src/main/AndroidManifest.xml`
- Create: `mobile/src/main/java/com/kang77556/premiumwatchface/mobile/MainActivity.kt`
- Create: `mobile/src/main/res/layout/activity_main.xml`
- Create: `mobile/src/main/res/values/strings.xml`

**Interfaces:**
- Consumes `WatchConfig`.
- Produces an Apply action and local preference keys `style` and `aod`.

- [ ] Create a phone launcher activity with watch preview, style label, AOD switch, connection status, and Apply button.
- [ ] Persist selected config with SharedPreferences.
- [ ] Add accessible content descriptions and visible error/status text.
- [ ] Run `./gradlew :mobile:assembleDebug` and require PASS.
- [ ] Commit with `feat: add phone watchface companion UI`.

### Task 4: Add phone-to-watch Data Layer transport

**Files:**
- Create: `mobile/src/main/java/com/kang77556/premiumwatchface/mobile/WatchConfigSender.kt`
- Test: `mobile/src/test/java/com/kang77556/premiumwatchface/mobile/WatchConfigSenderTest.kt`

**Interfaces:**
- `suspend fun send(config: WatchConfig): Result<Unit>`.
- Sends DataItem path `/watchface/config` with keys `version`, `style`, `aod`.

- [ ] Write test for exact DataItem path and keys.
- [ ] Implement sender using `Wearable.getDataClient(context).putDataItem(...)`.
- [ ] Connect MainActivity Apply button to sender and status output.
- [ ] Run mobile tests and assembleDebug.
- [ ] Commit with `feat: send watch settings from phone`.

### Task 5: Add Wear OS receiver and local fallback

**Files:**
- Create: `wear/src/main/java/com/kang77556/premiumwatchface/wear/ConfigListenerService.kt`
- Create: `wear/src/main/AndroidManifest.xml`
- Test: `wear/src/test/java/com/kang77556/premiumwatchface/wear/ConfigPersistenceTest.kt`

**Interfaces:**
- Consumes `/watchface/config` DataItems.
- Persists version/style/AOD to SharedPreferences.

- [ ] Write test proving missing phone data falls back to `rose_gold_black` and AOD true.
- [ ] Implement WearableListenerService filtered to `/watchface/config`.
- [ ] Persist only supported version 1 payloads.
- [ ] Run wear unit tests.
- [ ] Commit with `feat: receive watch settings on wear`.

### Task 6: Stabilize WFF watch face resources

**Files:**
- Create/modify: `wear/src/main/res/xml/watch_face_info.xml`
- Create: required drawable resources for hour, minute and second hands.

**Interfaces:**
- Reads locally persisted style/AOD where WFF integration permits; unsupported dynamic options fall back safely to the approved default design.

- [ ] Keep black/rose-gold design as default and ensure every referenced drawable exists.
- [ ] Keep time/date rendering independent of Data Layer availability.
- [ ] Add AOD-safe reduced rendering.
- [ ] Run Android resource processing and `:wear:assembleDebug`.
- [ ] Commit with `fix: stabilize premium wear watch face`.

### Task 7: Fix repository-root GitHub Actions and verify APK artifacts

**Files:**
- Create: `/.github/workflows/build-watchface.yml`
- Remove: `wearos-navitimer-watchface/.github/workflows/build-apk.yml`

**Interfaces:**
- Produces artifacts `premium-watchface-mobile-apk` and `premium-watchface-wear-apk`.

- [ ] Configure checkout, JDK 17, Gradle setup, and builds from `wearos-navitimer-watchface`.
- [ ] Run `./gradlew test :mobile:assembleDebug :wear:assembleDebug`.
- [ ] Upload `mobile/build/outputs/apk/debug/mobile-debug.apk` and `wear/build/outputs/apk/debug/wear-debug.apk` separately.
- [ ] Confirm GitHub recognizes a workflow run on the branch.
- [ ] Confirm successful jobs and both artifacts exist before reporting completion.
- [ ] Commit with `ci: build phone and wear APK artifacts`.
