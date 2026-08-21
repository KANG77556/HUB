package kr.co.alldocuments.data

import android.content.ContentResolver
import android.net.Uri
import java.io.ByteArrayOutputStream

class DocumentEditorRepository(private val resolver: ContentResolver) {
    fun canWrite(uri: Uri): Boolean {
        val persistedWritable = resolver.persistedUriPermissions.any { permission ->
            permission.uri == uri && permission.isWritePermission
        }
        if (persistedWritable) return true

        return runCatching {
            resolver.openFileDescriptor(uri, "rw")?.use { true } ?: false
        }.getOrDefault(false)
    }

    fun writeText(uri: Uri, text: String): Result<Unit> =
        writeBytes(uri, text.toByteArray(Charsets.UTF_8))

    fun writeBytes(uri: Uri, bytes: ByteArray): Result<Unit> = runCatching {
        resolver.openOutputStream(uri, "wt")?.use { output ->
            output.write(bytes)
            output.flush()
        } ?: error("문서를 저장할 수 없습니다.")
    }

    fun readBytes(uri: Uri, maxBytes: Int): Result<ByteArray> = runCatching {
        require(maxBytes > 0) { "읽기 한도는 0보다 커야 합니다." }
        resolver.openInputStream(uri)?.use { input ->
            val output = ByteArrayOutputStream(minOf(maxBytes, 64 * 1024))
            val buffer = ByteArray(16 * 1024)
            var total = 0
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                total += read
                require(total <= maxBytes) { "파일 크기가 허용 한도를 초과합니다." }
                output.write(buffer, 0, read)
            }
            output.toByteArray()
        } ?: error("문서를 읽을 수 없습니다.")
    }
}
