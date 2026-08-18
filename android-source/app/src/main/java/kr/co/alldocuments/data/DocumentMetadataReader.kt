package kr.co.alldocuments.data

import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import kr.co.alldocuments.domain.DocumentClassifier
import kr.co.alldocuments.domain.DocumentItem
import java.util.UUID

class DocumentMetadataReader(private val resolver: ContentResolver) {
    fun read(uri: Uri): DocumentItem {
        var displayName = uri.lastPathSegment?.substringAfterLast('/') ?: "문서"
        resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (index >= 0 && cursor.moveToFirst()) {
                displayName = cursor.getString(index) ?: displayName
            }
        }
        val mimeType = resolver.getType(uri)
        return DocumentItem(
            id = UUID.randomUUID().toString(),
            name = displayName,
            uri = uri.toString(),
            mimeType = mimeType,
            type = DocumentClassifier.classify(displayName, mimeType),
            addedAt = System.currentTimeMillis()
        )
    }
}
