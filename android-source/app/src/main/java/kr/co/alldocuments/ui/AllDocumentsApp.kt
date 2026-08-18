package kr.co.alldocuments.ui

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.launch
import kr.co.alldocuments.domain.DocumentItem
import kr.co.alldocuments.domain.DocumentMimeResolver
import kr.co.alldocuments.domain.DocumentType

@Composable
fun AllDocumentsApp(viewModel: DocumentViewModel = viewModel()) {
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) viewModel.addDocument(uri)
    }

    fun openDocument(item: DocumentItem) {
        val originalUri = Uri.parse(item.uri)
        val mimeType = DocumentMimeResolver.resolve(item.name, item.mimeType)
        val viewIntent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(originalUri, mimeType)
            clipData = ClipData.newRawUri(item.name, originalUri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_DOCUMENT)
        }
        val chooser = Intent.createChooser(viewIntent, "원본 문서로 열기").apply {
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        try {
            context.startActivity(chooser)
        } catch (_: ActivityNotFoundException) {
            scope.launch { snackbarHostState.showSnackbar("이 원본 문서를 열 수 있는 호환 앱이 설치되어 있지 않습니다.") }
        } catch (_: Exception) {
            scope.launch { snackbarHostState.showSnackbar("원본 문서를 열 수 없습니다.") }
        }
    }

    Scaffold(snackbarHost = { SnackbarHost(snackbarHostState) }) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                Spacer(Modifier.height(12.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Column {
                        Text("모든 문서", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                        Text("원본 문서를 변환 없이 호환 앱으로 열기", style = MaterialTheme.typography.bodyMedium)
                    }
                    Button(onClick = { picker.launch(arrayOf("*/*")) }) { Text("문서 추가") }
                }
            }
            item {
                OutlinedTextField(
                    value = state.query,
                    onValueChange = viewModel::setQuery,
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("문서 검색") },
                    singleLine = true,
                    shape = RoundedCornerShape(16.dp)
                )
            }
            item {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(DocumentType.entries) { type ->
                        FilterChip(selected = state.selectedType == type, onClick = { viewModel.setType(type) }, label = { Text(type.label) })
                    }
                }
            }
            if (state.documents.isEmpty()) {
                item { EmptyState(onAdd = { picker.launch(arrayOf("*/*")) }) }
            } else {
                if (state.query.isBlank() && state.selectedType == DocumentType.ALL) {
                    item { Text("최근 문서", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold) }
                    items(state.recentDocuments, key = { "recent-${it.id}" }) { item ->
                        DocumentCard(item, viewModel::toggleFavorite) { openDocument(item) }
                    }
                }
                item {
                    Text("문서 ${state.filteredDocuments.size}개 · 즐겨찾기 ${state.favoriteCount}개", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                }
                if (state.filteredDocuments.isEmpty()) {
                    item { Text("검색 조건에 맞는 문서가 없습니다.", modifier = Modifier.padding(vertical = 24.dp)) }
                } else {
                    items(state.filteredDocuments, key = { "all-${it.id}" }) { item ->
                        DocumentCard(item, viewModel::toggleFavorite) { openDocument(item) }
                    }
                }
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}

@Composable
private fun EmptyState(onAdd: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("아직 추가된 문서가 없습니다.", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text("PDF, Word, Excel, PowerPoint, HWP/HWPX, 텍스트와 이미지 파일을 추가할 수 있습니다.")
            Button(onClick = onAdd) { Text("첫 문서 추가") }
        }
    }
}

@Composable
private fun DocumentCard(item: DocumentItem, onFavorite: (String) -> Unit, onOpen: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().clickable(onClick = onOpen)) {
        Row(modifier = Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Column(modifier = Modifier.weight(1f)) {
                Text(item.type.label, style = MaterialTheme.typography.labelMedium)
                Text(item.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            TextButton(onClick = { onFavorite(item.id) }) { Text(if (item.isFavorite) "★" else "☆") }
        }
    }
}
