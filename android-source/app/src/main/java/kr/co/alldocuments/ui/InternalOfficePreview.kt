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
import java.util.zip.ZipInputStream
import javax.xml.parsers.DocumentBuilderFactory

internal data class OfficePreview(val sections: List<String>)

internal fun loadOfficePreview(resolver: ContentResolver, uri: Uri, name: String): OfficePreview {
    val bytes = resolver.openInputStream(uri)?.use { it.readBytes() } ?: error("문서를 열 수 없습니다.")
    require(bytes.size <= 50 * 1024 * 1024) { "문서가 50MB를 초과합니다." }
    val ext = name.substringAfterLast('.', "").lowercase()
    if (ext !in setOf("docx", "xlsx", "pptx")) return OfficePreview(listOf("이 형식은 내부 원본 미리보기를 지원하지 않습니다."))
    val entries = mutableMapOf<String, ByteArray>()
    ZipInputStream(ByteArrayInputStream(bytes)).use { zip ->
        while (true) {
            val entry = zip.nextEntry ?: break
            if (!entry.isDirectory) entries[entry.name] = zip.readBytes()
        }
    }
    val sections = when (ext) {
        "docx" -> listOfNotNull(entries["word/document.xml"]?.let(::extractXmlText))
        "xlsx" -> {
            val shared = entries["xl/sharedStrings.xml"]?.let(::extractXmlText).orEmpty()
            val sheets = entries.filterKeys { it.startsWith("xl/worksheets/sheet") && it.endsWith(".xml") }.toSortedMap().values.map(::extractXmlText)
            listOf(shared) + sheets
        }
        else -> entries.filterKeys { it.startsWith("ppt/slides/slide") && it.endsWith(".xml") }.toSortedMap().values.map(::extractXmlText)
    }.filter { it.isNotBlank() }
    return OfficePreview(sections.ifEmpty { listOf("문서에서 표시할 텍스트를 찾지 못했습니다.") })
}

private fun extractXmlText(bytes: ByteArray): String {
    val factory = DocumentBuilderFactory.newInstance().apply {
        isNamespaceAware = true
        setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)
        setFeature("http://xml.org/sax/features/external-general-entities", false)
        setFeature("http://xml.org/sax/features/external-parameter-entities", false)
    }
    val document = factory.newDocumentBuilder().parse(ByteArrayInputStream(bytes))
    val out = StringBuilder()
    fun walk(node: org.w3c.dom.Node) {
        if (node.nodeType == org.w3c.dom.Node.TEXT_NODE) {
            val text = node.nodeValue?.trim().orEmpty()
            if (text.isNotEmpty()) { if (out.isNotEmpty()) out.append(' '); out.append(text) }
        }
        val children = node.childNodes
        for (i in 0 until children.length) walk(children.item(i))
    }
    walk(document.documentElement)
    return out.toString()
}

@Composable
internal fun InternalOfficePreview(preview: OfficePreview) {
    LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 8.dp)) {
        items(preview.sections) { section ->
            Text(section, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(bottom = 18.dp))
        }
    }
}
