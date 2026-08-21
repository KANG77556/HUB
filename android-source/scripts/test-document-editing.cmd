@echo off
setlocal
set "ROOT=%~dp0.."
set "SRC=%ROOT%\app\src\main\java\kr\co\alldocuments"
set "ASSETS=%ROOT%\app\src\main\assets\rhwp-editor"
set "PRWF=%~dp0..\..\.github\workflows\build-internal-viewer-selfhosted.yml"
set "MAINWF=%~dp0..\..\.github\workflows\build-all-documents-apk.yml"

if not exist "%SRC%\data\DocumentEditorRepository.kt" exit /b 101
if not exist "%SRC%\ui\TextDocumentEditor.kt" exit /b 102

findstr /c:"openOutputStream(uri, \"wt\")" "%SRC%\data\DocumentEditorRepository.kt" >nul || exit /b 103
findstr /c:"fun canWrite(uri: Uri): Boolean" "%SRC%\data\DocumentEditorRepository.kt" >nul || exit /b 104
findstr /c:"fun writeText(uri: Uri, text: String): Result<Unit>" "%SRC%\data\DocumentEditorRepository.kt" >nul || exit /b 105
findstr /c:"fun writeBytes(uri: Uri, bytes: ByteArray): Result<Unit>" "%SRC%\data\DocumentEditorRepository.kt" >nul || exit /b 106
findstr /c:"fun readBytes(uri: Uri, maxBytes: Int): Result<ByteArray>" "%SRC%\data\DocumentEditorRepository.kt" >nul || exit /b 107

findstr /c:"TextDocumentEditor" "%SRC%\ui\DocumentViewer.kt" >nul || exit /b 111
findstr /c:"EDIT_LABEL" "%SRC%\ui\DocumentViewer.kt" >nul || exit /b 112
findstr /c:"SAVE_LABEL" "%SRC%\ui\DocumentViewer.kt" >nul || exit /b 113
findstr /c:"CANCEL_LABEL" "%SRC%\ui\DocumentViewer.kt" >nul || exit /b 114
findstr /c:"SaveAsRequest" "%SRC%\ui\DocumentViewer.kt" >nul || exit /b 115
findstr /c:"ActivityResultContracts.CreateDocument" "%SRC%\ui\AllDocumentsApp.kt" >nul || exit /b 116
findstr /c:"Intent.FLAG_GRANT_WRITE_URI_PERMISSION" "%SRC%\ui\DocumentViewModel.kt" >nul || exit /b 117

if not exist "%ASSETS%\index.html" exit /b 131
if not exist "%ASSETS%\host.js" exit /b 132
if not exist "%SRC%\ui\RhwpEditorWebView.kt" exit /b 133
if not exist "%SRC%\ui\EditableDocumentViewer.kt" exit /b 145
findstr /c:"assets/rhwp-editor/index.html" "%SRC%\ui\RhwpEditorWebView.kt" >nul || exit /b 134
findstr /c:"settings.allowFileAccess = false" "%SRC%\ui\RhwpEditorWebView.kt" >nul || exit /b 135
findstr /c:"settings.allowContentAccess = false" "%SRC%\ui\RhwpEditorWebView.kt" >nul || exit /b 136
findstr /c:"settings.allowUniversalAccessFromFileURLs = false" "%SRC%\ui\RhwpEditorWebView.kt" >nul || exit /b 137
findstr /c:"MAX_RHWP_EDITOR_BYTES" "%SRC%\ui\RhwpEditorWebView.kt" >nul || exit /b 138
findstr /c:"exportHwp" "%ASSETS%\host.js" >nul || exit /b 139
findstr /c:"exportHwpx" "%ASSETS%\host.js" >nul || exit /b 140
findstr /c:"EditableDocumentViewer" "%SRC%\ui\AllDocumentsApp.kt" >nul || exit /b 146
findstr /c:"RhwpEditorWebView" "%SRC%\ui\EditableDocumentViewer.kt" >nul || exit /b 147
findstr /c:"@rhwp/editor@0.8.4" "%PRWF%" >nul || exit /b 141
findstr /c:"RHWP_DISABLE_EXTERNAL_WEBFONTS=1" "%PRWF%" >nul || exit /b 142
findstr /c:"@rhwp/editor@0.8.4" "%MAINWF%" >nul || exit /b 143
findstr /c:"RHWP_DISABLE_EXTERNAL_WEBFONTS=1" "%MAINWF%" >nul || exit /b 144

findstr /s /i /c:"ACTION_VIEW" "%SRC%\*.kt" >nul && exit /b 121

echo Document editing contract passed
exit /b 0
