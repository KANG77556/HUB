package kr.co.alldocuments.ui

import android.content.ContentResolver
import android.net.Uri
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.util.zip.ZipInputStream
import javax.xml.XMLConstants
import javax.xml.parsers.DocumentBuilderFactory

private const val MAX_OFFICE_FILE_BYTES = 50 * 1024 * 1024
private const val MAX_OFFICE_ENTRY_BYTES = 20 * 1024 * 1024
private const val MAX_OFFICE_UNCOMPRESSED_BYTES = 100 * 1024 * 1024
private const val MAX_OFFICE_ENTRIES = 4096

internal data class OfficePreview(val sections: List<String>)

internal fun loadOfficePreview(resolver: ContentResolver, uri: Uri, name: String): OfficePreview {
    val bytes = resolver.openInputStream(uri)?.use { readLimitedBytes(it, MAX_OFFICE_FILE_BYTES) }
        ?: error("문서를 열 수 없습니다.")
    val ext = name.substringAfterLast('.', "").lowercase()
    if (ext !in setOf("docx", "xlsx", "pptx")) {
        return OfficePreview(listOf("이 형식은 내부 원본 미리보기를 지원하지 않습니다."))
    }

    val entries = mutableMapOf<String, ByteArray>()
    var retainedBytes = 0
    var declaredUncompressed = 0L
    var entryCount = 0
    ZipInputStream(ByteArrayInputStream(bytes)).use { zip ->
        while (true) {
            val entry = zip.nextEntry ?: break
            entryCount += 1
            require(entryCount <= MAX_OFFICE_ENTRIES) { "문서 내부 파일 수가 허용 한도를 초과합니다." }
            if (entry.size > 0) {
                declaredUncompressed += entry.size
                require(declaredUncompressed <= MAX_OFFICE_UNCOMPRESSED_BYTES) { "문서 압축 해제 크기가 허용 한도를 초과합니다." }
            }
            if (!entry.isDirectory && shouldRetainEntry(ext, entry.name)) {
                val entryBytes = readLimitedBytes(zip, MAX_OFFICE_ENTRY_BYTES)
                retainedBytes += entryBytes.size
                require(retainedBytes <= MAX_OFFICE_UNCOMPRESSED_BYTES) { "문서 처리 크기가 허용 한도를 초과합니다." }
                entries[entry.name] = entryBytes
            }
            zip.closeEntry()
        }
    }

    val sections = when (ext) {
        "docx" -> listOfNotNull(entries["word/document.xml"]?.let(::extractXmlText))
        "xlsx" -> {
            val shared = entries["xl/sharedStrings.xml"]?.let(::extractXmlText).orEmpty()
            val sheets = entries
                .filterKeys { it.startsWith("xl/worksheets/sheet") && it.endsWith(".xml") }
                .toSortedMap()
                .values
                .map(::extractXmlText)
            listOf(shared) + sheets
        }
        else -> entries
            .filterKeys { it.startsWith("ppt/slides/slide") && it.endsWith(".xml") }
            .toSortedMap()
            .values
            .map(::extractXmlText)
    }.filter { it.isNotBlank() }

    return OfficePreview(sections.ifEmpty { listOf("문서에서 표시할 텍스트를 찾지 못했습니다.") })
}

private fun shouldRetainEntry(ext: String, entryName: String): Boolean = when (ext) {
    "docx" -> entryName == "word/document.xml"
    "xlsx" -> entryName == "xl/sharedStrings.xml" || (entryName.startsWith("xl/worksheets/sheet") && entryName.endsWith(".xml"))
    "pptx" -> entryName.startsWith("ppt/slides/slide") && entryName.endsWith(".xml")
    else -> false
}

private fun extractXmlText(bytes: ByteArray): String {
    val factory = DocumentBuilderFactory.newInstance().apply {
        isNamespaceAware = true
        isXIncludeAware = false
        setExpandEntityReferences(false)
        setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true)
        setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)
        setFeature("http://xml.org/sax/features/external-general-entities", false)
        setFeature("http://xml.org/sax/features/external-parameter-entities", false)
    }
    val document = factory.newDocumentBuilder().parse(ByteArrayInputStream(bytes))
    val out = StringBuilder()
    fun walk(node: org.w3c.dom.Node) {
        if (node.nodeType == org.w3c.dom.Node.TEXT_NODE) {
            val text = node.nodeValue?.trim().orEmpty()
            if (text.isNotEmpty()) {
                if (out.isNotEmpty()) out.append(' ')
                out.append(text)
            }
        }
        val children = node.childNodes
        for (i in 0 until children.length) walk(children.item(i))
    }
    walk(document.documentElement)
    return out.toString()
}

private fun readLimitedBytes(input: InputStream, maxBytes: Int): ByteArray {
    val output = ByteArrayOutputStream(minOf(maxBytes, 64 * 1024))
    val buffer = ByteArray(16 * 1024)
    var total = 0
    while (true) {
        val read = input.read(buffer)
        if (read < 0) break
        total += read
        require(total <= maxBytes) { "문서 크기가 허용 한도를 초과합니다." }
        output.write(buffer, 0, read)
    }
    return output.toByteArray()
}

@Composable
internal fun InternalOfficePreview(preview: OfficePreview) {
    LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 8.dp)) {
        items(preview.sections) { section ->
            Text(section, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(bottom = 18.dp))
        }
    }
}
