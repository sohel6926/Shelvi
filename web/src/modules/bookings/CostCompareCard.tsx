import { useEffect, useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Paper, TextField, Typography } from "@mui/material";
import { useLang } from "../../i18n/LanguageContext";
import { costComparison, errorText, refreshCostEstimate, type CostComparison, type CostRow } from "../../data/functions";
import { formatINR } from "../../util/format";

/**
 * Module 2i — the three costs of one event side by side (owner only): standard (menu), estimated (frozen when the
 * booking was confirmed) and actual (bills tagged to the event so far). Every number comes from the server.
 */
export function CostCompareCard({ bookingId, reloadKey }: { bookingId: string; reloadKey?: string }) {
  const { L, lang } = useLang();
  const [data, setData] = useState<CostComparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState("");
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    costComparison({ bookingId })
      .then((r) => {
        setData(r);
        setError(null);
      })
      .catch((e) => setError(errorText(e, lang)))
      .finally(() => setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [bookingId, reloadKey]);

  const reEstimate = async () => {
    setBusy(true);
    try {
      await refreshCostEstimate({ bookingId, reason: reason.trim() });
      setAsking(false);
      setReason("");
      load();
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  const money = (v: number | null) => (v === null ? "—" : formatINR(v));
  const row = (label: string, hint: string, r: CostRow) => (
    <>
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {hint}
        </Typography>
      </Box>
      <Typography sx={{ textAlign: "right" }}>{money(r.total)}</Typography>
      <Typography sx={{ textAlign: "right" }}>{money(r.perPlate)}</Typography>
    </>
  );
  const diffChip = (d: { amount: number; pct: number | null } | null, flag: "over" | "under" | "ok" | null) =>
    d === null ? null : (
      <Chip
        size="small"
        color={flag === "over" ? "error" : flag === "under" ? "success" : "default"}
        label={`${d.amount > 0 ? "+" : ""}${formatINR(d.amount)}${d.pct === null ? "" : ` (${d.pct > 0 ? "+" : ""}${d.pct}%)`}`}
      />
    );

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
        {L("ఖర్చు పోలిక: ప్రామాణిక / అంచనా / నిజమైన", "Cost comparison: standard / estimated / actual")}
      </Typography>
      {loading && <CircularProgress size={20} />}
      {error && <Alert severity="error">{error}</Alert>}
      {data && (
        <>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr auto auto", columnGap: 2, rowGap: 1, alignItems: "center" }}>
            <span />
            <Typography variant="caption" sx={{ textAlign: "right" }}>
              {L(`మొత్తం (${data.guests} మందికి)`, `Total (${data.guests} guests)`)}
            </Typography>
            <Typography variant="caption" sx={{ textAlign: "right" }}>
              {L("ప్లేటుకి", "Per plate")}
            </Typography>
            {row(L("ప్రామాణిక", "Standard"), L("మెనూకి మీరు నిర్ణయించినది", "what you fixed for the menu"), data.standard)}
            {row(L("అంచనా", "Estimated"), L("ఖరారు చేసిన రోజు ధరలతో", "at the rates on the day it was confirmed"), data.estimated)}
            {row(L("నిజమైన", "Actual"), L("ఇప్పటివరకు వచ్చిన బిల్‌లు", "bills tagged so far"), data.actual)}
          </Box>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center", mt: 1.5 }}>
            {data.estVsStd && (
              <Typography variant="body2">
                {L("అంచనా − ప్రామాణిక", "Estimated − standard")}: {diffChip(data.estVsStd, data.estVsStdFlag)}
              </Typography>
            )}
            {data.actVsEst && (
              <Typography variant="body2">
                {L("నిజమైన − అంచనా", "Actual − estimated")}: {diffChip(data.actVsEst, data.actVsEstFlag)}
              </Typography>
            )}
          </Box>
          {!data.estimate && <Alert severity="info" sx={{ mt: 1 }}>{L("ఈ ఈవెంట్‌కి అంచనా ఇంకా లేదు. ఖరారు (Confirmed) చేసినప్పుడు దానంతట అదే వస్తుంది, లేదా కింద బటన్ నొక్కండి.", "No estimate yet for this event. It is made when the booking is confirmed, or use the button below.")}</Alert>}
          {data.estimate && !data.estimate.complete && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              {L(`అంచనా పూర్తి కాదు: ${data.estimate.coveragePct ?? 0}% సరుకులకే ధర తెలుసు. మిగతా వాటి ఖర్చు ఇందులో లేదు.`, `The estimate is not complete: only ${data.estimate.coveragePct ?? 0}% of ingredients had a rate. The rest is not in this figure.`)}
            </Alert>
          )}
          {data.standard.total === null && <Alert severity="info" sx={{ mt: 1 }}>{L("ఈ మెనూకి ప్రామాణిక ఖర్చు నిర్ణయించలేదు (మెనూ పేజీలో నిర్ణయించవచ్చు).", "No standard cost was fixed for this menu (fix it on the menus page).")}</Alert>}
          <Box sx={{ mt: 1.5, display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
            {asking ? (
              <>
                <TextField size="small" label={L("ఎందుకు మళ్ళీ అంచనా?", "Why estimate again?")} value={reason} onChange={(e) => setReason(e.target.value)} sx={{ minWidth: 240 }} />
                <Button variant="contained" size="small" disabled={busy || reason.trim().length < 3} onClick={reEstimate}>
                  {L("అంచనా వెయ్యి", "Estimate")}
                </Button>
                <Button size="small" disabled={busy} onClick={() => setAsking(false)}>
                  {L("వద్దు", "Back")}
                </Button>
              </>
            ) : (
              <Button size="small" variant="outlined" onClick={() => setAsking(true)}>
                {data.estimate ? L(`మళ్ళీ అంచనా వెయ్యి (ఇప్పుడు వెర్షన్ ${data.estimate.version})`, `Estimate again (now version ${data.estimate.version})`) : L("ఇప్పుడే అంచనా వెయ్యి", "Estimate now")}
              </Button>
            )}
          </Box>
        </>
      )}
    </Paper>
  );
}
