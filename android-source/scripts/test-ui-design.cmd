@echo off
setlocal
set "APP=android-source\app\src\main\java\kr\co\alldocuments\ui\AllDocumentsApp.kt"
set "VIEWER=android-source\app\src\main\java\kr\co\alldocuments\ui\DocumentViewer.kt"
set "THEME=android-source\app\src\main\java\kr\co\alldocuments\ui\theme\Theme.kt"
set "HTML=android-source\app\src\main\assets\rhwp-viewer\index.html"

findstr /c:"private fun DocumentSearchBar" "%APP%" >nul || exit /b 11
findstr /c:"private fun DocumentTypeFilterRow" "%APP%" >nul || exit /b 12
findstr /c:"private fun DocumentListRow" "%APP%" >nul || exit /b 13
findstr /c:"private fun AddDocumentButton" "%APP%" >nul || exit /b 14
findstr /c:"private fun FileTypeBadge" "%APP%" >nul || exit /b 15
findstr /c:"private fun SectionHeader" "%APP%" >nul || exit /b 16
findstr /c:"BasicTextField" "%APP%" >nul || exit /b 17
findstr /c:"Color(0xFFF7F8FA)" "%THEME%" >nul || exit /b 18
findstr /c:"Color(0xFF2563EB)" "%THEME%" >nul || exit /b 19
findstr /c:"private fun BackChevron" "%VIEWER%" >nul || exit /b 20
findstr /c:"VIEWER_TOP_BAR_HEIGHT_DP = 48" "%VIEWER%" >nul || exit /b 21
findstr /c:"renderPageToCanvas" "%HTML%" >nul || exit /b 22
findstr /c:"ACTION_VIEW" "%VIEWER%" >nul && exit /b 23

echo Polished document browser UI contract passed
