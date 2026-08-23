package kr.co.alldocuments

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kr.co.alldocuments.ui.AllDocumentsApp
import kr.co.alldocuments.ui.ExternalDocumentEntry
import kr.co.alldocuments.ui.theme.AllDocumentsTheme

data class ExternalOpenRequest(val id: Long, val uri: Uri)

class MainActivity : ComponentActivity() {
    private var requestSequence = 0L
    private var externalOpenRequest by mutableStateOf<ExternalOpenRequest?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        externalOpenRequest = extractOpenRequest(intent)
        setContent {
            AllDocumentsTheme {
                val request = externalOpenRequest
                if (request != null) {
                    ExternalDocumentEntry(
                        request = request,
                        onBack = { externalOpenRequest = null }
                    )
                } else {
                    AllDocumentsApp()
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        extractOpenRequest(intent)?.let { externalOpenRequest = it }
    }

    private fun extractOpenRequest(intent: Intent?): ExternalOpenRequest? {
        if (intent?.action != Intent.ACTION_VIEW) return null
        val uri = intent.data ?: return null
        requestSequence += 1
        return ExternalOpenRequest(requestSequence, uri)
    }
}
