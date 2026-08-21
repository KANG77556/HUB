@echo off
setlocal
set "ROOT=%~dp0.."
set "SRC=%ROOT%\app\src\main\java\kr\co\alldocuments"

if not exist "%SRC%\data\DocumentEditorRepository.kt" exit /b 101
if not exist "%SRC%\ui\TextDocumentEditor.kt" exit /b 102

findstr /c:"openOutputStream(uri, \"wt\")" "%SRC%\data\DocumentEditorRepository.kt" >nul || exit /b 103
findstr /c:"fun canWrite(uri: Uri): Boolean" "%SRC%\data\DocumentEditorRepository.kt" >nul || exit /b 104
findstr /c:"fun writeText(uri: Uri, text: String): Result<Unit>" "%SRC%\data\DocumentEditorRepository.kt" >nul || exit /b 105
findstr /c:"fun writeBytes(uri: Uri, bytes: ByteArray): Result<Unit>" "%SRC%\data\DocumentEditorRepository.kt" >nul || exit /b 106
findstr /c:"fun readBytes(uri: Uri, maxBytes: Int): Result<ByteArray>" "%SRC%\data\DocumentEditorRepository.kt" >nul || exit /b 107

findstr /c:"TextDocumentEditor" "%SRC%\ui\DocumentViewer.kt" >nul || exit /b 111
findstr /c:"\"편집\"" "%SRC%\ui\DocumentViewer.kt" >nul || exit /b 112
findstr /c:"\"저장\"" "%SRC%\ui\DocumentViewer.kt" >nul || exit /b 113
findstr /c:"\"취소\"" "%SRC%\ui\DocumentViewer.kt" >nul || exit /b 114
findstr /c:"SaveAsRequest" "%SRC%\ui\DocumentViewer.kt" >nul || exit /b 115
findstr /c:"ActivityResultContracts.CreateDocument" "%SRC%\ui\AllDocumentsApp.kt" >nul || exit /b 116
findstr /c:"Intent.FLAG_GRANT_WRITE_URI_PERMISSION" "%SRC%\ui\DocumentViewModel.kt" >nul || exit /b 117

findstr /s /i /c:"ACTION_VIEW" "%SRC%\*.kt" >nul && exit /b 121

echo Document editing contract passed
exit /b 0
