@echo off
setlocal
set "ROOT=%~dp0.."
set "MANIFEST=%ROOT%\app\src\main\AndroidManifest.xml"
set "MAIN=%ROOT%\app\src\main\java\kr\co\alldocuments\MainActivity.kt"
set "APP=%ROOT%\app\src\main\java\kr\co\alldocuments\ui\AllDocumentsApp.kt"
set "STRATEGY=%ROOT%\app\src\main\java\kr\co\alldocuments\domain\DocumentViewerStrategy.kt"
set "OFFICE=%ROOT%\app\src\main\java\kr\co\alldocuments\ui\InternalOfficePreview.kt"
set "VIEWER=%ROOT%\app\src\main\java\kr\co\alldocuments\ui\DocumentViewer.kt"

findstr /c:"android.intent.action.VIEW" "%MANIFEST%" >nul || exit /b 101
findstr /c:"android.intent.category.DEFAULT" "%MANIFEST%" >nul || exit /b 102
findstr /c:"application/vnd.openxmlformats-officedocument.presentationml.presentation" "%MANIFEST%" >nul || exit /b 103
findstr /c:"application/pdf" "%MANIFEST%" >nul || exit /b 104
findstr /c:"application/x-hwp" "%MANIFEST%" >nul || exit /b 105
findstr /c:"text/*" "%MANIFEST%" >nul || exit /b 106
findstr /c:"image/*" "%MANIFEST%" >nul || exit /b 107

findstr /c:"Intent.ACTION_VIEW" "%MAIN%" >nul || exit /b 111
findstr /c:"onNewIntent" "%MAIN%" >nul || exit /b 112
findstr /c:"ExternalOpenRequest" "%MAIN%" >nul || exit /b 113
findstr /c:"externalOpenRequest" "%APP%" >nul || exit /b 114
findstr /c:"LaunchedEffect(externalOpenRequest" "%APP%" >nul || exit /b 115
findstr /c:"viewModel.addDocument(uri)" "%APP%" >nul || exit /b 116

findstr /c:"extension in setOf(\"docx\", \"xlsx\", \"pptx\")" "%STRATEGY%" >nul || exit /b 121
findstr /c:"\"pptx\" ->" "%OFFICE%" >nul || exit /b 122
findstr /i /c:"Intent.ACTION_VIEW" "%VIEWER%" >nul && exit /b 123

echo Open-with document contract passed
exit /b 0
