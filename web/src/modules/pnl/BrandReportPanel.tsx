import { useState } from "react";
import { Alert, Box, Button, CircularProgress, Paper, TextField, Typography } from "@mui/material";
import { useLang } from "../../i18n/LanguageContext";
import { brandReport, errorText, type BrandReportResult } from "../../data/functions";
import { DataTable } from "../../components/DataTable";
import { istDay } from "../../util/dates";

const rupees = (n: number) => `${n < 0 ? "− " : ""}₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

/**
 * Module 5b — revenue and direct cost by brand (brand rule 3 of Master Data Freeze 01). Events and invoices dated in
 * the period; bills and expenses tagged to an event count for that event's brand. Report only (brandReport).
 */
export function BrandReportPanel() {
  const { L, lang } = useLang();
  const today = istDay();
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BrandReportResult | null>(null);

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      setData(await brandReport({ from, to }));
    } catch (e) {
      setData(null);
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, mt: 3 }}>
      <Typography variant="subtitle1">{L("బ్రాండ్ వారీ ఆదాయం, ఖర్చు", "Revenue and cost by brand")}</Typography>
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center", mt: 1 }}>
        <TextField size="small" type="date" label={L("నుంచి", "From")} value={from} onChange={(e) => setFrom(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField size="small" type="date" label={L("వరకు", "To")} value={to} onChange={(e) => setTo(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <Button variant="contained" onClick={() => void load()} disabled={busy || !from || !to || from > to} startIcon={busy ? <CircularProgress size={18} color="inherit" /> : undefined}>
          {L("చూపించు", "Show")}
        </Button>
      </Box>
      {error && (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          {error}
        </Alert>
      )}
      {data && (
        <Box sx={{ mt: 2, maxWidth: "100%", overflowX: "auto" }}>
          <DataTable
            rows={data.lines}
            rowKey={(r) => r.brandId || "none"}
            emptyText={L("ఇంకా బ్రాండ్‌లు లేవు — ముందు \"కంపెనీ · బ్రాండ్ · శాఖలు\" తెరలో ఏర్పాటు చేయండి.", "No brands yet — set them up on the \"Company · Brands · Branches\" page first.")}
            columns={[
              { label: L("బ్రాండ్", "Brand"), render: (r) => r.name || L("బ్రాండ్ తెలియనివి", "No brand") },
              { label: L("కార్యక్రమాలు", "Events"), align: "right", render: (r) => String(r.events) },
              { label: L("ఇన్వాయిస్ మొత్తం", "Invoiced"), align: "right", render: (r) => rupees(r.invoiced) },
              { label: L("వచ్చింది", "Received"), align: "right", hideOnMobile: true, render: (r) => rupees(r.received) },
              { label: L("రావలసింది", "Due"), align: "right", hideOnMobile: true, render: (r) => rupees(r.due) },
              { label: L("నేరు ఖర్చు", "Direct cost"), align: "right", render: (r) => rupees(r.directCost) },
              {
                label: L("మిగులు", "Margin"),
                align: "right",
                render: (r) => (
                  <Box component="span" sx={{ fontWeight: 600, color: r.margin < 0 ? "error.main" : undefined }}>
                    {rupees(r.margin)}
                    {r.marginPct !== null ? ` (${r.marginPct}%)` : ""}
                  </Box>
                ),
              },
            ]}
            footer={data.lines.length > 1 ? [L("మొత్తం", "Total"), String(data.totals.events), rupees(data.totals.invoiced), rupees(data.totals.received), rupees(data.totals.due), rupees(data.totals.directCost), rupees(data.totals.margin)] : undefined}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            {L("నేరు ఖర్చు = ఒక కార్యక్రమానికి గుర్తించిన కొనుగోళ్లు, ఖర్చులు. అద్దె, జీతాల వంటి సాధారణ ఖర్చులు ఇందులో లేవు.", "Direct cost = bills and expenses tagged to an event. Overheads such as rent and salaries are not included.")}
          </Typography>
        </Box>
      )}
    </Paper>
  );
}
