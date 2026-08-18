package kr.co.alldocuments.domain

enum class ViewerKind { PDF, IMAGE, TEXT, RHWP, UNSUPPORTED }

object DocumentViewerStrategy {
    fun resolve(name: String, mimeType: String?): ViewerKind {
        val extension = name.substringAfterLast('.', "").lowercase()
        if (extension == "hwp" || extension == "hwpx") return ViewerKind.RHWP

        val mime = DocumentMimeResolver.resolve(name, mimeType).lowercase()
        return when {
            mime == "application/pdf" -> ViewerKind.PDF
            mime == "application/x-hwp" || mime == "application/haansofthwp" || mime == "application/vnd.hancom.hwp" -> ViewerKind.RHWP
            mime == "application/vnd.hancom.hwpx" || mime == "application/hwp+zip" -> ViewerKind.RHWP
            mime.startsWith("image/") -> ViewerKind.IMAGE
            mime.startsWith("text/") -> ViewerKind.TEXT
            else -> ViewerKind.UNSUPPORTED
        }
    }
}
