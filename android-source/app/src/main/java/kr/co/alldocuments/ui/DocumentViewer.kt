package kr.co.alldocuments.ui

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kr.co.alldocuments.domain.DocumentItem
import kr.co.alldocuments.domain.DocumentMimeResolver
import kr.co.alldocuments.domain.DocumentViewerStrategy
import kr.co.alldocuments.domain.ViewerKind

private sealed interface ViewerState {
    data object Loading : ViewerState
    data class Pdf(val pages: List<Bitmap>) : ViewerState
    data class ImageContent(val bitmap: Bitmap) : ViewerState
    data class TextContent(val text: String) : ViewerState
    data class Error(val message: String) : ViewerState
}

@Composable
fun DocumentViewer(item: DocumentItem, onBack: () -> Unit) {
    val context = LocalContext.current
    var state by remember(item.uri) { mutableStateOf<ViewerState>(ViewerState.Loading) }
    val kind = remember(item.name, item.mimeType) { DocumentViewerStrategy.resolve(item.name, item.mimeType) }

    LaunchedEffect(item.uri, kind) {
        state = if (kind == ViewerKind.UNSUPPORTED) {
            ViewerState.Error("이 형식은 앱 내부에서 원본 레이아웃을 정확하게 표시할 수 없습니다.")
        } else {
            withContext(Dispatchers.IO) {
                runCatching { loadDocument(context.contentResolver, Uri.parse(item.uri), kind) }
                    .getOrElse { ViewerState.Error("문서를 읽을 수 없습니다: ${it.message ?: "알 수 없는 오류"}") }
            }
        }
    }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Button(onClick = onBack) { Text("뒤로") }
            Button(onClick = { openExternally(context, item) }) { Text("외부 앱으로 열기") }
        }
        Text(item.name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        when (val current = state) {
            ViewerState.Loading -> CircularProgressIndicator()
            is ViewerState.Error -> Text(current.message)
            is ViewerState.TextContent -> LazyColumn(modifier = Modifier.fillMaxSize()) {
                item { Text(current.text) }
            }
            is ViewerState.ImageContent -> Image(
                bitmap = current.bitmap.asImageBitmap(),
                contentDescription = item.name,
                modifier = Modifier.fillMaxWidth(),
                contentScale = ContentScale.Fit
            )
            is ViewerState.Pdf -> LazyColumn(modifier = Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                itemsIndexed(current.pages) { index, bitmap ->
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("${index + 1} / ${current.pages.size}", style = MaterialTheme.typography.labelMedium)
                        Image(
                            bitmap = bitmap.asImageBitmap(),
                            contentDescription = "${item.name} ${index + 1}페이지",
                            modifier = Modifier.fillMaxWidth(),
                            contentScale = ContentScale.Fit
                        )
                    }
                }
            }
        }
    }
}

private fun loadDocument(resolver: android.content.ContentResolver, uri: Uri, kind: ViewerKind): ViewerState = when (kind) {
    ViewerKind.PDF -> {
        val descriptor = resolver.openFileDescriptor(uri, "r") ?: error("파일을 열 수 없습니다.")
        descriptor.use { pfd ->
            PdfRenderer(pfd).use { renderer ->
                val pages = ArrayList<Bitmap>(renderer.pageCount)
                for (index in 0 until renderer.pageCount) {
                    renderer.openPage(index).use { page ->
                        val width = (page.width * 1.5f).toInt().coerceAtLeast(1)
                        val height = (page.height * 1.5f).toInt().coerceAtLeast(1)
                        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                        bitmap.eraseColor(android.graphics.Color.WHITE)
                        page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                        pages += bitmap
                    }
                }
                ViewerState.Pdf(pages)
            }
        }
    }
    ViewerKind.IMAGE -> resolver.openInputStream(uri)?.use { stream ->
        BitmapFactory.decodeStream(stream)?.let { ViewerState.ImageContent(it) }
            ?: error("이미지를 해석할 수 없습니다.")
    } ?: error("이미지 파일을 열 수 없습니다.")
    ViewerKind.TEXT -> resolver.openInputStream(uri)?.bufferedReader(Charsets.UTF_8)?.use { reader ->
        val maxChars = 2_000_000
        val buffer = CharArray(8192)
        val output = StringBuilder()
        while (output.length < maxChars) {
            val read = reader.read(buffer, 0, minOf(buffer.size, maxChars - output.length))
            if (read < 0) break
            output.append(buffer, 0, read)
        }
        if (output.length == maxChars) output.append("\n\n[문서가 커서 앞부분만 표시했습니다.]")
        ViewerState.TextContent(output.toString())
    } ?: error("텍스트 파일을 열 수 없습니다.")
    ViewerKind.UNSUPPORTED -> ViewerState.Error("지원하지 않는 내부 뷰어 형식입니다.")
}

private fun openExternally(context: android.content.Context, item: DocumentItem) {
    val uri = Uri.parse(item.uri)
    val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, DocumentMimeResolver.resolve(item.name, item.mimeType))
        clipData = ClipData.newRawUri(item.name, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    try {
        context.startActivity(Intent.createChooser(intent, "외부 앱으로 열기").apply {
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        })
    } catch (_: ActivityNotFoundException) {
        // The in-app unsupported/error message remains visible.
    }
}
