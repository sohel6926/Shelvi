package com.example.suseelacateringcrm.util

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import com.google.firebase.storage.StorageMetadata
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Shrinks a picked photo before upload: longest side ≤ 1600 px, JPEG ~80 %, rotated upright from
 * the camera's EXIF tag, and never more than 5 MB (storage.rules limit) — quality steps down if needed.
 */
object ImageCompress {
    const val MAX_SIDE = 1600
    const val MAX_BYTES = 5 * 1024 * 1024

    class TooLargeError : Exception("Photo is larger than 5 MB even after compression")

    val jpegMetadata: StorageMetadata
        get() = StorageMetadata.Builder().setContentType("image/jpeg").build()

    suspend fun jpegBytes(context: Context, uri: Uri): ByteArray = withContext(Dispatchers.IO) {
        val resolver = context.contentResolver
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        val longest = max(bounds.outWidth, bounds.outHeight)
        var sample = 1
        while (longest > 0 && longest / (sample * 2) >= MAX_SIDE) sample *= 2

        val decoded = resolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
        } ?: throw IllegalArgumentException("Could not read the photo")

        // Scale the rest of the way down to MAX_SIDE.
        val side = max(decoded.width, decoded.height)
        var bitmap: Bitmap = if (side > MAX_SIDE) {
            val f = MAX_SIDE.toFloat() / side
            Bitmap.createScaledBitmap(decoded, (decoded.width * f).roundToInt(), (decoded.height * f).roundToInt(), true)
                .also { if (it !== decoded) decoded.recycle() }
        } else decoded

        // Camera photos are often stored sideways with an EXIF rotation tag.
        val degrees = try {
            resolver.openInputStream(uri)?.use { input ->
                when (ExifInterface(input).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
                    ExifInterface.ORIENTATION_ROTATE_90 -> 90f
                    ExifInterface.ORIENTATION_ROTATE_180 -> 180f
                    ExifInterface.ORIENTATION_ROTATE_270 -> 270f
                    else -> 0f
                }
            } ?: 0f
        } catch (e: Exception) {
            0f
        }
        if (degrees != 0f) {
            val m = Matrix().apply { postRotate(degrees) }
            val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, m, true)
            if (rotated !== bitmap) bitmap.recycle()
            bitmap = rotated
        }

        var quality = 80
        var bytes: ByteArray
        do {
            val out = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out)
            bytes = out.toByteArray()
            quality -= 15
        } while (bytes.size > MAX_BYTES && quality >= 35)
        bitmap.recycle()
        if (bytes.size > MAX_BYTES) throw TooLargeError()
        bytes
    }
}
