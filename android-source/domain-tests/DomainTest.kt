package kr.co.alldocuments.domain

private fun assertEquals(expected: Any?, actual: Any?, name: String) {
    check(expected == actual) { "$name: expected=$expected actual=$actual" }
}

private fun assertTrue(value: Boolean, name: String) {
    check(value) { "$name: expected true" }
}

fun main() {
    assertEquals(DocumentType.PDF, DocumentClassifier.classify("report.pdf", "application/pdf"), "pdf classification")
    assertEquals(DocumentType.WORD, DocumentClassifier.classify("lesson.DOCX", null), "word classification")
    assertEquals(DocumentType.EXCEL, DocumentClassifier.classify("budget.xlsx", null), "excel classification")
    assertEquals(DocumentType.POWERPOINT, DocumentClassifier.classify("briefing.pptx", null), "powerpoint classification")
    assertEquals(DocumentType.TEXT, DocumentClassifier.classify("memo.txt", "text/plain"), "text classification")
    assertEquals(DocumentType.OTHER, DocumentClassifier.classify("archive.zip", "application/zip"), "other classification")

    assertEquals("application/pdf", DocumentMimeResolver.resolve("report.pdf", null), "pdf mime")
    assertEquals("application/msword", DocumentMimeResolver.resolve("legacy.doc", null), "doc mime")
    assertEquals("application/vnd.openxmlformats-officedocument.wordprocessingml.document", DocumentMimeResolver.resolve("lesson.docx", null), "docx mime")
    assertEquals("application/vnd.ms-excel", DocumentMimeResolver.resolve("legacy.xls", null), "xls mime")
    assertEquals("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", DocumentMimeResolver.resolve("budget.xlsx", null), "xlsx mime")
    assertEquals("application/vnd.ms-powerpoint", DocumentMimeResolver.resolve("legacy.ppt", null), "ppt mime")
    assertEquals("application/vnd.openxmlformats-officedocument.presentationml.presentation", DocumentMimeResolver.resolve("briefing.pptx", null), "pptx mime")
    assertEquals("application/x-hwp", DocumentMimeResolver.resolve("공문.hwp", null), "hwp mime")
    assertEquals("application/vnd.hancom.hwpx", DocumentMimeResolver.resolve("계획서.hwpx", null), "hwpx mime")
    assertEquals("text/plain", DocumentMimeResolver.resolve("memo.txt", null), "txt mime")
    assertEquals("text/csv", DocumentMimeResolver.resolve("data.csv", null), "csv mime")
    assertEquals("image/jpeg", DocumentMimeResolver.resolve("photo.jpg", null), "jpg mime")
    assertEquals("image/png", DocumentMimeResolver.resolve("scan.png", null), "png mime")
    assertEquals("application/zip", DocumentMimeResolver.resolve("archive.zip", "application/zip"), "provider mime preferred")
    assertEquals("*/*", DocumentMimeResolver.resolve("unknown.zzz", null), "unknown mime fallback")

    assertEquals(ViewerKind.PDF, DocumentViewerStrategy.resolve("report.pdf", null), "pdf viewer")
    assertEquals(ViewerKind.IMAGE, DocumentViewerStrategy.resolve("scan.png", null), "image viewer")
    assertEquals(ViewerKind.TEXT, DocumentViewerStrategy.resolve("memo.txt", null), "text viewer")
    assertEquals(ViewerKind.TEXT, DocumentViewerStrategy.resolve("data.csv", null), "csv viewer")
    assertEquals(ViewerKind.UNSUPPORTED, DocumentViewerStrategy.resolve("lesson.docx", null), "docx fallback")
    assertEquals(ViewerKind.UNSUPPORTED, DocumentViewerStrategy.resolve("공문.hwp", null), "hwp fallback")

    val items = listOf(
        DocumentItem("1", "2026 예산.xlsx", "content://1", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", DocumentType.EXCEL, 10L, false),
        DocumentItem("2", "회의 보고서.pdf", "content://2", "application/pdf", DocumentType.PDF, 20L, true),
        DocumentItem("3", "수업 계획서.docx", "content://3", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", DocumentType.WORD, 30L, false)
    )

    assertEquals(1, filterDocuments(items, "보고서", DocumentType.ALL).size, "query filtering")
    assertEquals("회의 보고서.pdf", filterDocuments(items, "보고서", DocumentType.ALL).first().name, "query result")
    assertEquals(1, filterDocuments(items, "", DocumentType.EXCEL).size, "type filtering")
    assertTrue(filterDocuments(items, "계획서", DocumentType.WORD).single().name.contains("계획서"), "combined filtering")

    println("Domain tests passed")
}
