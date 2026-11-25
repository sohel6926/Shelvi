package com.example.suseelacateringcrm.ui.components

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.example.suseelacateringcrm.di.ServiceLocator
import com.example.suseelacateringcrm.util.L
import kotlinx.coroutines.launch

/**
 * Pick up to 10 photos and upload them to Storage [folder] (api-contract "Manager uploads":
 * gallery/… food photos, menus/… menu photos — admin and manager). [onUploaded] gets the URLs.
 */
@Composable
fun PhotoUploadButton(
    folder: String,
    label: String,
    modifier: Modifier = Modifier,
    onUploaded: suspend (List<String>) -> Unit = {},
) {
    val scope = rememberCoroutineScope()
    var status by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(10)) { uris ->
        if (uris.isEmpty()) return@rememberLauncherForActivityResult
        scope.launch {
            busy = true
            val urls = mutableListOf<String>()
            var failed = 0
            for (uri in uris) {
                try {
                    urls += ServiceLocator.settingsRepository.uploadImage(folder, uri)
                } catch (e: Exception) {
                    failed++
                }
            }
            try { if (urls.isNotEmpty()) onUploaded(urls) } catch (e: Exception) { failed++ }
            busy = false
            status = L("${urls.size} ఫోటోలు upload అయ్యాయి", "${urls.size} photos uploaded") +
                if (failed > 0) L(" · $failed కాలేదు", " · $failed failed") else ""
        }
    }
    Column(modifier) {
        OutlinedButton(
            onClick = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
            enabled = !busy,
        ) { Text(if (busy) L("Upload అవుతోంది…", "Uploading…") else label) }
        status?.let { Text(it, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 2.dp)) }
    }
}
