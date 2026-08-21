@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "DEST=%~dp0..\app\src\main\assets\rhwp-editor"
set "TMP=%RUNNER_TEMP%\rhwp-editor-vendor"
if "%RUNNER_TEMP%"=="" set "TMP=%TEMP%\rhwp-editor-vendor"
set "EDITOR_VERSION=0.8.4"
set "EDITOR_PACKAGE=@rhwp/editor@0.8.4"
set "EDITOR_TGZ_SHA256=5a4e7396d98fa3a54de469b1e8702c0fed4d05c7d0fe5e63c34f97e40e53c53c"
set "CORE_PACKAGE=@rhwp/core@0.8.4"
set "CORE_TGZ_SHA256=156e9cbcc7fa2443b087efaceb5615eccb91117d83695cbb653f8755ca994e1e"
set "STUDIO_COMMIT=496333b27d21ddb9114ba9ae340bcb895870c9a7"
set "NPM_CONFIG_STRICT_SSL=false"
set "RHWP_DISABLE_EXTERNAL_WEBFONTS=1"

if exist "!TMP!" rmdir /s /q "!TMP!"
mkdir "!TMP!" || exit /b 61
mkdir "!TMP!\editor" || exit /b 62
mkdir "!TMP!\core" || exit /b 63

call npm pack !EDITOR_PACKAGE! --pack-destination "!TMP!\editor" || exit /b 64
for %%F in ("!TMP!\editor\*.tgz") do set "EDITOR_TGZ=%%~fF"
if not defined EDITOR_TGZ exit /b 65
certutil -hashfile "!EDITOR_TGZ!" SHA256 | findstr /i "!EDITOR_TGZ_SHA256!" >nul || exit /b 66
tar -xzf "!EDITOR_TGZ!" -C "!TMP!\editor" || exit /b 67

call npm pack !CORE_PACKAGE! --pack-destination "!TMP!\core" || exit /b 68
for %%F in ("!TMP!\core\*.tgz") do set "CORE_TGZ=%%~fF"
if not defined CORE_TGZ exit /b 69
certutil -hashfile "!CORE_TGZ!" SHA256 | findstr /i "!CORE_TGZ_SHA256!" >nul || exit /b 70
tar -xzf "!CORE_TGZ!" -C "!TMP!\core" || exit /b 71

mkdir "!TMP!\source" || exit /b 72
git -C "!TMP!\source" init || exit /b 73
git -C "!TMP!\source" remote add origin https://github.com/edwardkim/rhwp.git || exit /b 74
git -C "!TMP!\source" config core.sparseCheckout true || exit /b 75
>"!TMP!\source\.git\info\sparse-checkout" echo /rhwp-studio/
git -C "!TMP!\source" fetch --depth 1 --filter=blob:none origin !STUDIO_COMMIT! || exit /b 76
git -C "!TMP!\source" checkout --detach FETCH_HEAD || exit /b 77
for /f "delims=" %%H in ('git -C "!TMP!\source" rev-parse HEAD') do set "FETCHED_COMMIT=%%H"
if /i not "!FETCHED_COMMIT!"=="!STUDIO_COMMIT!" exit /b 78

mkdir "!TMP!\source\pkg" || exit /b 79
xcopy /e /i /y "!TMP!\core\package\*" "!TMP!\source\pkg\" >nul || exit /b 80

pushd "!TMP!\source\rhwp-studio" || exit /b 81
call npm ci --no-audit --no-fund || (popd & exit /b 82)
set "RHWP_DISABLE_EXTERNAL_WEBFONTS=1"
call npx tsc || (popd & exit /b 83)
call npx vite build --base ./ || (popd & exit /b 84)
popd

if not exist "!TMP!\source\rhwp-studio\dist\index.html" exit /b 85
if not exist "!TMP!\editor\package\index.js" exit /b 86
if not exist "!TMP!\editor\package\transport.js" exit /b 87

if exist "!DEST!\sdk" rmdir /s /q "!DEST!\sdk"
if exist "!DEST!\studio" rmdir /s /q "!DEST!\studio"
mkdir "!DEST!\sdk" || exit /b 88
mkdir "!DEST!\studio" || exit /b 89
copy /y "!TMP!\editor\package\index.js" "!DEST!\sdk\index.js" >nul || exit /b 90
copy /y "!TMP!\editor\package\transport.js" "!DEST!\sdk\transport.js" >nul || exit /b 91
xcopy /e /i /y "!TMP!\source\rhwp-studio\dist\*" "!DEST!\studio\" >nul || exit /b 92

>"!DEST!\vendor-version.txt" echo editor=!EDITOR_VERSION!
>>"!DEST!\vendor-version.txt" echo editor_sha256=!EDITOR_TGZ_SHA256!
>>"!DEST!\vendor-version.txt" echo studio_commit=!STUDIO_COMMIT!

findstr /s /i /c:"https://fonts.googleapis.com" "!DEST!\studio\*" >nul && exit /b 93
findstr /s /i /c:"https://fonts.gstatic.com" "!DEST!\studio\*" >nul && exit /b 94

echo RHWP editor vendor complete: !EDITOR_VERSION! / !STUDIO_COMMIT!
exit /b 0
