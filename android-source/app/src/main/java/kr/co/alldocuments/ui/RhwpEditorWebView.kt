package kr.co.alldocuments.ui

import android.net.Uri
import android.util.Base64
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.webkit.WebViewAssetLoader
import org.json.JSONTokener
import java.io.ByteArrayInputStream

private const val RHWP_EDITOR_ORIGIN = "appassets.androidplatform.net"
private const val RHWP_EDITOR_URL = "https://appassets.androidplatform.net/assets/rhwp-editor/index.html"
internal const val MAX_RHWP_EDITOR_BYTES = 50 * 1024 * 1024

internal class RhwpEditorController {
    private var webView: WebView? = null

    internal fun attach(view: WebView) {
        webView = view
    }

    internal fun detach(view: WebView) {
        if (webView === view) webView = null
    }

    fun export(format: String, callback: (Result<ByteArray>) -> Unit) {
        val view = webView
        if (view == null) {
            callback(Result.failure(IllegalStateException("편집기가 준비되지 않았습니다.")))
            return
        }
        val safeFormat = if (format.equals("hwpx", ignoreCase = true)) "hwpx" else "hwp"
        view.evaluateJavascript("window.exportEditedBase64('$safeFormat')") { raw ->
            callback(runCatching {
                val value = JSONTokener(raw).nextValue() as? String
                    ?: error("편집 결과를 읽을 수 없습니다.")
                val bytes = Base64.decode(value, Base64.DEFAULT)
                require(bytes.size <= MAX_RHWP_EDITOR_BYTES) { "편집 결과가 50MB를 초과합니다." }
                bytes
            })
        }
    }

    fun notifySaved(fileName: String) {
        webView?.evaluateJavascript("window.notifyRhwpSaved(${jsQuoted(fileName)})", null)
    }
}

@Composable
internal fun RhwpEditorWebView(
    base64: String,
    fileName: String,
    controller: RhwpEditorController,
    onError: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    AndroidView(
        modifier = modifier,
        factory = { context ->
            val loader = WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context))
                .build()
            WebView(context).apply {
                WebView.setWebContentsDebuggingEnabled(false)
                settings.javaScriptEnabled = true
                settings.javaScriptCanOpenWindowsAutomatically = false
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                settings.allowFileAccessFromFileURLs = false
                settings.allowUniversalAccessFromFileURLs = false
                settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                settings.domStorageEnabled = true
                settings.databaseEnabled = false
                settings.setGeolocationEnabled(false)
                settings.mediaPlaybackRequiresUserGesture = true
                settings.setSupportZoom(false)

                webChromeClient = object : WebChromeClient() {
                    override fun onConsoleMessage(message: ConsoleMessage): Boolean {
                        if (message.messageLevel() == ConsoleMessage.MessageLevel.ERROR) {
                            onError("편집기 오류: ${message.message()}")
                        }
                        return true
                    }
                }
                webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                        !isRhwpEditorUrlAllowed(request.url)

                    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                        if (isRhwpEditorUrlAllowed(request.url)) {
                            loader.shouldInterceptRequest(request.url)
                        } else {
                            blockedEditorResponse()
                        }

                    override fun onReceivedError(
                        view: WebView,
                        request: WebResourceRequest,
                        error: android.webkit.WebResourceError
                    ) {
                        if (request.isForMainFrame) onError("편집기 WebView 오류: ${error.description}")
                    }

                    override fun onPageFinished(view: WebView, url: String) {
                        if (!isRhwpEditorUrlAllowed(Uri.parse(url))) return
                        controller.attach(view)
                        val command = "window.openRhwpEditorFromBase64(${jsQuoted(base64)},${jsQuoted(fileName)})"
                        fun send(attempt: Int) {
                            view.evaluateJavascript("typeof window.openRhwpEditorFromBase64 === 'function'") { ready ->
                                if (ready == "true") {
                                    view.evaluateJavascript(command) { result ->
                                        if (result == "null") onError("편집기 초기화에 실패했습니다.")
                                    }
                                } else if (attempt < 60) {
                                    view.postDelayed({ send(attempt + 1) }, 100)
                                } else {
                                    onError("RHWP 편집기 초기화 시간 초과")
                                }
                            }
                        }
                        view.post { send(0) }
                    }
                }
                loadUrl(RHWP_EDITOR_URL)
            }
        },
        update = { controller.attach(it) },
        onRelease = { view ->
            controller.detach(view)
            view.stopLoading()
            view.loadUrl("about:blank")
            view.removeAllViews()
            view.destroy()
        }
    )
}

private fun isRhwpEditorUrlAllowed(uri: Uri): Boolean =
    uri.scheme == "https" && uri.host == RHWP_EDITOR_ORIGIN

private fun blockedEditorResponse(): WebResourceResponse = WebResourceResponse(
    "text/plain",
    "utf-8",
    403,
    "Blocked",
    emptyMap(),
    ByteArrayInputStream(ByteArray(0))
)

private fun jsQuoted(value: String): String =
    "\"" + value
        .replace("\\", "\\\\")
        .replace("\"", "\\\"")
        .replace("\n", "\\n")
        .replace("\r", "\\r") + "\""
