package kr.co.alldocuments.data

import android.content.Context
import kr.co.alldocuments.domain.DocumentItem
import kr.co.alldocuments.domain.DocumentType
import java.net.URLDecoder
import java.net.URLEncoder

class DocumentStore(context: Context) {
    private val prefs = context.getSharedPreferences("documents", Context.MODE_PRIVATE)

    fun load(): List<DocumentItem> = prefs.getStringSet(KEY_ITEMS, emptySet()).orEmpty()
        .mapNotNull(::decode)
        .sortedByDescending { it.addedAt }

    fun save(items: List<DocumentItem>) {
        prefs.edit().putStringSet(KEY_ITEMS, items.map(::encode).toSet()).apply()
    }

    private fun encode(item: DocumentItem): String = listOf(
        item.id,
        item.name,
        item.uri,
        item.mimeType.orEmpty(),
        item.type.name,
        item.addedAt.toString(),
        item.isFavorite.toString()
    ).joinToString("|") { URLEncoder.encode(it, Charsets.UTF_8.name()) }

    private fun decode(value: String): DocumentItem? = runCatching {
        val parts = value.split('|').map { URLDecoder.decode(it, Charsets.UTF_8.name()) }
        DocumentItem(
            id = parts[0],
            name = parts[1],
            uri = parts[2],
            mimeType = parts[3].ifBlank { null },
            type = DocumentType.valueOf(parts[4]),
            addedAt = parts[5].toLong(),
            isFavorite = parts[6].toBoolean()
        )
    }.getOrNull()

    private companion object { const val KEY_ITEMS = "items" }
}
