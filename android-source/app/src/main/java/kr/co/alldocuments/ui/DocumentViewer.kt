package kr.co.alldocuments.ui

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Intent
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
import androidx.compose.ui.viewinterop.AndroidView
import androidx.webkit.WebViewAssetLoader
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kr.co.alldocuments.domain.DocumentItem
import kr.co.alldocuments.domain.DocumentMimeResolver
import kr.co.alldocuments.domain.DocumentViewerStrategy
import kr.co.alldocuments.domain.ViewerKind

private sealed interface ViewerState { data object Loading:ViewerState; data class Pdf(val pages:List<Bitmap>):ViewerState; data class ImageContent(val bitmap:Bitmap):ViewerState; data class TextContent(val text:String):ViewerState; data class Rhwp(val base64:String):ViewerState; data class Error(val message:String):ViewerState }

@Composable fun DocumentViewer(item:DocumentItem,onBack:()->Unit){
 val context=LocalContext.current; var state by remember(item.uri){mutableStateOf<ViewerState>(ViewerState.Loading)}; val kind=remember(item.name,item.mimeType){DocumentViewerStrategy.resolve(item.name,item.mimeType)}
 LaunchedEffect(item.uri,kind){state=if(kind==ViewerKind.UNSUPPORTED) ViewerState.Error("이 형식은 앱 내부에서 원본 레이아웃을 정확하게 표시할 수 없습니다.") else withContext(Dispatchers.IO){runCatching{loadDocument(context.contentResolver,Uri.parse(item.uri),kind)}.getOrElse{ViewerState.Error("문서를 읽을 수 없습니다: ${it.message?:"알 수 없는 오류"}")}}}
 Column(Modifier.fillMaxSize().padding(16.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween){Button(onClick=onBack){Text("뒤로")};Button(onClick={openExternally(context,item)}){Text("외부 앱으로 열기")}};Text(item.name,style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold);when(val current=state){ViewerState.Loading->CircularProgressIndicator();is ViewerState.Error->Text(current.message);is ViewerState.TextContent->LazyColumn(Modifier.fillMaxSize()){item{Text(current.text)}};is ViewerState.ImageContent->Image(current.bitmap.asImageBitmap(),item.name,Modifier.fillMaxWidth(),contentScale=ContentScale.Fit);is ViewerState.Rhwp->RhwpWebView(current.base64);is ViewerState.Pdf->LazyColumn(Modifier.fillMaxSize(),verticalArrangement=Arrangement.spacedBy(12.dp)){itemsIndexed(current.pages){index,bitmap->Column(verticalArrangement=Arrangement.spacedBy(4.dp)){Text("${index+1} / ${current.pages.size}",style=MaterialTheme.typography.labelMedium);Image(bitmap.asImageBitmap(),"${item.name} ${index+1}페이지",Modifier.fillMaxWidth(),contentScale=ContentScale.Fit)}}}}}
}

@Composable private fun RhwpWebView(base64:String){AndroidView(modifier=Modifier.fillMaxSize(),factory={context->
 val assetLoader=WebViewAssetLoader.Builder().addPathHandler("/assets/",WebViewAssetLoader.AssetsPathHandler(context)).build()
 WebView(context).apply{settings.javaScriptEnabled=true;settings.allowFileAccess=false;settings.allowContentAccess=false;settings.setSupportZoom(true);settings.builtInZoomControls = true;settings.displayZoomControls = false;settings.loadWithOverviewMode=true;settings.useWideViewPort=true
 webChromeClient=object:WebChromeClient(){override fun onConsoleMessage(consoleMessage:ConsoleMessage):Boolean{showRhwpStatus(this@apply,"JS ${consoleMessage.messageLevel()}: ${consoleMessage.message()}",true);return true}}
 webViewClient=object:WebViewClient(){override fun shouldInterceptRequest(view:WebView,request:WebResourceRequest):WebResourceResponse?=assetLoader.shouldInterceptRequest(request.url);override fun onReceivedError(view:WebView,request:WebResourceRequest,error:android.webkit.WebResourceError){if(request.isForMainFrame)showRhwpStatus(view,"WebView 로드 오류: ${error.description}",true)};override fun onPageFinished(view:WebView,url:String){val command="window.openRhwpFromBase64(${jsString(base64)})";fun send(attempt:Int){view.evaluateJavascript("typeof window.openRhwpFromBase64 === 'function'"){ready->when{ready=="true"->view.evaluateJavascript(command,null);attempt<40->view.postDelayed({send(attempt+1)},100);else->showRhwpStatus(view,"RHWP 초기화 시간 초과: JavaScript 모듈이 준비되지 않았습니다.",true)}}};view.post{send(0)}}};loadUrl("https://appassets.androidplatform.net/assets/rhwp-viewer/index.html")}
})}
private fun showRhwpStatus(view:WebView,message:String,isError:Boolean){val script="""(()=>{const el=document.getElementById('status');if(!el)return;el.className=${if(isError)"'error'" else "''"};el.textContent=${jsString(message)};})();""".trimIndent();view.post{view.evaluateJavascript(script,null)}}
private fun jsString(value:String):String="\""+value.replace("\\","\\\\").replace("\"","\\\"").replace("\n","\\n")+"\""
private fun loadDocument(resolver:android.content.ContentResolver,uri:Uri,kind:ViewerKind):ViewerState=when(kind){ViewerKind.PDF->{val descriptor=resolver.openFileDescriptor(uri,"r")?:error("파일을 열 수 없습니다.");descriptor.use{pfd->PdfRenderer(pfd).use{renderer->val pages=ArrayList<Bitmap>(renderer.pageCount);for(index in 0 until renderer.pageCount)renderer.openPage(index).use{page->val bitmap=Bitmap.createBitmap((page.width*1.5f).toInt().coerceAtLeast(1),(page.height*1.5f).toInt().coerceAtLeast(1),Bitmap.Config.ARGB_8888);bitmap.eraseColor(android.graphics.Color.WHITE);page.render(bitmap,null,null,PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);pages+=bitmap};ViewerState.Pdf(pages)}}};ViewerKind.IMAGE->resolver.openInputStream(uri)?.use{BitmapFactory.decodeStream(it)?.let(ViewerState::ImageContent)?:error("이미지를 해석할 수 없습니다.")}?:error("이미지 파일을 열 수 없습니다.");ViewerKind.TEXT->resolver.openInputStream(uri)?.bufferedReader(Charsets.UTF_8)?.use{reader->val maxChars=2_000_000;val buffer=CharArray(8192);val output=StringBuilder();while(output.length<maxChars){val read=reader.read(buffer,0,minOf(buffer.size,maxChars-output.length));if(read<0)break;output.append(buffer,0,read)};if(output.length==maxChars)output.append("\n\n[문서가 커서 앞부분만 표시했습니다.]");ViewerState.TextContent(output.toString())}?:error("텍스트 파일을 열 수 없습니다.");ViewerKind.RHWP->resolver.openInputStream(uri)?.use{stream->val bytes=stream.readBytes();require(bytes.size<=50*1024*1024){"HWP/HWPX 파일이 50MB를 초과합니다."};ViewerState.Rhwp(Base64.encodeToString(bytes,Base64.NO_WRAP))}?:error("HWP/HWPX 파일을 열 수 없습니다.");ViewerKind.UNSUPPORTED->ViewerState.Error("지원하지 않는 내부 뷰어 형식입니다.")}
private fun openExternally(context:android.content.Context,item:DocumentItem){val uri=Uri.parse(item.uri);val intent=Intent(Intent.ACTION_VIEW).apply{setDataAndType(uri,DocumentMimeResolver.resolve(item.name,item.mimeType));clipData=ClipData.newRawUri(item.name,uri);addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)};try{context.startActivity(Intent.createChooser(intent,"외부 앱으로 열기").apply{addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)})}catch(_:ActivityNotFoundException){}}
