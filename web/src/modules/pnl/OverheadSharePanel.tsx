import { useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, MenuItem, Paper, TextField, Typography } from "@mui/material";
import { useLang } from "../../i18n/LanguageContext";
import { errorText, overheadShare, type OverheadShareResult } from "../../data/functions";
import { DataTable } from "../../components/DataTable";
import { formatDay, istMonth } from "../../util/dates";

const rupees = (n: number) => `${n < 0 ? "− " : ""}₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const CENTRE: Record<string, { te: string; en: string }> = {
  salaries: { te: "నెల జీతాలు", en: "Monthly salaries" },
  "kitchen-rent": { te: "వంటశాల అద్దె", en: "Kitchen rent" },
  utilities: { te: "కరెంట్ / నీళ్ళు / గ్యాస్", en: "Utilities" },
  office: { te: "ఆఫీస్", en: "Office" },
  marketing: { te: "ప్రచారం", en: "Marketing" },
  vehicles: { te: "వాహనాలు", en: "Vehicles" },
  maintenance: { te: "మరమ్మతులు", en: "Maintenance" },
  general: { te: "సాధారణ ఖర్చులు", en: "General" },
};

/**
 * Module 4h — the month's overheads (rent, power, office, vehicles, monthly salaries) shared among that month's
 * events, so each event shows what it really left. Report only (overheadShare); nothing is stored.
 */
export function OverheadSharePanel() {
  const { L, lang } = useLang();
  const [month, setMonth] = useState(istMonth());
  const [basis, setBasis] = useState("income");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OverheadShareResult | null>(null);

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      setData(await overheadShare({ month, basis }));
    } catch (e) {
      setData(null);
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, mt: 3 }}>
      <Typography variant="subtitle1">{L("సాధారణ ఖర్చులు పంచిన తర్వాత ఈవెంట్ లాభం", "Event profit after sharing overheads")}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {L(
          "అద్దె, కరెంట్, ఆఫీస్, వాహనాలు, నెల జీతాలు — ఏ ఈవెంట్‌కూ చెందని ఖర్చులను ఆ నెల ఈవెంట్లకు పంచి, ప్రతి ఈవెంట్ నిజంగా ఎంత మిగిల్చిందో చూపిస్తుంది.",
          "Rent, power, office, vehicles, monthly salaries — costs that belong to no single event — are shared among the month's events to show what each one really left.",
        )}
      </Typography>
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
        <TextField size="small" type="month" label={L("నెల", "Month")} value={month} onChange={(e) => setMonth(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField select size="small" label={L("ఎలా పంచాలి", "Share by")} value={basis} onChange={(e) => setBasis(e.target.value)} sx={{ minWidth: 200 }}>
          <MenuItem value="income">{L("ఆదాయం బట్టి", "By income")}</MenuItem>
          <MenuItem value="guests">{L("అతిథుల సంఖ్య బట్టి", "By number of guests")}</MenuItem>
          <MenuItem value="equal">{L("అన్నింటికీ సమానంగా", "Equally")}</MenuItem>
        </TextField>
        <Button variant="contained" onClick={() => void load()} disabled={busy || !/^\d{4}-\d{2}$/.test(month)} startIcon={busy ? <CircularProgress size={18} color="inherit" /> : undefined}>
          {L("చూపించు", "Show")}
        </Button>
      </Box>
      {error && (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          {error}
        </Alert>
      )}
      {data && (
        <Box sx={{ mt: 2, display: "grid", gap: 1.5 }}>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Chip color="primary" label={L(`పంచే మొత్తం ${rupees(data.pool.total)}`, `To share ${rupees(data.pool.total)}`)} />
            {data.pool.byCentre.map((c) => (
              <Chip key={c.centre} variant="outlined" label={`${L(CENTRE[c.centre]?.te ?? c.centre, CENTRE[c.centre]?.en ?? c.centre)} ${rupees(c.amount)}`} />
            ))}
          </Box>
          {data.basisUsed !== data.basis && <Alert severity="info">{L("ఎంచుకున్న విధానానికి అంకెలు లేవు (ఆదాయం / అతిథుల సంఖ్య సున్నా), కాబట్టి సమానంగా పంచాం.", "There were no figures for the chosen way (income / guest counts are zero), so it was shared equally.")}</Alert>}
          {data.lines.length === 0 ? (
            <Alert severity="info">{L("ఈ నెలలో ఈవెంట్లు లేవు.", "No events in this month.")}</Alert>
          ) : (
            <Box sx={{ maxWidth: "100%", overflowX: "auto" }}>
              <DataTable
                rows={data.lines}
                rowKey={(r) => r.id}
                emptyText=""
                columns={[
                  { label: L("తేదీ", "Date"), render: (r) => formatDay(r.day, lang) },
                  { label: L("ఈవెంట్", "Event"), render: (r) => r.name },
                  { label: L("ఆదాయం", "Income"), align: "right", render: (r) => rupees(r.income) },
                  { label: L("నేరు ఖర్చు", "Direct cost"), align: "right", hideOnMobile: true, render: (r) => rupees(r.directCost) },
                  { label: L("ఈవెంట్ లాభం", "Event profit"), align: "right", hideOnMobile: true, render: (r) => rupees(r.directProfit) },
                  { label: L("వాటా", "Share"), align: "right", render: (r) => rupees(r.share) },
                  {
                    label: L("నికర లాభం", "Net profit"),
                    align: "right",
                    render: (r) => (
                      <Box component="span" sx={{ fontWeight: 600, color: r.netProfit < 0 ? "error.main" : undefined }}>
                        {rupees(r.netProfit)}
                        {r.marginPct !== null ? ` (${r.marginPct}%)` : ""}
                      </Box>
                    ),
                  },
                ]}
                footer={data.lines.length > 1 ? [L("మొత్తం", "Total"), "", rupees(data.totals.income), rupees(data.totals.directCost), rupees(data.totals.directProfit), rupees(data.totals.share), rupees(data.totals.netProfit)] : undefined}
              />
            </Box>
          )}
          <Typography variant="caption" color="text.secondary">
            {L("ముగించిన (Closed) ఈవెంట్‌కు ముగించినప్పటి అంకెలు; ఇంకా తెరిచి ఉన్న వాటికి ఇప్పటి అంకెలు. ఇది రిపోర్ట్ మాత్రమే — ఖాతా పుస్తకం మారదు.", "A closed event uses the figures fixed at closing; an open one uses today's figures. This is a report only — the books do not change.")}
          </Typography>
        </Box>
      )}
    </Paper>
  );
}
