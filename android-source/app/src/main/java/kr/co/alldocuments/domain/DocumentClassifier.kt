package kr.co.alldocuments.domain

object DocumentClassifier {
    fun classify(name: String, mimeType: String?): DocumentType {
        val lowerName = name.lowercase()
        val mime = mimeType?.lowercase().orEmpty()
        return when {
            lowerName.endsWith(".pdf") || mime == "application/pdf" -> DocumentType.PDF
            lowerName.endsWith(".doc") || lowerName.endsWith(".docx") || "word" in mime -> DocumentType.WORD
            lowerName.endsWith(".xls") || lowerName.endsWith(".xlsx") || "excel" in mime || "spreadsheet" in mime -> DocumentType.EXCEL
            lowerName.endsWith(".ppt") || lowerName.endsWith(".pptx") || "powerpoint" in mime || "presentation" in mime -> DocumentType.POWERPOINT
            lowerName.endsWith(".txt") || lowerName.endsWith(".csv") || mime.startsWith("text/") -> DocumentType.TEXT
            else -> DocumentType.OTHER
        }
    }
}

fun filterDocuments(
    items: List<DocumentItem>,
    query: String,
    type: DocumentType
): List<DocumentItem> {
    val normalizedQuery = query.trim()
    return items.filter { item ->
        val matchesQuery = normalizedQuery.isBlank() || item.name.contains(normalizedQuery, ignoreCase = true)
        val matchesType = type == DocumentType.ALL || item.type == type
        matchesQuery && matchesType
    }
}
