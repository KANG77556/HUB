package kr.co.alldocuments.ui

import android.net.Uri
import android.util.Base64
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kr.co.alldocuments.data.DocumentEditorRepository
import kr.co.alldocuments.domain.DocumentItem
import kr.co.alldocuments.domain.DocumentViewerStrategy
import kr.co.alldocuments.domain.ViewerKind

private const val RHWP_EDITOR_TOP_BAR_HEIGHT_DP = 48

@Composable
internal fun EditableDocumentViewer(
    item: DocumentItem,
    onBack: () -> Unit,
    onSaveAsRequest: (SaveAsRequest) -> Unit
) {
    val kind = remember(item.name, item.mimeType) {
        DocumentViewerStrategy.resolve(item.name, item.mimeType)
    }
    if (kind != ViewerKind.RHWP) {
        DocumentViewer(item = item, onBack = onBack, onSaveAsRequest = onSaveAsRequest)
        return
    }

    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val repository = remember(context) { DocumentEditorRepository(context.contentResolver) }
    val controller = remember(item.uri) { RhwpEditorController() }
    var editMode by remember(item.uri) { mutableStateOf(false) }
    var editorBase64 by remember(item.uri) { mutableStateOf<String?>(null) }
    var loadingEditor by remember(item.uri) { mutableStateOf(false) }
    var saving by remember(item.uri) { mutableStateOf(false) }
    var error by remember(item.uri) { mutableStateOf<String?>(null) }

    fun beginEdit() {
        if (loadingEditor || editMode) return
        loadingEditor = true
        error = null
        scope.launch {
            val result = withContext(Dispatchers.IO) {
                repository.readBytes(Uri.parse(item.uri), MAX_RHWP_EDITOR_BYTES)
            }
            result.onSuccess { bytes ->
                editorBase64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                editMode = true
            }.onFailure {
                error = "편집용 문서를 읽을 수 없습니다. ${it.message.orEmpty()}"
            }
            loadingEditor = false
        }
    }

    fun saveEditedDocument() {
        if (saving) return
        saving = true
        error = null
        val format = if (item.name.endsWith(".hwpx", ignoreCase = true)) "hwpx" else "hwp"
        controller.export(format) { exportResult ->
            exportResult.onFailure {
                saving = false
                error = "편집 결과를 만들 수 없습니다. ${it.message.orEmpty()}"
            }.onSuccess { bytes ->
                scope.launch {
                    val uri = Uri.parse(item.uri)
                    val writable = withContext(Dispatchers.IO) { repository.canWrite(uri) }
                    val writeResult = if (writable) {
                        withContext(Dispatchers.IO) { repository.writeBytes(uri, bytes) }
                    } else {
                        Result.failure(IllegalStateException("원본 문서가 읽기 전용입니다."))
                    }
                    if (writeResult.isSuccess) {
                        controller.notifySaved(item.name)
                        saving = false
                        editMode = false
                        editorBase64 = null
                    } else {
                        saving = false
                        error = "원본에 저장할 수 없어 다른 이름으로 저장합니다."
                        onSaveAsRequest(
                            SaveAsRequest(
                                fileName = ensureRhwpExtension(item.name, format),
                                mimeType = if (format == "hwpx") {
                                    "application/vnd.hancom.hwpx"
                                } else {
                                    "application/x-hwp"
                                },
                                bytes = bytes
                            )
                        )
                    }
                }
            }
        }
    }

    if (!editMode) {
        Box(Modifier.fillMaxSize()) {
            DocumentViewer(item = item, onBack = onBack, onSaveAsRequest = onSaveAsRequest)
            Surface(
                modifier = Modifier.align(Alignment.TopEnd).height(RHWP_EDITOR_TOP_BAR_HEIGHT_DP.dp),
                color = MaterialTheme.colorScheme.surface
            ) {
                TextButton(
                    onClick = ::beginEdit,
                    enabled = !loadingEditor,
                    modifier = Modifier.padding(end = 4.dp)
                ) {
                    if (loadingEditor) {
                        CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.height(18.dp))
                    } else {
                        Text("편집")
                    }
                }
            }
            if (error != null) {
                Text(
                    text = error.orEmpty(),
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .fillMaxWidth()
                        .background(MaterialTheme.colorScheme.errorContainer)
                        .padding(12.dp),
                    color = MaterialTheme.colorScheme.onErrorContainer,
                    style = MaterialTheme.typography.bodySmall
                )
            }
        }
        return
    }

    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Surface(
            modifier = Modifier.fillMaxWidth().height(RHWP_EDITOR_TOP_BAR_HEIGHT_DP.dp),
            color = MaterialTheme.colorScheme.surface
        ) {
            androidx.compose.foundation.layout.Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                TextButton(onClick = { if (!saving) editMode = false }, enabled = !saving) {
                    Text("취소")
                }
                Text(
                    item.name,
                    modifier = Modifier.weight(1f).padding(horizontal = 4.dp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    fontWeight = FontWeight.Medium
                )
                TextButton(onClick = ::saveEditedDocument, enabled = !saving) {
                    Text(if (saving) "저장 중…" else "저장")
                }
            }
        }
        if (error != null) {
            Text(
                text = error.orEmpty(),
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.errorContainer)
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                color = MaterialTheme.colorScheme.onErrorContainer,
                style = MaterialTheme.typography.bodySmall
            )
        }
        val base64 = editorBase64
        if (base64 == null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(strokeWidth = 2.5.dp)
            }
        } else {
            RhwpEditorWebView(
                base64 = base64,
                fileName = item.name,
                controller = controller,
                onError = { error = it },
                modifier = Modifier.fillMaxSize()
            )
        }
    }
}

private fun ensureRhwpExtension(name: String, format: String): String {
    val extension = if (format == "hwpx") ".hwpx" else ".hwp"
    return if (name.endsWith(extension, ignoreCase = true)) name else name.substringBeforeLast('.', name) + extension
}
