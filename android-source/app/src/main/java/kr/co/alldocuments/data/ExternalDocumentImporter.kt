package kr.co.alldocuments.data

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileOutputStream
import java.util.UUID

private const val MAX_EXTERNAL_IMPORT_BYTES = 100L * 1024L * 1024L

class ExternalDocumentImporter(private val context: Context) {
    private val resolver = context.contentResolver

    fun importDocument(source: Uri): Uri {
        val displayName = queryDisplayName(source)
        val safeName = sanitizeFileName(displayName)
        val directory = File(context.filesDir, "external-imports").apply { mkdirs() }
        val target = File(directory, "${UUID.randomUUID()}-$safeName")

        try {
            resolver.openInputStream(source)?.use { input ->
                FileOutputStream(target).use { output ->
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    var total = 0L
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        total += read
                        require(total <= MAX_EXTERNAL_IMPORT_BYTES) { "문서 크기가 허용 한도를 초과합니다." }
                        output.write(buffer, 0, read)
                    }
                }
            } ?: throw SecurityException("Unable to open external document")
        } catch (error: Throwable) {
            target.delete()
            throw error
        }

        return FileProvider.getUriForFile(context, "${context.packageName}.files", target)
    }

    private fun queryDisplayName(uri: Uri): String {
        var name = uri.lastPathSegment?.substringAfterLast('/') ?: "document"
        runCatching {
            resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (index >= 0 && cursor.moveToFirst()) name = cursor.getString(index) ?: name
            }
        }
        return name
    }

    private fun sanitizeFileName(name: String): String {
        val cleaned = name.replace(Regex("[^A-Za-z0-9._() -]"), "_").trim().take(120)
        return cleaned.ifBlank { "document" }
    }
}
