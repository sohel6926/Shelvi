import { parseCsv } from "./csv";

/**
 * R10-9: read an import file — .xlsx / .xls (SheetJS, loaded only when needed) or .csv — into rows keyed by the
 * header row. Same rules as Android util/SheetReader.kt: first sheet only, empty rows dropped, values trimmed,
 * common Telugu / English column names mapped to the field names the server expects.
 */
export class SheetError extends Error {
  te: string;
  en: string;
  constructor(te: string, en: string) {
    super(en);
    this.name = "SheetError";
    this.te = te;
    this.en = en;
  }
}

/** Common Telugu / English column names → importRows field names (mirrors SheetReader.normaliseHeader). */
export function normaliseHeader(raw: string): string {
  const h = raw.trim().toLowerCase().replace(/[\s_\-.]+/g, " ");
  switch (h) {
    case "name":
    case "customer name":
    case "staff name":
    case "item name":
    case "vendor name":
    case "పేరు":
      return "name";
    case "phone":
    case "mobile":
    case "phone number":
    case "mobile number":
    case "contact":
    case "ఫోన్":
    case "మొబైల్":
      return "phone";
    case "address":
    case "చిరునామా":
      return "address";
    case "email":
    case "e mail":
    case "ఇమెయిల్":
      return "email";
    case "notes":
    case "note":
    case "remarks":
    case "గమనిక":
    case "గమనికలు":
      return "notes";
    case "role":
    case "job":
    case "job role":
    case "jobrole":
    case "పని":
      return "jobRole";
    case "daily wage":
    case "dailywage":
    case "wage":
    case "కూలి":
    case "రోజు కూలి":
      return "dailyWage";
    case "monthly salary":
    case "monthlysalary":
    case "salary":
    case "జీతం":
    case "నెల జీతం":
      return "monthlySalary";
    case "pay type":
    case "paytype":
      return "payType";
    case "price":
    case "rate":
    case "price per plate":
    case "priceperplate":
    case "ధర":
      return "pricePerPlate";
    case "category":
    case "రకం":
      return "category";
    case "telugu name":
    case "name te":
    case "namete":
    case "తెలుగు పేరు":
      return "nameTe";
    case "english name":
    case "name en":
    case "nameen":
      return "nameEn";
    default:
      return raw.trim();
  }
}

function tableToObjects(table: string[][]): { headers: string[]; rows: Record<string, string>[] } {
  const nonEmpty = table.filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };
  const headers = nonEmpty[0].map((h) => normaliseHeader(String(h ?? "")));
  const rows = nonEmpty.slice(1).map((cells) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (h) obj[h] = String(cells[i] ?? "").trim();
    });
    return obj;
  });
  return { headers: headers.filter(Boolean), rows };
}

export function isExcelFile(name: string): boolean {
  return /\.xlsx?$/i.test(name);
}

export async function readSheetFile(file: File): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  if (isExcelFile(file.name)) {
    const XLSX = await import("xlsx");
    let wb;
    try {
      wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
    } catch {
      throw new SheetError("ఈ Excel file చదవలేకపోయాం. .xlsx లేదా .csv గా మళ్ళీ save చేసి ప్రయత్నించండి.", "Could not read this Excel file. Save it again as .xlsx or .csv and retry.");
    }
    const first = wb.SheetNames[0];
    if (!first) throw new SheetError("ఫైల్ ఖాళీగా ఉంది", "The file is empty");
    // raw: false → the text Excel shows (numbers, dates as formatted); defval "" keeps empty cells in place.
    const table = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[first], { header: 1, raw: false, defval: "", blankrows: false });
    return tableToObjects(table.map((r) => r.map((c) => String(c ?? ""))));
  }
  const text = (await file.text()).replace(/^﻿/, "");
  return tableToObjects(parseCsv(text));
}
