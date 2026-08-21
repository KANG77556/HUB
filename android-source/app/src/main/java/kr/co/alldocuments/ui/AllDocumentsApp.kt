package kr.co.alldocuments.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import kr.co.alldocuments.domain.DocumentItem
import kr.co.alldocuments.domain.DocumentType

@Composable
fun AllDocumentsApp(viewModel: DocumentViewModel = viewModel()) {
    val state by viewModel.state.collectAsState()
    var selectedDocument by remember { mutableStateOf<DocumentItem?>(null) }

    if (selectedDocument != null) {
        DocumentViewer(item = selectedDocument!!, onBack = { selectedDocument = null })
        return
    }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) viewModel.addDocument(uri)
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
        contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = 18.dp, bottom = 28.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        "모든 문서",
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onBackground
                    )
                    Text(
                        "필요한 문서를 한곳에서 빠르게 열어보세요",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                AddDocumentButton { picker.launch(arrayOf("*/*")) }
            }
        }

        item {
            DocumentSearchBar(query = state.query, onQueryChange = viewModel::setQuery)
        }

        item {
            DocumentTypeFilterRow(selectedType = state.selectedType, onSelect = viewModel::setType)
        }

        if (state.documents.isEmpty()) {
            item { EmptyState(onAdd = { picker.launch(arrayOf("*/*")) }) }
        } else {
            if (state.query.isBlank() && state.selectedType == DocumentType.ALL && state.recentDocuments.isNotEmpty()) {
                item { SectionHeader(title = "최근 문서", meta = "${state.recentDocuments.size}개") }
                items(state.recentDocuments, key = { "recent-${it.id}" }) { item ->
                    DocumentListRow(item, viewModel::toggleFavorite) { selectedDocument = item }
                }
                item { Spacer(Modifier.height(2.dp)) }
            }

            item {
                SectionHeader(
                    title = "전체 문서",
                    meta = "${state.filteredDocuments.size}개 · 즐겨찾기 ${state.favoriteCount}개"
                )
            }

            if (state.filteredDocuments.isEmpty()) {
                item {
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        color = MaterialTheme.colorScheme.surface,
                        shape = RoundedCornerShape(18.dp),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
                    ) {
                        Text(
                            "검색 조건에 맞는 문서가 없습니다.",
                            modifier = Modifier.padding(horizontal = 18.dp, vertical = 24.dp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            } else {
                items(state.filteredDocuments, key = { "all-${it.id}" }) { item ->
                    DocumentListRow(item, viewModel::toggleFavorite) { selectedDocument = item }
                }
            }
        }
    }
}

@Composable
private fun AddDocumentButton(onClick: () -> Unit) {
    Surface(
        modifier = Modifier.size(42.dp).clip(CircleShape).clickable(onClick = onClick),
        color = MaterialTheme.colorScheme.primary,
        shape = CircleShape,
        shadowElevation = 0.dp
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text("+", fontSize = 25.sp, fontWeight = FontWeight.Normal, color = MaterialTheme.colorScheme.onPrimary)
        }
    }
}

@Composable
private fun DocumentSearchBar(query: String, onQueryChange: (String) -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(16.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text("⌕", fontSize = 20.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            BasicTextField(
                value = query,
                onValueChange = onQueryChange,
                modifier = Modifier.weight(1f),
                singleLine = true,
                textStyle = TextStyle(
                    color = MaterialTheme.colorScheme.onSurface,
                    fontSize = 15.sp
                ),
                decorationBox = { inner ->
                    Box {
                        if (query.isBlank()) {
                            Text(
                                "문서 검색",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        inner()
                    }
                }
            )
            if (query.isNotBlank()) {
                Text(
                    "×",
                    modifier = Modifier.clip(CircleShape).clickable { onQueryChange("") }.padding(horizontal = 4.dp),
                    fontSize = 20.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
private fun DocumentTypeFilterRow(selectedType: DocumentType, onSelect: (DocumentType) -> Unit) {
    LazyRow(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        items(DocumentType.entries) { type ->
            FilterChip(
                selected = selectedType == type,
                onClick = { onSelect(type) },
                label = { Text(type.label) },
                shape = RoundedCornerShape(12.dp)
            )
        }
    }
}

@Composable
private fun SectionHeader(title: String, meta: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(top = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Text(meta, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun EmptyState(onAdd: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(20.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 24.dp),
            verticalArrangement = Arrangement.spacedBy(9.dp)
        ) {
            Text("아직 추가된 문서가 없습니다.", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(
                "PDF, Word, Excel, PowerPoint, HWP/HWPX, 텍스트와 이미지 파일을 앱 안에서 바로 열 수 있습니다.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Surface(
                modifier = Modifier.padding(top = 6.dp).clip(RoundedCornerShape(12.dp)).clickable(onClick = onAdd),
                color = MaterialTheme.colorScheme.primary,
                shape = RoundedCornerShape(12.dp)
            ) {
                Text(
                    "문서 추가",
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                    color = MaterialTheme.colorScheme.onPrimary,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
    }
}

@Composable
private fun DocumentListRow(item: DocumentItem, onFavorite: (String) -> Unit, onOpen: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).clickable(onClick = onOpen),
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(16.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            FileTypeBadge(item.type)
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    item.name,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    item.type.label,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Box(
                modifier = Modifier.size(36.dp).clip(CircleShape).clickable { onFavorite(item.id) },
                contentAlignment = Alignment.Center
            ) {
                Text(
                    if (item.isFavorite) "★" else "☆",
                    fontSize = 19.sp,
                    color = if (item.isFavorite) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
private fun FileTypeBadge(type: DocumentType) {
    val label = when (type) {
        DocumentType.ALL -> "DOC"
        DocumentType.PDF -> "PDF"
        DocumentType.WORD -> "DOC"
        DocumentType.EXCEL -> "XLS"
        DocumentType.POWERPOINT -> "PPT"
        DocumentType.TEXT -> "TXT"
        DocumentType.OTHER -> "FILE"
    }
    Box(
        modifier = Modifier.size(width = 46.dp, height = 42.dp).clip(RoundedCornerShape(11.dp))
            .background(MaterialTheme.colorScheme.primaryContainer),
        contentAlignment = Alignment.Center
    ) {
        Text(
            label,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onPrimaryContainer
        )
    }
}
