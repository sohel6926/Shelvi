package com.example.suseelacateringcrm.util

import android.content.Context
import android.net.Uri
import android.util.Xml
import org.xmlpull.v1.XmlPullParser
import java.io.ByteArrayInputStream
import java.util.zip.ZipInputStream

/**
 * Reads the first sheet of an Excel .xlsx file, or a .csv file, into rows keyed by the header row.
 * Lightweight on purpose (no Apache POI): .xlsx is a zip of XML; we read the shared strings and
 * the first worksheet only. Formulas give their last saved value; dates come as Excel serial numbers.
 * Old .xls (Excel 97) files are not supported — save them as .xlsx or .csv first.
 */
object SheetReader {

    class SheetError(val te: String, val en: String) : Exception(en)

    fun read(context: Context, uri: Uri): List<Map<String, String>> {
        val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
            ?: throw SheetError("ఫైల్ తెరవలేకపోయాం", "Could not open the file")
        val table = when {
            bytes.size >= 2 && bytes[0] == 'P'.code.toByte() && bytes[1] == 'K'.code.toByte() -> readXlsx(bytes)
            bytes.size >= 4 && bytes[0] == 0xD0.toByte() && bytes[1] == 0xCF.toByte() ->
                throw SheetError("పాత .xls ఫైల్. Excel లో .xlsx లేదా .csv గా save చేయండి.", "Old .xls file. Save it as .xlsx or .csv in Excel.")
            else -> readCsv(String(bytes, Charsets.UTF_8).removePrefix("﻿"))
        }
        if (table.isEmpty()) throw SheetError("ఫైల్ ఖాళీగా ఉంది", "The file is empty")
        val headers = table.first().map { normaliseHeader(it) }
        return table.drop(1)
            .filter { row -> row.any { it.isNotBlank() } }
            .map { row ->
                headers.withIndex()
                    .filter { it.value.isNotBlank() }
                    .associate { (i, h) -> h to (row.getOrNull(i) ?: "").trim() }
            }
    }

    /** Common Telugu / English column names → the field names the server expects. */
    private fun normaliseHeader(raw: String): String {
        val h = raw.trim().lowercase().replace(Regex("[\\s_\\-.]+"), " ")
        return when (h) {
            "name", "customer name", "staff name", "item name", "vendor name", "పేరు" -> "name"
            "phone", "mobile", "phone number", "mobile number", "contact", "ఫోన్", "మొబైల్" -> "phone"
            "address", "చిరునామా" -> "address"
            "email", "e mail", "ఇమెయిల్" -> "email"
            "notes", "note", "remarks", "గమనిక", "గమనికలు" -> "notes"
            "role", "job", "job role", "పని" -> "jobRole"
            "daily wage", "wage", "కూలి", "రోజు కూలి" -> "dailyWage"
            "monthly salary", "salary", "జీతం", "నెల జీతం" -> "monthlySalary"
            "pay type", "paytype" -> "payType"
            "price", "rate", "price per plate", "ధర" -> "pricePerPlate"
            "category", "రకం" -> "category"
            "telugu name", "name te", "nameTe".lowercase(), "తెలుగు పేరు" -> "nameTe"
            "english name", "name en", "nameEn".lowercase() -> "nameEn"
            else -> raw.trim()
        }
    }

    // ---- CSV (RFC 4180-ish: quotes, escaped quotes, commas/newlines inside quotes) ----------

    private fun readCsv(text: String): List<List<String>> {
        val rows = mutableListOf<List<String>>()
        var row = mutableListOf<String>()
        val cell = StringBuilder()
        var inQuotes = false
        var i = 0
        while (i < text.length) {
            val c = text[i]
            if (inQuotes) {
                if (c == '"') {
                    if (i + 1 < text.length && text[i + 1] == '"') {
                        cell.append('"'); i++
                    } else inQuotes = false
                } else cell.append(c)
            } else when (c) {
                '"' -> inQuotes = true
                ',' -> { row.add(cell.toString()); cell.setLength(0) }
                '\r' -> {}
                '\n' -> { row.add(cell.toString()); cell.setLength(0); rows.add(row); row = mutableListOf() }
                else -> cell.append(c)
            }
            i++
        }
        if (cell.isNotEmpty() || row.isNotEmpty()) { row.add(cell.toString()); rows.add(row) }
        return rows
    }

    // ---- XLSX ----------------------------------------------------------------------------

    private fun readXlsx(bytes: ByteArray): List<List<String>> {
        var shared: ByteArray? = null
        var sheet: ByteArray? = null
        var firstSheetName: String? = null
        ZipInputStream(ByteArrayInputStream(bytes)).use { zip ->
            var entry = zip.nextEntry
            while (entry != null) {
                val name = entry.name
                when {
                    name == "xl/sharedStrings.xml" -> shared = zip.readBytes()
                    name.startsWith("xl/worksheets/sheet") && name.endsWith(".xml") -> {
                        // Keep the lowest-numbered sheet (sheet1.xml normally).
                        if (firstSheetName == null || name < firstSheetName!!) {
                            firstSheetName = name
                            sheet = zip.readBytes()
                        }
                    }
                }
                entry = zip.nextEntry
            }
        }
        val strings = shared?.let { parseSharedStrings(it) } ?: emptyList()
        val sheetBytes = sheet ?: throw SheetError("Excel లో sheet దొరకలేదు", "No worksheet found in the Excel file")
        return parseSheet(sheetBytes, strings)
    }

    private fun parser(bytes: ByteArray): XmlPullParser =
        Xml.newPullParser().apply {
            setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, false)
            setInput(ByteArrayInputStream(bytes), "UTF-8")
        }

    private fun parseSharedStrings(bytes: ByteArray): List<String> {
        val out = mutableListOf<String>()
        val p = parser(bytes)
        val current = StringBuilder()
        var inSi = false
        var inT = false
        var event = p.eventType
        while (event != XmlPullParser.END_DOCUMENT) {
            when (event) {
                XmlPullParser.START_TAG -> when (p.name) {
                    "si" -> { inSi = true; current.setLength(0) }
                    "t" -> inT = inSi
                }
                XmlPullParser.TEXT -> if (inT) current.append(p.text)
                XmlPullParser.END_TAG -> when (p.name) {
                    "t" -> inT = false
                    "si" -> { out.add(current.toString()); inSi = false }
                }
            }
            event = p.next()
        }
        return out
    }

    private fun columnIndex(ref: String): Int {
        var n = 0
        for (ch in ref) {
            if (ch in 'A'..'Z') n = n * 26 + (ch - 'A' + 1) else break
        }
        return n - 1
    }

    private fun parseSheet(bytes: ByteArray, strings: List<String>): List<List<String>> {
        val rows = mutableListOf<List<String>>()
        var row = sortedMapOf<Int, String>()
        var cellType = ""
        var cellCol = 0
        var nextCol = 0
        val value = StringBuilder()
        var inValue = false
        val p = parser(bytes)
        var event = p.eventType
        while (event != XmlPullParser.END_DOCUMENT) {
            when (event) {
                XmlPullParser.START_TAG -> when (p.name) {
                    "row" -> { row = sortedMapOf(); nextCol = 0 }
                    "c" -> {
                        cellType = p.getAttributeValue(null, "t") ?: ""
                        val ref = p.getAttributeValue(null, "r")
                        cellCol = if (ref != null) columnIndex(ref) else nextCol
                        value.setLength(0)
                    }
                    "v", "t" -> inValue = true
                }
                XmlPullParser.TEXT -> if (inValue) value.append(p.text)
                XmlPullParser.END_TAG -> when (p.name) {
                    "v", "t" -> inValue = false
                    "c" -> {
                        val raw = value.toString()
                        val text = when (cellType) {
                            "s" -> raw.trim().toIntOrNull()?.let { strings.getOrNull(it) } ?: ""
                            "b" -> if (raw == "1") "TRUE" else "FALSE"
                            else -> cleanNumber(raw)
                        }
                        if (cellCol >= 0) row[cellCol] = text
                        nextCol = cellCol + 1
                    }
                    "row" -> {
                        val width = (row.keys.maxOrNull() ?: -1) + 1
                        rows.add((0 until width).map { row[it] ?: "" })
                    }
                }
            }
            event = p.next()
        }
        return rows
    }

    /** "9966649469.0" or "9.966649469E9" (phone numbers stored as numbers) → "9966649469". */
    private fun cleanNumber(raw: String): String {
        val d = raw.toDoubleOrNull() ?: return raw
        return if (d == Math.floor(d) && !d.isInfinite() && kotlin.math.abs(d) < 1e15) d.toLong().toString() else raw
    }
}
