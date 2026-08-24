@echo off
setlocal
set "ROOT=%~dp0.."
set "MANIFEST=%ROOT%\app\src\main\AndroidManifest.xml"
set "MAIN=%ROOT%\app\src\main\java\kr\co\alldocuments\MainActivity.kt"
set "ENTRY=%ROOT%\app\src\main\java\kr\co\alldocuments\ui\ExternalDocumentEntry.kt"
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
findstr /c:"grantFlags" "%MAIN%" >nul || exit /b 114
findstr /c:"Intent.FLAG_GRANT_READ_URI_PERMISSION" "%MAIN%" >nul || exit /b 115
findstr /c:"intent.flags" "%MAIN%" >nul || exit /b 116
if not exist "%ENTRY%" exit /b 117
findstr /c:"LaunchedEffect(request.id)" "%ENTRY%" >nul || exit /b 118
findstr /c:"viewModel.addDocument(request.uri)" "%ENTRY%" >nul || exit /b 119
findstr /c:"EditableDocumentViewer" "%ENTRY%" >nul || exit /b 120
findstr /c:"ActivityResultContracts.OpenDocument()" "%ENTRY%" >nul || exit /b 121
findstr /c:"request.grantFlags" "%ENTRY%" >nul || exit /b 122
findstr /c:"takePersistableUriPermission" "%ENTRY%" >nul || exit /b 123
findstr /c:"SecurityException" "%ENTRY%" >nul || exit /b 124
findstr /c:"permissionPicker.launch" "%ENTRY%" >nul || exit /b 125
findstr /c:"canReadExternalUri" "%ENTRY%" >nul && exit /b 126

findstr /c:"extension in setOf(\"docx\", \"xlsx\", \"pptx\")" "%STRATEGY%" >nul || exit /b 131
findstr /c:"\"pptx\" ->" "%OFFICE%" >nul || exit /b 132
findstr /i /c:"Intent.ACTION_VIEW" "%VIEWER%" >nul && exit /b 133

echo Open-with document grant contract passed
exit /b 0
