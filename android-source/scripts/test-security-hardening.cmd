@echo off
setlocal
set "MANIFEST=android-source\app\src\main\AndroidManifest.xml"
set "VIEWER=android-source\app\src\main\java\kr\co\alldocuments\ui\DocumentViewer.kt"
set "OFFICE=android-source\app\src\main\java\kr\co\alldocuments\ui\InternalOfficePreview.kt"
set "HTML=android-source\app\src\main\assets\rhwp-viewer\index.html"
set "GRADLE=android-source\app\build.gradle.kts"
set "PRWF=.github\workflows\build-internal-viewer-selfhosted.yml"
set "MAINWF=.github\workflows\build-all-documents-apk.yml"

findstr /c:"android:allowBackup=\"false\"" "%MANIFEST%" >nul || exit /b 11
findstr /c:"android:usesCleartextTraffic=\"false\"" "%MANIFEST%" >nul || exit /b 12
findstr /c:"android:icon=\"@mipmap/ic_launcher\"" "%MANIFEST%" >nul || exit /b 13
findstr /c:"MIXED_CONTENT_NEVER_ALLOW" "%VIEWER%" >nul || exit /b 14
findstr /c:"allowFileAccessFromFileURLs = false" "%VIEWER%" >nul || exit /b 15
findstr /c:"allowUniversalAccessFromFileURLs = false" "%VIEWER%" >nul || exit /b 16
findstr /c:"SAFE_WEBVIEW_ORIGIN" "%VIEWER%" >nul || exit /b 17
findstr /c:"shouldOverrideUrlLoading" "%VIEWER%" >nul || exit /b 18
findstr /c:"blockedWebResponse" "%VIEWER%" >nul || exit /b 19
findstr /c:"MAX_OFFICE_UNCOMPRESSED_BYTES" "%OFFICE%" >nul || exit /b 20
findstr /c:"MAX_OFFICE_ENTRY_BYTES" "%OFFICE%" >nul || exit /b 21
findstr /c:"readLimitedBytes" "%OFFICE%" >nul || exit /b 22
findstr /c:"FEATURE_SECURE_PROCESSING" "%OFFICE%" >nul || exit /b 23
findstr /c:"MAX_TEXT_BYTES" "%VIEWER%" >nul || exit /b 24
findstr /c:"MAX_IMAGE_BYTES" "%VIEWER%" >nul || exit /b 25
findstr /c:"MAX_PDF_PAGES" "%VIEWER%" >nul || exit /b 26
findstr /c:"MAX_PDF_TOTAL_PIXELS" "%VIEWER%" >nul || exit /b 27
findstr /c:"MAX_RHWP_PAGES" "%HTML%" >nul || exit /b 28
findstr /c:"BACKING_SCALE=1.5" "%HTML%" >nul || exit /b 29
findstr /c:"versionName = \"1.1.0\"" "%GRADLE%" >nul || exit /b 30
findstr /c:"signingConfigs" "%GRADLE%" >nul || exit /b 31
findstr /c:"ALLDOC_KEYSTORE_PATH" "%GRADLE%" >nul || exit /b 32
findstr /c:"@rhwp/core@0.8.4" "%PRWF%" >nul || exit /b 33
findstr /c:"RHWP_TGZ_SHA1" "%PRWF%" >nul || exit /b 34
findstr /c:"certutil -hashfile" "%PRWF%" >nul || exit /b 35
findstr /c:"assembleRelease" "%MAINWF%" >nul || exit /b 36
findstr /c:"apksigner" "%MAINWF%" >nul || exit /b 37
findstr /c:"all-documents-release.apk" "%MAINWF%" >nul || exit /b 38
findstr /c:"Prepare persistent release signing key" "%MAINWF%" >nul || exit /b 39

if not exist android-source\app\src\main\res\drawable\ic_launcher_foreground.xml exit /b 40
if not exist android-source\app\src\main\res\mipmap-anydpi-v26\ic_launcher.xml exit /b 41

echo Security hardening contract passed
exit /b 0
