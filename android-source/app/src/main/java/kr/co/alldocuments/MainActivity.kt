package kr.co.alldocuments

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import kr.co.alldocuments.ui.AllDocumentsApp
import kr.co.alldocuments.ui.theme.AllDocumentsTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            AllDocumentsTheme {
                AllDocumentsApp()
            }
        }
    }
}
