import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Alert, Box, Button, CircularProgress, Link, Paper, TextField, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import InfoIcon from "@mui/icons-material/Info";
import PendingIcon from "@mui/icons-material/Pending";
import { useLang } from "../../i18n/LanguageContext";
import { errorText, lockPeriod, monthCloseCheck, type MonthCloseResult } from "../../data/functions";
import { istMonth } from "../../util/dates";

/** "YYYY-MM" of the month before the given one. */
function monthBefore(month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/**
 * Module 4g — month-close checklist. Pick a month, press "తనిఖీ చేయి": the server lists what is still loose in it
 * (events without an invoice, bills on hold, payroll not finalized …) with a link to where each is fixed. When
 * nothing is left the owner can lock the month here.
 */
export function MonthClosePanel({ isOwner, onLocked }: { isOwner: boolean; onLocked: () => void }) {
  const { L, lang } = useLang();
  const [month, setMonth] = useState(monthBefore(istMonth()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MonthCloseResult | null>(null);

  const check = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await monthCloseCheck({ month }));
    } catch (e) {
      setResult(null);
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  const lock = async () => {
    if (!result) return;
    const ask = result.ready
      ? L(`${result.month} వరకు పుస్తకాలు లాక్ చేయాలా?`, `Lock the books through ${result.month}?`)
      : L(`ఇంకా ${result.todo} పనులు మిగిలి ఉన్నాయి. అయినా ${result.month} వరకు లాక్ చేయాలా?`, `${result.todo} things are still open. Lock through ${result.month} anyway?`);
    if (!window.confirm(ask)) return;
    setBusy(true);
    setError(null);
    try {
      await lockPeriod({ month: result.month });
      onLocked();
      setResult(await monthCloseCheck({ month: result.month }));
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  const icon = (state: string) =>
    state === "ok" ? <CheckCircleIcon color="success" fontSize="small" /> : state === "block" ? <ErrorIcon color="error" fontSize="small" /> : state === "todo" ? <PendingIcon color="warning" fontSize="small" /> : <InfoIcon color="info" fontSize="small" />;
  const blocked = result?.items.some((i) => i.state === "block") ?? false;

  return (
    <Paper variant="outlined" sx={{ p: 2, mt: 3 }}>
      <Typography variant="subtitle1">{L("నెల ముగింపు చెక్‌లిస్ట్", "Month-close checklist")}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {L("నెల లాక్ చేసే ముందు ఆ నెలలో ఏవి పూర్తి కాలేదో చూడండి.", "Before locking a month, see what is still unfinished in it.")}
      </Typography>
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
        <TextField size="small" type="month" label={L("నెల", "Month")} value={month} onChange={(e) => setMonth(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <Button variant="contained" onClick={() => void check()} disabled={busy || !/^\d{4}-\d{2}$/.test(month)} startIcon={busy ? <CircularProgress size={18} color="inherit" /> : undefined}>
          {L("తనిఖీ చేయి", "Check")}
        </Button>
      </Box>
      {error && (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          {error}
        </Alert>
      )}
      {result && (
        <Box sx={{ mt: 2, display: "grid", gap: 0.75 }}>
          {result.items.map((i) => (
            <Box key={i.key} sx={{ display: "flex", gap: 1, alignItems: "center" }}>
              {icon(i.state)}
              <Typography variant="body2" sx={{ flex: 1 }}>
                {L(i.te, i.en)}
              </Typography>
              {i.link && i.state !== "ok" && (
                <Link component={RouterLink} to={i.link} variant="body2">
                  {L("తెరువు", "Open")}
                </Link>
              )}
            </Box>
          ))}
          <Box sx={{ mt: 1 }}>
            {result.alreadyLocked ? (
              <Alert severity="success">{L(`${result.lockedThrough} వరకు ఇప్పటికే లాక్ అయింది.`, `Already locked through ${result.lockedThrough}.`)}</Alert>
            ) : !result.ended ? (
              <Alert severity="info">{L("ఈ నెల ఇంకా ముగియలేదు — ముగిసిన తర్వాతే లాక్ చేయగలరు.", "This month has not ended — it can be locked only after it ends.")}</Alert>
            ) : (
              <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
                <Alert severity={result.ready ? "success" : "warning"} sx={{ flex: "1 1 260px" }}>
                  {result.ready ? L("అన్నీ పూర్తయ్యాయి — ఈ నెల లాక్ చేయవచ్చు.", "Everything is done — this month can be locked.") : blocked ? L("ముందు ఖాతా పుస్తకం సరిచేయండి.", "Fix the books first.") : L(`ఇంకా ${result.todo} పనులు మిగిలి ఉన్నాయి.`, `${result.todo} things are still open.`)}
                </Alert>
                {isOwner && !blocked && (
                  <Button variant={result.ready ? "contained" : "outlined"} color={result.ready ? "success" : "warning"} onClick={() => void lock()} disabled={busy}>
                    {L(`${result.month} వరకు లాక్ చేయి`, `Lock through ${result.month}`)}
                  </Button>
                )}
              </Box>
            )}
          </Box>
        </Box>
      )}
    </Paper>
  );
}
