import { useEffect, useState } from "react";
import { Box, Button, TextField, Typography } from "@mui/material";
import { useLang } from "../../i18n/LanguageContext";
import { errorText, leadReport, type LeadCounts, type LeadReportResult } from "../../data/functions";
import { DataTable, StatCard, StatRow } from "../../components/DataTable";
import { ErrorBox } from "../../components/ui";
import { istDay, istMonth } from "../../util/dates";
import type { LeadSource } from "../../data/leadsRepository";
import { SOURCE_LABEL } from "./leadLabels";

/**
 * Module 1f — leads report: totals, by source, by person, response speed, for leads created in the chosen period.
 * Every number comes from the leadReport callable (the server counts; this view only shows).
 */
export function LeadReportView({ branchId }: { branchId: string | null }) {
  const { L, T, lang } = useLang();
  const [from, setFrom] = useState(`${istMonth()}-01`);
  const [to, setTo] = useState(istDay());
  const [report, setReport] = useState<LeadReportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  async function load() {
    if (!from || !to) return;
    if (from > to) {
      setError(L("మొదలు తేదీ, చివరి తేదీ కంటే ముందు ఉండాలి.", "The from date must not be after the to date."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setReport(await leadReport({ from, to, ...(branchId ? { branchId } : {}) }));
      setLoadedAt(new Date());
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  }

  // Load once for the default period and again when the branch changes; date changes wait for the button.
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  const pct = (v: number | null) => (v === null ? "—" : `${v}%`);
  const sourceName = (s: string) => (s in SOURCE_LABEL ? T(SOURCE_LABEL[s as LeadSource]) : s);
  const countColumns = <R extends LeadCounts>() => [
    { label: L("మొత్తం", "Total"), align: "right" as const, render: (r: R) => r.total },
    { label: L("తెరిచి ఉన్నవి", "Open"), align: "right" as const, hideOnMobile: true, render: (r: R) => r.open },
    { label: L("బుక్ అయినవి", "Won"), align: "right" as const, render: (r: R) => r.won },
    { label: L("పోయినవి", "Lost"), align: "right" as const, hideOnMobile: true, render: (r: R) => r.lost },
    { label: L("రెండోసారి / చెల్లనివి", "Duplicate / invalid"), align: "right" as const, hideOnMobile: true, render: (r: R) => r.dropped },
    { label: L("బుకింగ్ %", "Conversion"), align: "right" as const, render: (r: R) => pct(r.conversionPct) },
  ];

  return (
    <Box>
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center", mb: 2 }}>
        <TextField type="date" size="small" label={L("ఎప్పటి నుండి", "From")} value={from} onChange={(e) => setFrom(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField type="date" size="small" label={L("ఎప్పటి వరకు", "To")} value={to} onChange={(e) => setTo(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <Button variant="contained" onClick={() => void load()} disabled={busy} sx={{ minHeight: 44 }}>
          {busy ? L("లెక్కిస్తున్నాం…", "Loading…") : L("చూపించు / Refresh", "Show / Refresh")}
        </Button>
        {loadedAt && (
          <Typography variant="body2" color="text.secondary">
            {L("చివరి update", "Last update")}: {loadedAt.toLocaleTimeString()}
          </Typography>
        )}
      </Box>
      <ErrorBox message={error} />
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {L("ఈ కాలంలో వచ్చిన ఎంక్వైరీల లెక్క (రద్దైనవి కలపలేదు).", "Counts of leads that came in during this period (cancelled ones are left out).")}
      </Typography>

      {report && (
        <>
          <StatRow>
            <StatCard label={L("వచ్చిన ఎంక్వైరీలు", "Leads received")} value={report.totals.total} />
            <StatCard label={L("బుక్ అయినవి", "Won")} value={report.totals.won} tone="good" />
            <StatCard label={L("బుకింగ్ %", "Conversion")} value={pct(report.totals.conversionPct)} />
            <StatCard label={L("తెరిచి ఉన్నవి", "Open")} value={report.totals.open} />
            <StatCard label={L("పోయినవి", "Lost")} value={report.totals.lost} tone="warn" />
          </StatRow>

          <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
            {L("స్పందన వేగం", "Response speed")}
          </Typography>
          <StatRow>
            <StatCard label={L("సగటున ఎన్ని నిమిషాల్లో మాట్లాడాం", "Average minutes to first response")} value={report.response.avgMinutes === null ? "—" : report.response.avgMinutes} />
            <StatCard label={L(`${report.limitMinutes} నిమిషాల లోపు మాట్లాడినవి`, `Answered within ${report.limitMinutes} minutes`)} value={`${report.response.inTime} / ${report.response.answered} (${pct(report.response.inTimePct)})`} tone="good" />
            <StatCard label={L("ఇంకా మాట్లాడనివి", "Not answered yet")} value={report.response.unanswered} tone="warn" />
          </StatRow>

          <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
            {L("ఎక్కడి నుండి వచ్చాయి", "By source")}
          </Typography>
          <Box sx={{ mb: 3 }}>
            <DataTable
              rows={report.bySource}
              rowKey={(r) => r.source}
              emptyText={L("ఈ కాలంలో ఎంక్వైరీలు లేవు.", "No leads in this period.")}
              columns={[{ label: L("ఎక్కడి నుండి", "Source"), render: (r) => sourceName(r.source) }, ...countColumns<(typeof report.bySource)[number]>()]}
            />
          </Box>

          <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
            {L("ఎవరు ఎంత చేశారు", "By person")}
          </Typography>
          <DataTable
            rows={report.byPerson}
            rowKey={(r) => r.uid || "__none"}
            emptyText={L("ఈ కాలంలో ఎంక్వైరీలు లేవు.", "No leads in this period.")}
            columns={[
              { label: L("ఎవరు", "Person"), render: (r) => r.name || (r.uid ? "…" : L("ఎవరికీ అప్పగించనివి", "Unassigned")) },
              ...countColumns<(typeof report.byPerson)[number]>(),
              { label: L("సగటు స్పందన (ని)", "Avg response (min)"), align: "right", hideOnMobile: true, render: (r) => (r.response.avgMinutes === null ? "—" : r.response.avgMinutes) },
              { label: L("సమయం లోపు", "In time"), align: "right", hideOnMobile: true, render: (r) => (r.response.answered ? `${r.response.inTime} / ${r.response.answered}` : "—") },
              { label: L("మాట్లాడనివి", "Unanswered"), align: "right", render: (r) => r.response.unanswered },
            ]}
          />
        </>
      )}
    </Box>
  );
}
