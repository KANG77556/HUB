package kr.co.alldocuments.ui

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.util.Base64
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.webkit.WebViewAssetLoader
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kr.co.alldocuments.domain.DocumentItem
import kr.co.alldocuments.domain.DocumentViewerStrategy
import kr.co.alldocuments.domain.ViewerKind

private const val VIEWER_TOP_BAR_HEIGHT_DP = 48

private sealed interface ViewerState {
    data object Loading : ViewerState
    data class Pdf(val pages: List<Bitmap>) : ViewerState
    data class ImageContent(val bitmap: Bitmap) : ViewerState
    data class TextContent(val text: String) : ViewerState
    data class Rhwp(val base64: String) : ViewerState
    data class Office(val preview: OfficePreview) : ViewerState
    data class Error(val message: String) : ViewerState
}

@Composable
fun DocumentViewer(item: DocumentItem, onBack: () -> Unit) {
    val context = LocalContext.current
    val kind = remember(item.name, item.mimeType) { DocumentViewerStrategy.resolve(item.name, item.mimeType) }
    var state by remember(item.uri) { mutableStateOf<ViewerState>(ViewerState.Loading) }

    LaunchedEffect(item.uri, kind) {
        state = withContext(Dispatchers.IO) {
            runCatching { loadDocument(context.contentResolver, Uri.parse(item.uri), item.name, kind) }
                .getOrElse { ViewerState.Error("문서를 읽을 수 없습니다.\n${it.message ?: "알 수 없는 오류"}") }
        }
    }

    Column(Modifier.fillMaxSize().background(Color(0xFFE9EBEF))) {
        ViewerTopBar(fileName = item.name, onBack = onBack)
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant, thickness = 1.dp)
        Box(
            Modifier.fillMaxSize().background(Color(0xFFE9EBEF)),
            contentAlignment = Alignment.Center
        ) {
            when (val current = state) {
                ViewerState.Loading -> CircularProgressIndicator(strokeWidth = 2.5.dp)
                is ViewerState.Error -> Text(current.message, Modifier.padding(20.dp))
                is ViewerState.TextContent -> LazyColumn(
                    Modifier.fillMaxSize().background(Color.White).padding(horizontal = 18.dp, vertical = 16.dp)
                ) { item { Text(current.text, style = MaterialTheme.typography.bodyMedium) } }
                is ViewerState.ImageContent -> Image(
                    current.bitmap.asImageBitmap(),
                    item.name,
                    Modifier.fillMaxSize().padding(6.dp),
                    contentScale = ContentScale.Fit
                )
                is ViewerState.Rhwp -> RhwpWebView(current.base64)
                is ViewerState.Office -> InternalOfficePreview(current.preview)
                is ViewerState.Pdf -> LazyColumn(
                    Modifier.fillMaxSize().padding(horizontal = 4.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    itemsIndexed(current.pages) { index, bitmap ->
                        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                "${index + 1} / ${current.pages.size}",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(vertical = 3.dp)
                            )
                            Image(
                                bitmap.asImageBitmap(),
                                "${index + 1}페이지",
                                Modifier.fillMaxWidth().background(Color.White),
                                contentScale = ContentScale.Fit
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ViewerTopBar(fileName: String, onBack: () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.surface, shadowElevation = 0.dp) {
        Row(
            Modifier.fillMaxWidth().height(VIEWER_TOP_BAR_HEIGHT_DP.dp).padding(horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onBack, modifier = Modifier.size(44.dp)) {
                BackChevron()
            }
            Text(
                fileName,
                modifier = Modifier.weight(1f).padding(start = 2.dp, end = 12.dp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSurface
            )
        }
    }
}

@Composable
private fun BackChevron() {
    Canvas(
        modifier = Modifier.size(22.dp).semantics { contentDescription = "뒤로" }
    ) {
        val stroke = 2.dp.toPx()
        val xRight = size.width * 0.64f
        val xLeft = size.width * 0.36f
        val yTop = size.height * 0.25f
        val yMid = size.height * 0.5f
        val yBottom = size.height * 0.75f
        drawLine(
            color = Color(0xFF374151),
            start = Offset(xRight, yTop),
            end = Offset(xLeft, yMid),
            strokeWidth = stroke,
            cap = StrokeCap.Round
        )
        drawLine(
            color = Color(0xFF374151),
            start = Offset(xLeft, yMid),
            end = Offset(xRight, yBottom),
            strokeWidth = stroke,
            cap = StrokeCap.Round
        )
    }
}

@Composable
private fun RhwpWebView(base64: String) {
    AndroidView(modifier = Modifier.fillMaxSize(), factory = { context ->
        val loader = WebViewAssetLoader.Builder().addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context)).build()
        WebView(context).apply {
            settings.javaScriptEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.setSupportZoom(true)
            settings.builtInZoomControls = true
            settings.displayZoomControls = false
            settings.loadWithOverviewMode = true
            settings.useWideViewPort = true
            webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(message: ConsoleMessage): Boolean { showRhwpStatus(this@apply, "JS: ${message.message()}", true); return true }
            }
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? = loader.shouldInterceptRequest(request.url)
                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: android.webkit.WebResourceError) { if (request.isForMainFrame) showRhwpStatus(view, "WebView 오류: ${error.description}", true) }
                override fun onPageFinished(view: WebView, url: String) {
                    val command = "window.openRhwpFromBase64(${jsString(base64)})"
                    fun send(attempt: Int) { view.evaluateJavascript("typeof window.openRhwpFromBase64 === 'function'") { ready -> if (ready == "true") view.evaluateJavascript(command, null) else if (attempt < 40) view.postDelayed({ send(attempt + 1) }, 100) else showRhwpStatus(view, "RHWP 초기화 시간 초과", true) } }
                    view.post { send(0) }
                }
            }
            loadUrl("https://appassets.androidplatform.net/assets/rhwp-viewer/index.html")
        }
    })
}

private fun showRhwpStatus(view: WebView, message: String, error: Boolean) {
    view.post { view.evaluateJavascript("(()=>{const e=document.getElementById('status');if(e){e.className=${if (error) "'error'" else "''"};e.textContent=${jsString(message)}}})();", null) }
}
private fun jsString(value: String) = "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n") + "\""

private fun loadDocument(resolver: android.content.ContentResolver, uri: Uri, name: String, kind: ViewerKind): ViewerState = when (kind) {
    ViewerKind.PDF -> {
        val descriptor = resolver.openFileDescriptor(uri, "r") ?: error("파일을 열 수 없습니다.")
        descriptor.use { pfd -> PdfRenderer(pfd).use { renderer ->
            val pages = ArrayList<Bitmap>(renderer.pageCount)
            for (index in 0 until renderer.pageCount) renderer.openPage(index).use { page ->
                val bitmap = Bitmap.createBitmap((page.width * 1.5f).toInt().coerceAtLeast(1), (page.height * 1.5f).toInt().coerceAtLeast(1), Bitmap.Config.ARGB_8888)
                bitmap.eraseColor(android.graphics.Color.WHITE); page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY); pages += bitmap
            }
            ViewerState.Pdf(pages)
        }}
    }
    ViewerKind.IMAGE -> resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it)?.let(ViewerState::ImageContent) ?: error("이미지를 해석할 수 없습니다.") } ?: error("이미지를 열 수 없습니다.")
    ViewerKind.TEXT -> resolver.openInputStream(uri)?.bufferedReader(Charsets.UTF_8)?.use { ViewerState.TextContent(it.readText().take(2_000_000)) } ?: error("텍스트를 열 수 없습니다.")
    ViewerKind.RHWP -> resolver.openInputStream(uri)?.use { val bytes = it.readBytes(); require(bytes.size <= 50 * 1024 * 1024); ViewerState.Rhwp(Base64.encodeToString(bytes, Base64.NO_WRAP)) } ?: error("HWP/HWPX를 열 수 없습니다.")
    ViewerKind.OFFICE -> ViewerState.Office(loadOfficePreview(resolver, uri, name))
    ViewerKind.UNSUPPORTED -> ViewerState.Error("이 파일 형식은 현재 내부 뷰어에서 읽을 수 없습니다.")
}
