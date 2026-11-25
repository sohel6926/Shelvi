import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, TextField, Typography } from "@mui/material";
import { useLang } from "../../i18n/LanguageContext";
import { cancelSalaryPayment, errorText, recordSalaryPayment, type PayrollRow } from "../../data/functions";
import { istDay } from "../../util/dates";

const todayIso = () => istDay();

const METHODS = [
  { code: "Cash", te: "నగదు", en: "Cash" },
  { code: "UPI", te: "UPI", en: "UPI" },
  { code: "BankTransfer", te: "బ్యాంక్ బదిలీ", en: "Bank transfer" },
  { code: "Other", te: "ఇతర", en: "Other" },
] as const;

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Module 4e — paying salaries. Shown under the payroll table once the month is finalized: for each person what was
 * fixed, what has been handed over and what is still due, with "చెల్లించు" (owner only → recordSalaryPayment).
 * A payment can be part of the amount; the books move it from "Salaries payable" to cash / bank.
 */
export function SalaryPayPanel({ rows, month, isOwner, onDone }: { rows: PayrollRow[]; month: string; isOwner: boolean; onDone: () => void }) {
  const { L, lang } = useLang();
  const [paying, setPaying] = useState<PayrollRow | null>(null);
  const [amountText, setAmountText] = useState("");
  const [date, setDate] = useState(todayIso());
  const [method, setMethod] = useState<string>("Cash");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Module 6a: this month's payments (owner only), so a wrong one can be cancelled
  const [payments, setPayments] = useState<{ id: string; staffId: string; amount: number; date: string; method: string; cancelled: boolean }[]>([]);
  const [cancelling, setCancelling] = useState<{ id: string; label: string } | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  useEffect(() => {
    if (!isOwner || !month) return;
    return onSnapshot(
      query(collection(db, "salaryPayments"), where("month", "==", month)),
      (snap) => setPayments(snap.docs.map((d) => ({ id: d.id, staffId: String(d.data().staffId ?? ""), amount: Number(d.data().amount ?? 0), date: String(d.data().date ?? ""), method: String(d.data().method ?? ""), cancelled: d.data().cancelled === true }))),
      () => setPayments([]),
    );
  }, [isOwner, month]);

  const slips = rows.filter((r) => r.finalized);
  if (!slips.length) return null;

  const due = (r: PayrollRow) => Math.max(0, Math.round(((r.finalNet ?? 0) - (r.paid ?? 0)) * 100) / 100);
  const totalDue = slips.reduce((a, r) => a + due(r), 0);
  const amount = Number(amountText);
  const valid = paying !== null && Number.isFinite(amount) && amount > 0 && amount <= due(paying) + 0.005 && !!date && date <= todayIso();

  const open = (r: PayrollRow) => {
    setPaying(r);
    setAmountText(String(due(r)));
    setDate(todayIso());
    setMethod("Cash");
    setNote("");
    setError(null);
  };

  const save = async () => {
    if (!paying) return;
    setBusy(true);
    setError(null);
    try {
      await recordSalaryPayment({ month, staffId: paying.staffId, amount, date, method, ...(note.trim() ? { note: note.trim() } : {}) });
      setPaying(null);
      onDone();
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  const doCancel = async () => {
    if (!cancelling) return;
    setBusy(true);
    setError(null);
    try {
      await cancelSalaryPayment({ id: cancelling.id, reason: cancelReason.trim() });
      setCancelling(null);
      setCancelReason("");
      onDone();
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
      <Typography variant="subtitle1" sx={{ mb: 1 }}>
        {L("జీతం చెల్లింపులు", "Salary payments")} · {L(`ఇంకా ఇవ్వవలసింది ${rupees(totalDue)}`, `Still to pay ${rupees(totalDue)}`)}
      </Typography>
      {slips.map((r) => (
        <Box key={r.staffId} sx={{ display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center", borderTop: 1, borderColor: "divider", py: 0.75 }}>
          <Typography sx={{ flex: "1 1 160px", fontWeight: 600 }}>{r.name}</Typography>
          <Typography variant="body2" sx={{ flex: "2 1 260px" }}>
            {L(`ఖరారు ${rupees(r.finalNet ?? 0)} · ఇచ్చింది ${rupees(r.paid ?? 0)} · బాకీ ${rupees(due(r))}`, `Fixed ${rupees(r.finalNet ?? 0)} · paid ${rupees(r.paid ?? 0)} · due ${rupees(due(r))}`)}
          </Typography>
          {due(r) <= 0 ? (
            <Chip size="small" color="success" label={L("పూర్తిగా ఇచ్చారు", "Fully paid")} />
          ) : isOwner ? (
            <Button size="small" variant="contained" onClick={() => open(r)}>
              {L("చెల్లించు", "Pay")}
            </Button>
          ) : (
            <Chip size="small" label={(r.paid ?? 0) > 0 ? L("కొంత ఇచ్చారు", "Partly paid") : L("ఇవ్వలేదు", "Not paid")} />
          )}
          {isOwner &&
            payments
              .filter((p) => p.staffId === r.staffId && !p.cancelled)
              .map((p) => (
                <Box key={p.id} sx={{ flexBasis: "100%", display: "flex", gap: 1, alignItems: "center", pl: 2 }}>
                  <Typography variant="caption" color="text.secondary">
                    {p.date} · {rupees(p.amount)} · {p.method}
                  </Typography>
                  <Button size="small" color="error" onClick={() => { setError(null); setCancelReason(""); setCancelling({ id: p.id, label: `${r.name} ${rupees(p.amount)} (${p.date})` }); }}>
                    {L("రద్దు", "Cancel")}
                  </Button>
                </Box>
              ))}
        </Box>
      ))}

      <Dialog open={paying !== null} onClose={() => !busy && setPaying(null)} fullWidth maxWidth="xs">
        <DialogTitle>
          {L("జీతం చెల్లింపు", "Pay salary")} — {paying?.name}
        </DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
          <TextField
            label={L("మొత్తం (₹)", "Amount (₹)")}
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            helperText={paying ? L(`బాకీ ${rupees(due(paying))}. కొంత మాత్రమే ఇస్తే ఆ మొత్తం రాయండి.`, `Due ${rupees(due(paying))}. Type a smaller amount for a part payment.`) : ""}
            slotProps={{ htmlInput: { inputMode: "decimal" } }}
          />
          <TextField type="date" label={L("ఇచ్చిన తేదీ", "Date paid")} value={date} onChange={(e) => setDate(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: todayIso() } }} />
          <TextField select label={L("ఏ విధంగా", "How")} value={method} onChange={(e) => setMethod(e.target.value)}>
            {METHODS.map((m) => (
              <MenuItem key={m.code} value={m.code}>
                {L(m.te, m.en)}
              </MenuItem>
            ))}
          </TextField>
          <TextField label={L("గమనిక (ఐచ్ఛికం)", "Note (optional)")} value={note} onChange={(e) => setNote(e.target.value)} />
          {error && <Alert severity="error">{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPaying(null)} disabled={busy}>
            {L("వద్దు", "Cancel")}
          </Button>
          <Button variant="contained" onClick={save} disabled={!valid || busy}>
            {L("చెల్లింపు నమోదు చేయి", "Record payment")}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={cancelling !== null} onClose={() => !busy && setCancelling(null)} fullWidth maxWidth="xs">
        <DialogTitle>{L("జీతం చెల్లింపు రద్దు", "Cancel salary payment")}</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
          <Typography variant="body2">{cancelling?.label}</Typography>
          <Typography variant="caption" color="text.secondary">
            {L("రద్దు చేస్తే ఆ మొత్తం మళ్లీ బాకీ అవుతుంది. ఆ నెల లాక్ అయి ఉంటే రద్దు కాదు.", "Cancelling puts that amount back as still due. A payment in a locked month cannot be cancelled.")}
          </Typography>
          <TextField label={L("కారణం", "Reason")} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
          {error && <Alert severity="error">{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelling(null)} disabled={busy}>
            {L("వద్దు", "No")}
          </Button>
          <Button color="error" variant="contained" onClick={doCancel} disabled={busy || cancelReason.trim() === ""}>
            {L("రద్దు చేయి", "Cancel payment")}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
