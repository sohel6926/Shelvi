import { useRef, useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, MenuItem, Paper, TextField, Typography } from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { useLang } from "../../i18n/LanguageContext";
import { errorText, reconcileStatement, type ReconResult } from "../../data/functions";
import { DataTable } from "../../components/DataTable";
import { formatDay } from "../../util/dates";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The uploaded file as rows of cells, untouched: real Excel dates stay day numbers, text stays text. */
async function readGrid(file: File): Promise<unknown[][]> {
  const XLSX = await import("xlsx");
  const isExcel = /\.xlsx?$/i.test(file.name);
  const wb = isExcel ? XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false }) : XLSX.read((await file.text()).replace(/^﻿/, ""), { type: "string", raw: true });
  const first = wb.SheetNames[0];
  if (!first) return [];
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[first], { header: 1, raw: true, defval: "", blankrows: false });
}

/**
 * Module 4f — bank / UPI statement check. Upload the statement file the bank gives (Excel or CSV); the server pairs
 * every line with the books (same amount, same direction, date within a few days) and this panel shows what is left
 * over on each side. Nothing is saved — fix the CRM entries, then upload again.
 */
export function BankReconPanel() {
  const { L, lang } = useLang();
  const input = useRef<HTMLInputElement>(null);
  const [account, setAccount] = useState("1010");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReconResult | null>(null);
  const [fileName, setFileName] = useState("");

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setFileName(file.name);
    try {
      let grid: unknown[][];
      try {
        grid = await readGrid(file);
      } catch {
        throw new Error(L("ఈ ఫైల్ చదవలేకపోయాం. .xlsx లేదా .csv గా సేవ్ చేసి మళ్ళీ ప్రయత్నించండి.", "Could not read this file. Save it as .xlsx or .csv and try again."));
      }
      setResult(await reconcileStatement({ grid: grid.slice(0, 5000), account }));
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const clean = result !== null && result.onlyStatement.length === 0 && result.onlyBooks.length === 0;

  return (
    <Paper variant="outlined" sx={{ p: 2, mt: 3 }}>
      <Typography variant="subtitle1">{L("బ్యాంక్ స్టేట్‌మెంట్ సరిపోల్చడం", "Bank statement check")}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {L(
          "బ్యాంక్ ఇచ్చిన స్టేట్‌మెంట్ ఫైల్ (Excel / CSV) అప్‌లోడ్ చేయండి. CRM లో నమోదైన వాటితో పోల్చి, తేడాలు చూపిస్తాం. ఏదీ సేవ్ కాదు.",
          "Upload the statement file from the bank (Excel / CSV). It is compared with what is entered in the CRM and the differences are shown. Nothing is saved.",
        )}
      </Typography>
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
        <TextField select size="small" label={L("ఖాతా", "Account")} value={account} onChange={(e) => setAccount(e.target.value)} sx={{ minWidth: 180 }}>
          <MenuItem value="1010">{L("బ్యాంక్ / UPI", "Bank / UPI")}</MenuItem>
          <MenuItem value="1000">{L("నగదు", "Cash")}</MenuItem>
        </TextField>
        <input ref={input} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
        <Button variant="contained" startIcon={busy ? <CircularProgress size={18} color="inherit" /> : <UploadFileIcon />} disabled={busy} onClick={() => input.current?.click()}>
          {L("స్టేట్‌మెంట్ ఫైల్ ఎంచుకో", "Choose statement file")}
        </Button>
        {fileName && <Typography variant="caption">{fileName}</Typography>}
      </Box>
      {error && (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          {error}
        </Alert>
      )}
      {result && (
        <Box sx={{ mt: 2, display: "grid", gap: 2 }}>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Chip label={`${formatDay(result.from, lang)} – ${formatDay(result.to, lang)}`} />
            <Chip label={L(`స్టేట్‌మెంట్ వరుసలు ${result.statementRows}`, `Statement lines ${result.statementRows}`)} />
            <Chip color="success" label={L(`సరిపోయినవి ${result.matchedCount}`, `Matched ${result.matchedCount}`)} />
            <Chip color={result.onlyStatement.length ? "error" : "default"} label={L(`CRM లో లేనివి ${result.onlyStatement.length}`, `Not in the CRM ${result.onlyStatement.length}`)} />
            <Chip color={result.onlyBooks.length ? "warning" : "default"} label={L(`బ్యాంక్‌లో లేనివి ${result.onlyBooks.length}`, `Not at the bank ${result.onlyBooks.length}`)} />
            {result.skipped > 0 && <Chip variant="outlined" label={L(`చదవని వరుసలు ${result.skipped}`, `Lines not read ${result.skipped}`)} />}
          </Box>
          {clean && <Alert severity="success">{L("స్టేట్‌మెంట్, CRM పూర్తిగా సరిపోయాయి.", "The statement and the CRM agree completely.")}</Alert>}
          {result.onlyStatement.length > 0 && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                {L("బ్యాంక్‌లో ఉంది, CRM లో నమోదు కాలేదు", "At the bank, not entered in the CRM")} · {L("వచ్చింది", "in")} {rupees(result.totals.unmatchedStatementIn)} · {L("పోయింది", "out")} {rupees(result.totals.unmatchedStatementOut)}
              </Typography>
              <DataTable
                rows={result.onlyStatement}
                rowKey={(r) => String(r.line)}
                emptyText=""
                columns={[
                  { label: L("తేదీ", "Date"), render: (r) => formatDay(r.day, lang) },
                  { label: L("వివరం", "Details"), render: (r) => [r.text, r.ref].filter(Boolean).join(" · ") || "—" },
                  { label: L("వచ్చింది", "In"), align: "right", render: (r) => (r.moneyIn ? rupees(r.moneyIn) : "—") },
                  { label: L("పోయింది", "Out"), align: "right", render: (r) => (r.moneyOut ? rupees(r.moneyOut) : "—") },
                ]}
              />
            </Box>
          )}
          {result.onlyBooks.length > 0 && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                {L("CRM లో ఉంది, బ్యాంక్ స్టేట్‌మెంట్‌లో లేదు", "In the CRM, not on the bank statement")} · {L("వచ్చింది", "in")} {rupees(result.totals.unmatchedBooksIn)} · {L("పోయింది", "out")} {rupees(result.totals.unmatchedBooksOut)}
              </Typography>
              <DataTable
                rows={result.onlyBooks}
                rowKey={(r) => `${r.collection}/${r.id}/${r.moneyIn}/${r.moneyOut}`}
                emptyText=""
                columns={[
                  { label: L("తేదీ", "Date"), render: (r) => formatDay(r.day, lang) },
                  { label: L("వివరం", "Details"), render: (r) => r.memo },
                  { label: L("వచ్చింది", "In"), align: "right", render: (r) => (r.moneyIn ? rupees(r.moneyIn) : "—") },
                  { label: L("పోయింది", "Out"), align: "right", render: (r) => (r.moneyOut ? rupees(r.moneyOut) : "—") },
                ]}
              />
              <Typography variant="caption" color="text.secondary">
                {L("కారణాలు: చెల్లింపు విధానం తప్పుగా ఎంచుకున్నారు (నగదు బదులు UPI), మొత్తం తేడా, లేదా బ్యాంక్‌లో ఇంకా పడలేదు.", "Usual reasons: the wrong payment method was chosen (UPI instead of cash), the amount differs, or the bank has not shown it yet.")}
              </Typography>
            </Box>
          )}
        </Box>
      )}
    </Paper>
  );
}
