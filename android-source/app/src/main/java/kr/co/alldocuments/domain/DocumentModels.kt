package kr.co.alldocuments.domain

enum class DocumentType(val label: String) {
    ALL("전체"),
    PDF("PDF"),
    WORD("Word"),
    EXCEL("Excel"),
    POWERPOINT("PowerPoint"),
    TEXT("텍스트"),
    OTHER("기타")
}

data class DocumentItem(
    val id: String,
    val name: String,
    val uri: String,
    val mimeType: String?,
    val type: DocumentType,
    val addedAt: Long,
    val isFavorite: Boolean = false
)
