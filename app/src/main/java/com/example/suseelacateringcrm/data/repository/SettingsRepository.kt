package com.example.suseelacateringcrm.data.repository

import android.net.Uri
import com.example.suseelacateringcrm.data.model.BusinessSettings
import com.example.suseelacateringcrm.data.remote.CrmFunctions
import com.example.suseelacateringcrm.data.remote.FirestoreCollections
import com.example.suseelacateringcrm.data.remote.ImportResult
import com.example.suseelacateringcrm.util.snapshotsFlow
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.storage.FirebaseStorage
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await

/**
 * `settings/business`. Read straight from Firestore (works offline from the cache);
 * written only through the `saveBusinessSettings` callable (admin).
 */
class SettingsRepository(
    private val firestore: FirebaseFirestore,
    private val functions: CrmFunctions,
    private val storage: FirebaseStorage,
    private val context: android.content.Context,
) {
    private fun doc() = firestore.collection(FirestoreCollections.SETTINGS)
        .document(FirestoreCollections.SETTINGS_BUSINESS_DOC)

    /** Emits null until the owner has saved settings for the first time. */
    fun businessFlow(): Flow<BusinessSettings?> =
        doc().snapshotsFlow().map { snap ->
            if (snap.exists()) BusinessSettings.fromMap(snap.data ?: emptyMap()) else null
        }

    suspend fun getBusiness(): BusinessSettings? = try {
        val snap = doc().get().await()
        if (snap.exists()) BusinessSettings.fromMap(snap.data ?: emptyMap()) else null
    } catch (e: Exception) {
        null
    }

    /** Partial update; returns the server's setupProgress. */
    suspend fun save(fields: Map<String, Any?>): Result<com.example.suseelacateringcrm.data.remote.SetupProgress> =
        functions.saveBusinessSettings(fields)

    /**
     * Uploads a picked image (logo, signature, food / menu photo) and returns its download URL.
     * The photo is shrunk first (≤ 1600 px, JPEG ~80 %, ≤ 5 MB — storage.rules limit).
     */
    suspend fun uploadImage(folder: String, uri: Uri): String {
        val bytes = com.example.suseelacateringcrm.util.ImageCompress.jpegBytes(context, uri)
        val ref = storage.reference.child("$folder/${System.currentTimeMillis()}.jpg")
        ref.putBytes(bytes, com.example.suseelacateringcrm.util.ImageCompress.jpegMetadata).await()
        return ref.downloadUrl.await().toString()
    }

    /** kind: customers | staff | menuItems | vendors. At most 500 rows per call (sent in chunks). */
    suspend fun importRows(kind: String, rows: List<Map<String, Any?>>): Result<ImportResult> {
        var created = 0
        val skipped = mutableListOf<com.example.suseelacateringcrm.data.remote.SkippedRow>()
        rows.chunked(500).forEachIndexed { chunkIndex, chunk ->
            val r = functions.importRows(kind, chunk)
            val value = r.getOrElse { return Result.failure(it) }
            created += value.created
            // Row numbers from the server are per chunk; shift them back to the file's row numbers.
            skipped += value.skipped.map { it.copy(row = it.row + chunkIndex * 500) }
        }
        return Result.success(ImportResult(created, skipped))
    }
}
