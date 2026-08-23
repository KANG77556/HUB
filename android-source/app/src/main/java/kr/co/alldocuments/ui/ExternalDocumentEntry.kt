package kr.co.alldocuments.ui

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kr.co.alldocuments.ExternalOpenRequest
import kr.co.alldocuments.data.DocumentEditorRepository
import kr.co.alldocuments.domain.DocumentItem

@Composable
fun ExternalDocumentEntry(
    request: ExternalOpenRequest,
    onBack: () -> Unit,
    viewModel: DocumentViewModel = viewModel()
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val editorRepository = remember(context) { DocumentEditorRepository(context.contentResolver) }
    var selectedDocument by remember(request.id) { mutableStateOf<DocumentItem?>(null) }
    var pendingSaveAs by remember(request.id) { mutableStateOf<SaveAsRequest?>(null) }

    fun persistSaveAs(uri: Uri?) {
        val pending = pendingSaveAs
        if (uri == null || pending == null) {
            pendingSaveAs = null
            return
        }
        scope.launch {
            val result = withContext(Dispatchers.IO) {
                editorRepository.writeBytes(uri, pending.bytes)
            }
            if (result.isSuccess) {
                pendingSaveAs = null
                viewModel.addDocument(uri)?.let { selectedDocument = viewModel.openDocument(it) }
            }
        }
    }

    val textSaveAsLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("text/plain"),
        onResult = ::persistSaveAs
    )
    val hwpSaveAsLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/x-hwp"),
        onResult = ::persistSaveAs
    )
    val hwpxSaveAsLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/vnd.hancom.hwpx"),
        onResult = ::persistSaveAs
    )

    fun launchSaveAs(saveRequest: SaveAsRequest) {
        pendingSaveAs = saveRequest
        when (saveRequest.mimeType) {
            "application/x-hwp" -> hwpSaveAsLauncher.launch(saveRequest.fileName)
            "application/vnd.hancom.hwpx" -> hwpxSaveAsLauncher.launch(saveRequest.fileName)
            else -> textSaveAsLauncher.launch(saveRequest.fileName)
        }
    }

    LaunchedEffect(request.id) {
        selectedDocument = viewModel.addDocument(request.uri)?.let(viewModel::openDocument)
    }

    val item = selectedDocument
    if (item == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
    } else {
        EditableDocumentViewer(
            item = item,
            onBack = onBack,
            onSaveAsRequest = ::launchSaveAs
        )
    }
}
