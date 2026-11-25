import { useState, type ChangeEvent } from "react";
import { Alert, Box, Button, LinearProgress, MenuItem, Paper, TextField, Typography } from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { useLang } from "../../i18n/LanguageContext";
import { errorText, importRows, type ImportKind, type ImportRowsResult } from "../../data/functions";
import { readSheetFile, SheetError } from "../../util/sheet";
import { DataTable } from "../../components/DataTable";
import { ErrorBox, ScreenTitle } from "../../components/ui";
import { useBranch } from "../../session/BranchContext";

const MAX_PER_CALL = 500; // contract: max 500 rows per importRows call

const KINDS: { id: ImportKind; te: string; en: string; columns: string }[] = [
  { id: "customers", te: "కస్టమర్లు", en: "Customers", columns: "name, phone, email, address, notes" },
  { id: "staff", te: "సిబ్బంది", en: "Staff", columns: "name, phone, jobRole, payType (daily/monthly), dailyWage, monthlySalary" },
  { id: "menuItems", te: "మెనూ ఐటమ్స్", en: "Menu items", columns: "nameTe, nameEn, category, pricePerPlate" },
  { id: "vendors", te: "సరఫరాదారులు", en: "Vendors", columns: "name, phone, address, notes" },
  { id: "leads", te: "ఎంక్వైరీలు (Leads)", en: "Leads", columns: "name, phone, source, eventDate (2026-12-05 లేదా 05/12/2026), guests, budget, followUpDate" },
];

export function ImportPage() {
  const { L, T, lang } = useLang();
  const { currentBranchId } = useBranch();
  const [kind, setKind] = useState<ImportKind>("customers");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [result, setResult] = useState<ImportRowsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    setResult(null);
    setError(null);
    if (!file) return;
    // R10-9: .xlsx / .xls (SheetJS) or .csv — same header mapping as the Android SheetReader.
    let parsed: { headers: string[]; rows: Record<string, string>[] };
    try {
      parsed = await readSheetFile(file);
    } catch (err) {
      setFileName("");
      setHeaders([]);
      setRows([]);
      setError(err instanceof SheetError ? L(err.te, err.en) : L("ఫైల్ చదవలేకపోయాం.", "Could not read the file."));
      return;
    }
    setFileName(file.name);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    if (parsed.rows.length === 0) setError(L("ఈ file లో వరుసలు లేవు.", "No rows found in this file."));
  }

  async function runImport() {
    if (!currentBranchId && kind === "leads") {
      setError(L("ముందు పైన శాఖ (branch) ఎంచుకోండి — ఎంక్వైరీలు ఆ శాఖకి చేరుతాయి.", "Select a branch first — the leads are added to that branch."));
      return;
    }
    if (!currentBranchId && kind === "staff") {
      setError(L("ముందు పైన శాఖ (branch) ఎంచుకోండి — సిబ్బంది ఆ శాఖకి చేరుతారు.", "Select a branch first — staff are added to that branch."));
      return;
    }
    setBusy(true);
    setError(null);
    setDone(0);
    const total: ImportRowsResult = { created: 0, skipped: [] };
    try {
      for (let start = 0; start < rows.length; start += MAX_PER_CALL) {
        const chunk = rows.slice(start, start + MAX_PER_CALL);
        const res = await importRows({ kind, rows: chunk, ...(currentBranchId ? { branchId: currentBranchId } : {}) });
        total.created += res.created;
        // Server rows are 1-based within the chunk (contract decision 8); shift to the file's data row.
        total.skipped.push(...res.skipped.map((s) => ({ ...s, row: s.row + start })));
        setDone(Math.min(rows.length, start + chunk.length));
      }
      setResult(total);
    } catch (e) {
      setResult(total.created || total.skipped.length ? total : null);
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  }

  const kindInfo = KINDS.find((k) => k.id === kind)!;
  const preview = rows.slice(0, 10).map((r, i) => ({ ...r, __i: String(i) }));

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100 }}>
      <ScreenTitle
        title={L("Excel / CSV దిగుమతి", "Excel / CSV import")}
        subtitle={L("పాత customers, సిబ్బంది, మెనూ, సరఫరాదారుల జాబితా ఒకేసారి ఎక్కించండి.", "Bring in old customers, staff, menu items or vendors in one go.")}
      />
      <Paper sx={{ p: 2.5, mb: 2, display: "grid", gap: 2 }}>
        <TextField select label={L("ఏమి ఎక్కిస్తున్నారు", "What are you importing")} value={kind} onChange={(e) => setKind(e.target.value as ImportKind)} sx={{ maxWidth: 320 }}>
          {KINDS.map((k) => (
            <MenuItem key={k.id} value={k.id}>
              {T(k)}
            </MenuItem>
          ))}
        </TextField>
        <Alert severity="info">
          {L("మొదటి వరుసలో ఈ column పేర్లు ఉండాలి:", "The first row must have these column names:")} <b>{kindInfo.columns}</b>.{" "}
          {L(
            "అదే ఫోన్ (మెనూకి అదే పేరు) ఇదివరకే ఉంటే ఆ వరుస వదిలేస్తాం.",
            "Rows whose phone (or menu name) already exists are skipped.",
          )}
        </Alert>
        <Box>
          <Button component="label" variant="outlined" startIcon={<UploadFileIcon />}>
            {L("Excel (.xlsx) / CSV file ఎంచుకోండి", "Choose Excel (.xlsx) / CSV file")}
            <input
              hidden
              type="file"
              accept=".xlsx,.xls,.csv,text/csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={onFile}
            />
          </Button>
          {fileName && (
            <Typography component="span" sx={{ ml: 2 }}>
              {fileName} — {L(`${rows.length} వరుసలు`, `${rows.length} rows`)}
            </Typography>
          )}
        </Box>
      </Paper>

      <ErrorBox message={error} />

      {rows.length > 0 && (
        <>
          <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
            {L("మొదటి 10 వరుసలు", "First 10 rows")}
          </Typography>
          <DataTable
            rows={preview}
            rowKey={(r) => r.__i}
            columns={headers.slice(0, 8).map((h) => ({ label: h, render: (r: Record<string, string>) => r[h] || "—" }))}
          />
          <Box sx={{ mt: 2, display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
            <Button variant="contained" onClick={runImport} disabled={busy}>
              {busy ? L("ఎక్కిస్తున్నాం…", "Importing…") : L(`${rows.length} వరుసలు ఎక్కించు`, `Import ${rows.length} rows`)}
            </Button>
            {busy && (
              <Box sx={{ flex: 1, minWidth: 200 }}>
                <LinearProgress variant="determinate" value={(done / rows.length) * 100} />
              </Box>
            )}
          </Box>
        </>
      )}

      {result && (
        <Paper sx={{ p: 2.5, mt: 3 }}>
          <Alert severity={result.skipped.length ? "warning" : "success"} sx={{ mb: 2 }}>
            {L(
              `${result.created} కొత్తవి చేర్చాం, ${result.skipped.length} వదిలేశాం.`,
              `${result.created} added, ${result.skipped.length} skipped.`,
            )}
          </Alert>
          {result.skipped.length > 0 && (
            <DataTable
              rows={result.skipped.map((s, i) => ({ ...s, key: String(i) }))}
              rowKey={(r) => r.key}
              columns={[
                { label: L("వరుస", "Row"), render: (r) => r.row },
                { label: L("కారణం", "Reason"), render: (r) => T(r.reason) },
              ]}
            />
          )}
        </Paper>
      )}
    </Box>
  );
}
