@echo off
setlocal
set "MANIFEST=android-source\app\src\main\AndroidManifest.xml"
set "VIEWER=android-source\app\src\main\java\kr\co\alldocuments\ui\DocumentViewer.kt"
set "OFFICE=android-source\app\src\main\java\kr\co\alldocuments\ui\InternalOfficePreview.kt"
set "GRADLE=android-source\app\build.gradle.kts"
set "WF=.github\workflows\build-internal-viewer-selfhosted.yml"

findstr /c:"android:allowBackup=\"false\"" "%MANIFEST%" >nul || exit /b 11
findstr /c:"android:usesCleartextTraffic=\"false\"" "%MANIFEST%" >nul || exit /b 12
findstr /c:"MIXED_CONTENT_NEVER_ALLOW" "%VIEWER%" >nul || exit /b 13
findstr /c:"blockNetworkLoads = true" "%VIEWER%" >nul || exit /b 14
findstr /c:"allowFileAccessFromFileURLs = false" "%VIEWER%" >nul || exit /b 15
findstr /c:"allowUniversalAccessFromFileURLs = false" "%VIEWER%" >nul || exit /b 16
findstr /c:"SAFE_WEBVIEW_ORIGIN" "%VIEWER%" >nul || exit /b 17
findstr /c:"MAX_OFFICE_UNCOMPRESSED_BYTES" "%OFFICE%" >nul || exit /b 18
findstr /c:"MAX_OFFICE_ENTRY_BYTES" "%OFFICE%" >nul || exit /b 19
findstr /c:"readLimitedBytes" "%OFFICE%" >nul || exit /b 20
findstr /c:"MAX_TEXT_BYTES" "%VIEWER%" >nul || exit /b 21
findstr /c:"MAX_IMAGE_BYTES" "%VIEWER%" >nul || exit /b 22
findstr /c:"MAX_PDF_PAGES" "%VIEWER%" >nul || exit /b 23
findstr /c:"versionName = \"1.1.0\"" "%GRADLE%" >nul || exit /b 24
findstr /c:"applicationId = \"kr.co.alldocuments\"" "%GRADLE%" >nul || exit /b 25
findstr /c:"NPM_CONFIG_STRICT_SSL=false" "%WF%" >nul && exit /b 26
findstr /c:"@rhwp/core@0.8.4" "%WF%" >nul || exit /b 27
findstr /c:"RHWP_TGZ_SHA512" "%WF%" >nul || exit /b 28

echo Security hardening contract passed
exit /b 0
