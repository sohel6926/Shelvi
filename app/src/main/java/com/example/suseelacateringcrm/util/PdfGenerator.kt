package com.example.suseelacateringcrm.util

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.pdf.PdfDocument
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream

/**
 * Minimal text-layout PDF generator using the platform's built-in PdfDocument API —
 * no external PDF library dependency. Good enough for simple document exports
 * (invoices, quotations, purchases, expenses); not a general-purpose layout engine.
 * R10-3: optional header lines (business), images (UPI QR, signature) and a footer line.
 */
object PdfGenerator {

    private const val PAGE_WIDTH = 595 // A4 at 72dpi
    private const val PAGE_HEIGHT = 842
    private const val MARGIN = 40f
    private const val LINE_HEIGHT = 20f

    /** An image placed after the text: [label] above it, drawn [sizePt] wide (height keeps the aspect ratio). */
    data class PdfImage(val label: String, val bitmap: Bitmap, val sizePt: Float = 140f)

    fun generateAndShare(
        context: Context,
        fileName: String,
        title: String,
        lines: List<String>,
        header: List<String> = emptyList(),
        images: List<PdfImage> = emptyList(),
        footer: String? = null,
    ) {
        val file = generate(context, fileName, title, lines, header, images, footer)
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "application/pdf"
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, "Share PDF"))
    }

    /** Downloads an image (e.g. settings.signatureUrl) for the PDF; null when missing or offline. */
    suspend fun loadBitmap(url: String): Bitmap? {
        if (url.isBlank()) return null
        return withContext(Dispatchers.IO) {
            try {
                java.net.URL(url).openStream().use { BitmapFactory.decodeStream(it) }
            } catch (e: Exception) {
                null
            }
        }
    }

    private fun generate(
        context: Context,
        fileName: String,
        title: String,
        lines: List<String>,
        header: List<String>,
        images: List<PdfImage>,
        footer: String?,
    ): File {
        val document = PdfDocument()
        val titlePaint = Paint().apply { textSize = 18f; isFakeBoldText = true }
        val headerPaint = Paint().apply { textSize = 13f; isFakeBoldText = true }
        val bodyPaint = Paint().apply { textSize = 12f }
        val smallPaint = Paint().apply { textSize = 10f }

        var pageNumber = 1
        var page = document.startPage(PdfDocument.PageInfo.Builder(PAGE_WIDTH, PAGE_HEIGHT, pageNumber).create())
        var canvas = page.canvas
        var y = MARGIN + 10f

        fun ensure(space: Float) {
            if (y + space > PAGE_HEIGHT - MARGIN) {
                document.finishPage(page)
                pageNumber++
                page = document.startPage(PdfDocument.PageInfo.Builder(PAGE_WIDTH, PAGE_HEIGHT, pageNumber).create())
                canvas = page.canvas
                y = MARGIN
            }
        }

        header.forEachIndexed { i, h ->
            canvas.drawText(h, MARGIN, y, if (i == 0) headerPaint else smallPaint)
            y += if (i == 0) LINE_HEIGHT else LINE_HEIGHT * 0.8f
        }
        if (header.isNotEmpty()) y += LINE_HEIGHT * 0.5f
        canvas.drawText(title, MARGIN, y, titlePaint)
        y += LINE_HEIGHT * 1.5f

        lines.forEach { line ->
            ensure(LINE_HEIGHT)
            canvas.drawText(line, MARGIN, y, bodyPaint)
            y += LINE_HEIGHT
        }

        // Images side by side (QR left, signature right).
        if (images.isNotEmpty()) {
            val maxH = images.maxOf { it.sizePt * it.bitmap.height / it.bitmap.width.coerceAtLeast(1) }
            ensure(maxH + LINE_HEIGHT * 2)
            y += LINE_HEIGHT * 0.5f
            var x = MARGIN
            images.forEach { img ->
                val h = img.sizePt * img.bitmap.height / img.bitmap.width.coerceAtLeast(1)
                canvas.drawText(img.label, x, y, smallPaint)
                canvas.drawBitmap(img.bitmap, Rect(0, 0, img.bitmap.width, img.bitmap.height), RectF(x, y + 6f, x + img.sizePt, y + 6f + h), null)
                x += img.sizePt + 60f
            }
            y += maxH + LINE_HEIGHT
        }

        footer?.takeIf { it.isNotBlank() }?.let {
            ensure(LINE_HEIGHT)
            canvas.drawText(it, MARGIN, y, smallPaint)
        }
        document.finishPage(page)

        val pdfDir = File(context.cacheDir, "pdfs").apply { mkdirs() }
        val file = File(pdfDir, fileName)
        FileOutputStream(file).use { document.writeTo(it) }
        document.close()
        return file
    }
}
