package kr.co.alldocuments.domain

object DocumentMimeResolver {
    private val byExtension = mapOf(
        "pdf" to "application/pdf",
        "doc" to "application/msword",
        "docx" to "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls" to "application/vnd.ms-excel",
        "xlsx" to "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "ppt" to "application/vnd.ms-powerpoint",
        "pptx" to "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "hwp" to "application/x-hwp",
        "hwpx" to "application/vnd.hancom.hwpx",
        "txt" to "text/plain",
        "csv" to "text/csv",
        "rtf" to "application/rtf",
        "odt" to "application/vnd.oasis.opendocument.text",
        "ods" to "application/vnd.oasis.opendocument.spreadsheet",
        "odp" to "application/vnd.oasis.opendocument.presentation",
        "jpg" to "image/jpeg",
        "jpeg" to "image/jpeg",
        "png" to "image/png",
        "gif" to "image/gif",
        "webp" to "image/webp",
        "svg" to "image/svg+xml",
        "zip" to "application/zip"
    )

    fun resolve(name: String, providerMimeType: String?): String {
        val provider = providerMimeType?.trim()?.takeIf { it.isNotEmpty() && it != "application/octet-stream" && it != "*/*" }
        if (provider != null) return provider
        val extension = name.substringAfterLast('.', "").lowercase()
        return byExtension[extension] ?: "*/*"
    }
}
