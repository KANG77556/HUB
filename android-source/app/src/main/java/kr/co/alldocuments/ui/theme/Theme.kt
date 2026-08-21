package kr.co.alldocuments.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DocumentBrowserColors = lightColorScheme(
    primary = Color(0xFF2563EB),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFEAF1FF),
    onPrimaryContainer = Color(0xFF163A75),
    background = Color(0xFFF7F8FA),
    onBackground = Color(0xFF111827),
    surface = Color.White,
    onSurface = Color(0xFF111827),
    surfaceVariant = Color(0xFFF1F3F6),
    onSurfaceVariant = Color(0xFF5F6877),
    outline = Color(0xFFD8DDE6),
    outlineVariant = Color(0xFFE8EBF0)
)

@Composable
fun AllDocumentsTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DocumentBrowserColors,
        content = content
    )
}
