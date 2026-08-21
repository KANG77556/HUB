package kr.co.alldocuments.ui

import android.app.Application
import android.content.Intent
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kr.co.alldocuments.data.DocumentMetadataReader
import kr.co.alldocuments.data.DocumentStore
import kr.co.alldocuments.domain.DocumentItem
import kr.co.alldocuments.domain.DocumentType
import kr.co.alldocuments.domain.filterDocuments

data class DocumentUiState(
    val documents: List<DocumentItem> = emptyList(),
    val query: String = "",
    val selectedType: DocumentType = DocumentType.ALL
) {
    val filteredDocuments: List<DocumentItem>
        get() = filterDocuments(documents, query, selectedType)

    val recentDocuments: List<DocumentItem>
        get() = documents.sortedByDescending { it.lastOpenedAt }.take(5)

    val favoriteCount: Int
        get() = documents.count { it.isFavorite }
}

class DocumentViewModel(application: Application) : AndroidViewModel(application) {
    private val store = DocumentStore(application)
    private val metadataReader = DocumentMetadataReader(application.contentResolver)
    private val _state = MutableStateFlow(DocumentUiState(documents = store.load()))
    val state: StateFlow<DocumentUiState> = _state.asStateFlow()

    fun addDocument(uri: Uri): DocumentItem? = runCatching {
        runCatching {
            getApplication<Application>().contentResolver.takePersistableUriPermission(
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION
            )
        }

        val incoming = metadataReader.read(uri)
        val existing = _state.value.documents.firstOrNull { it.uri == incoming.uri }
        val item = incoming.copy(
            isFavorite = existing?.isFavorite ?: incoming.isFavorite,
            lastOpenedAt = System.currentTimeMillis()
        )
        val updated = (_state.value.documents.filterNot { it.uri == item.uri } + item)
            .sortedByDescending { it.lastOpenedAt }
        store.save(updated)
        _state.update { it.copy(documents = updated) }
        item
    }.getOrNull()

    fun openDocument(item: DocumentItem): DocumentItem {
        val opened = item.copy(lastOpenedAt = System.currentTimeMillis())
        val updated = _state.value.documents.map { current ->
            if (current.id == item.id) opened else current
        }.sortedByDescending { it.lastOpenedAt }
        store.save(updated)
        _state.update { it.copy(documents = updated) }
        return opened
    }

    fun setQuery(query: String) = _state.update { it.copy(query = query) }

    fun setType(type: DocumentType) = _state.update { it.copy(selectedType = type) }

    fun toggleFavorite(id: String) {
        val updated = _state.value.documents.map { item ->
            if (item.id == id) item.copy(isFavorite = !item.isFavorite) else item
        }
        store.save(updated)
        _state.update { it.copy(documents = updated) }
    }
}
