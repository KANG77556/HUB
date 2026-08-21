package kr.co.alldocuments.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp

@Composable
internal fun TextDocumentEditor(
    text: String,
    onTextChange: (String) -> Unit
) {
    BasicTextField(
        value = text,
        onValueChange = onTextChange,
        modifier = Modifier
            .fillMaxSize()
            .background(Color.White)
            .padding(horizontal = 18.dp, vertical = 16.dp),
        textStyle = TextStyle(
            color = MaterialTheme.colorScheme.onSurface,
            fontSize = MaterialTheme.typography.bodyLarge.fontSize,
            lineHeight = MaterialTheme.typography.bodyLarge.lineHeight
        )
    )
}
