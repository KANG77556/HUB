package kr.co.alldocuments.domain

enum class ViewerKind { PDF, IMAGE, TEXT, UNSUPPORTED }

object DocumentViewerStrategy {
    fun resolve(name: String, mimeType: String?): ViewerKind {
        val mime = DocumentMimeResolver.resolve(name, mimeType).lowercase()
        return when {
            mime == "application/pdf" -> ViewerKind.PDF
            mime.startsWith("image/") -> ViewerKind.IMAGE
            mime.startsWith("text/") -> ViewerKind.TEXT
            else -> ViewerKind.UNSUPPORTED
        }
    }
}
