import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Select,
  Step,
  StepLabel,
  Stepper,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import { dateLocale, useLang } from "../../i18n/LanguageContext";
import type { Role } from "../../auth/roles";
import type { Booking } from "../../data/bookingRepository";
import {
  CANCEL_REASON_CODES,
  CANCEL_REASON_LABEL,
  PAYMENT_METHODS,
  cancelBooking,
  errorText,
  postponeBooking,
  restoreBooking,
  type AdvanceChoice,
  type CancelBookingResult,
  type CancelReasonCode,
  type PaymentMethod,
  type RestoreBookingResult,
} from "../../data/functions";
import { formatMoney } from "../../util/format";
import { formatDay, istDay } from "../../util/dates";
import { parseMoney } from "../../components/ui";
import { tabularNums, tokens } from "../../theme/tokens";
import { bookingStatusLabel } from "./statusColor";
import { METHOD_LABEL, canRestore, customerPhone, methodLabel, reasonLabel, useBookingPaid, waLink } from "./bookingCancelHelpers";

/**
 * Round 9 — order cancellation done properly (api-contract "Round 9").
 * Booking cancel goes ONLY through cancelBooking; undo through restoreBooking (owner); date change through
 * postponeBooking. All money comes from the server; the dialog only previews "kept = paid − refund".
 */

type StepId = "reason" | "money" | "summary" | "done";

function Line({ label, value, strong, color }: { label: string; value: string; strong?: boolean; color?: string }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, py: 0.5 }}>
      <Typography sx={{ fontWeight: strong ? 600 : 400 }}>{label}</Typography>
      <Typography sx={{ ...tabularNums, fontWeight: strong ? 600 : 400, color, textAlign: "right" }}>{value}</Typography>
    </Box>
  );
}

/** "ఆర్డర్ రద్దు" dialog: reason → (money, only if paid) → summary → server result + customer message. */
export function OrderCancelDialog({ open, booking, role, onClose }: { open: boolean; booking: Booking; role: Role; onClose: () => void }) {
  const { L, T, lang } = useLang();
  const { paid, failed: paidFailed } = useBookingPaid(booking, role, open);
  const [step, setStep] = useState<StepId>("reason");
  const [code, setCode] = useState<CancelReasonCode | null>(null);
  const [note, setNote] = useState("");
  const [advance, setAdvance] = useState<AdvanceChoice | null>(null);
  const [amountText, setAmountText] = useState("");
  const [method, setMethod] = useState<PaymentMethod | "">("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CancelBookingResult | null>(null);
  const [phone, setPhone] = useState("");
  const [copied, setCopied] = useState(false);

  const paidNow = paid ?? 0;
  const hasMoney = paidNow >= 0.01;
  const steps: StepId[] = hasMoney ? ["reason", "money", "summary"] : ["reason", "summary"];
  const noteOk = note.trim().length >= 3;
  const reasonOk = code !== null && noteOk && (paid !== null || paidFailed);

  const amount = parseMoney(amountText);
  const amountValid = typeof amount === "number" && Number.isFinite(amount) && amount >= 0.01 && amount <= paidNow;
  const refundPreview = !hasMoney ? 0 : advance === "refund-all" ? paidNow : advance === "refund-part" && amountValid ? (amount as number) : 0;
  /** Preview only — the server's numbers are final. */
  const keptPreview = hasMoney && advance ? Math.round((paidNow - refundPreview) * 100) / 100 : 0;
  const needsMethod = hasMoney && (advance === "refund-all" || advance === "refund-part");
  const moneyOk = !hasMoney || (advance !== null && (advance !== "refund-part" || amountValid) && (!needsMethod || method !== ""));

  const reset = () => {
    setStep("reason");
    setCode(null);
    setNote("");
    setAdvance(null);
    setAmountText("");
    setMethod("");
    setNotify(true);
    setError(null);
    setResult(null);
    setPhone("");
    setCopied(false);
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const next = () => {
    setError(null);
    const i = steps.indexOf(step);
    if (i >= 0 && i < steps.length - 1) setStep(steps[i + 1]);
  };
  const back = () => {
    setError(null);
    const i = steps.indexOf(step);
    if (i > 0) setStep(steps[i - 1]);
  };

  const submit = async () => {
    if (!code) return;
    setBusy(true);
    setError(null);
    try {
      const res = await cancelBooking({
        bookingId: booking.id,
        reasonCode: code,
        reason: note.trim(),
        notifyCustomer: notify,
        ...(hasMoney && advance ? { advance } : {}),
        ...(hasMoney && advance === "refund-part" && amountValid ? { refundAmount: amount as number } : {}),
        ...(needsMethod && method ? { refundMethod: method } : {}),
      });
      setResult(res);
      setStep("done");
      if (res.customerMessage) setPhone(await customerPhone(booking.customerId));
    } catch (e) {
      // Server refusals (equipment still out, closed event, money step missing…) are shown exactly as sent.
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const STEP_TEXT: Record<StepId, string> = {
    reason: L("కారణం", "Reason"),
    money: L("డబ్బు", "Money"),
    summary: L("చూసి నిర్ధారించు", "Check & confirm"),
    done: L("అయింది", "Done"),
  };

  const staffCount = booking.assignedStaffIds.length;

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm" aria-labelledby="order-cancel-title">
      <DialogTitle id="order-cancel-title">
        {L("ఆర్డర్ రద్దు", "Cancel order")}
        {booking.customerNameSnapshot ? ` — ${booking.customerNameSnapshot}` : ""}
      </DialogTitle>
      <DialogContent>
        {step !== "done" && (
          <Stepper activeStep={steps.indexOf(step)} alternativeLabel sx={{ mb: 2 }}>
            {steps.map((s) => (
              <Step key={s}>
                <StepLabel>{STEP_TEXT[s]}</StepLabel>
              </Step>
            ))}
          </Stepper>
        )}
        {error && (
          <Alert severity="error" sx={{ mb: 2, whiteSpace: "pre-line" }}>
            {error}
          </Alert>
        )}

        {step === "reason" && (
          <Box sx={{ display: "grid", gap: 2 }}>
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {L("ఎందుకు రద్దు చేస్తున్నారు?", "Why is the order being cancelled?")}
              </Typography>
              <Box role="radiogroup" aria-label={L("కారణం", "Reason")} sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                {CANCEL_REASON_CODES.map((c) => (
                  <Chip
                    key={c}
                    role="radio"
                    aria-checked={code === c}
                    clickable
                    label={L(CANCEL_REASON_LABEL[c].te, CANCEL_REASON_LABEL[c].en)}
                    color={code === c ? "error" : "default"}
                    variant={code === c ? "filled" : "outlined"}
                    onClick={() => setCode(c)}
                    sx={{ minHeight: 40, fontSize: "0.95rem" }}
                  />
                ))}
              </Box>
            </Box>
            <TextField
              fullWidth
              multiline
              minRows={2}
              label={L("వివరం (తప్పనిసరి)", "Note (required)")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              error={!!note && !noteOk}
              helperText={!noteOk ? L("కనీసం 3 అక్షరాలు", "At least 3 characters") : " "}
            />
            {paid === null && !paidFailed && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <CircularProgress size={18} />
                <Typography variant="body2">{L("కట్టిన డబ్బు చూస్తున్నాం…", "Checking payments…")}</Typography>
              </Box>
            )}
            {paidFailed && (
              <Alert severity="warning">
                {L(
                  "కట్టిన మొత్తం చూడలేకపోయాం. డబ్బు కట్టి ఉంటే server అడుగుతుంది — అప్పుడు ఆ సందేశం ఇక్కడ కనిపిస్తుంది.",
                  "Could not read payments. If money was paid, the server will say so here.",
                )}
              </Alert>
            )}
            {hasMoney && (
              <Alert severity="info">
                {L(`కస్టమర్ ${formatMoney(paidNow)} కట్టారు — తర్వాతి దశలో తిరిగి ఇవ్వాలా, ఉంచుకోవాలా ఎంచుకోండి.`, `The customer has paid ${formatMoney(paidNow)} — choose refund or keep next.`)}
              </Alert>
            )}
            <FormControlLabel
              control={<Switch checked={notify} onChange={(e) => setNotify(e.target.checked)} />}
              label={
                <Box>
                  <Typography>{L("కస్టమర్‌కి సందేశం", "Message for the customer")}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {L("WhatsApp లో పంపడానికి తెలుగు సందేశం తయారు చేస్తాం (మేమే పంపము).", "A Telugu message to send on WhatsApp is prepared (not sent automatically).")}
                  </Typography>
                </Box>
              }
            />
          </Box>
        )}

        {step === "money" && hasMoney && (
          <Box sx={{ display: "grid", gap: 2 }}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="body2" color="text.secondary">
                {L("కస్టమర్ కట్టింది", "Customer has paid")}
              </Typography>
              <Typography variant="h5" sx={{ ...tabularNums, fontWeight: 600 }}>
                {formatMoney(paidNow)}
              </Typography>
            </Paper>
            <RadioGroup value={advance ?? ""} onChange={(e) => setAdvance(e.target.value as AdvanceChoice)}>
              <FormControlLabel value="refund-all" control={<Radio />} label={L(`మొత్తం తిరిగి (${formatMoney(paidNow)})`, `Refund all (${formatMoney(paidNow)})`)} />
              <FormControlLabel value="refund-part" control={<Radio />} label={L("కొంత తిరిగి", "Refund part")} />
              <FormControlLabel value="keep" control={<Radio />} label={L("ఉంచుకుంటాం (రద్దు చార్జీ)", "Keep it (cancellation charge)")} />
            </RadioGroup>
            {advance === "refund-part" && (
              <TextField
                label={L("తిరిగి ఇచ్చే మొత్తం ₹", "Refund amount ₹")}
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                error={!!amountText && !amountValid}
                helperText={L(`₹0.01 నుండి ${formatMoney(paidNow)} వరకు`, `₹0.01 to ${formatMoney(paidNow)}`)}
                slotProps={{ htmlInput: { inputMode: "decimal" } }}
              />
            )}
            {needsMethod && (
              <FormControl fullWidth>
                <InputLabel id="refund-method-label">{L("ఎలా తిరిగి ఇస్తున్నారు?", "Refund method")}</InputLabel>
                <Select
                  labelId="refund-method-label"
                  label={L("ఎలా తిరిగి ఇస్తున్నారు?", "Refund method")}
                  value={method}
                  onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                >
                  {PAYMENT_METHODS.map((m) => (
                    <MenuItem key={m} value={m}>
                      {L(METHOD_LABEL[m].te, METHOD_LABEL[m].en)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            {advance && (
              <Paper variant="outlined" sx={{ p: 2, bgcolor: tokens.color.neutralTint }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                  {L("అంచనా (preview) — చివరి లెక్క server చేస్తుంది", "Preview — the server's numbers are final")}
                </Typography>
                <Line label={L("తిరిగి ఇచ్చేది", "Refund")} value={formatMoney(refundPreview)} />
                <Line label={L("ఉంచుకునేది (రద్దు చార్జీ)", "Kept (cancellation charge)")} value={formatMoney(keptPreview)} strong />
              </Paper>
            )}
          </Box>
        )}

        {step === "summary" && code && (
          <Box sx={{ display: "grid", gap: 1.5 }}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Line label={L("కారణం", "Reason")} value={L(CANCEL_REASON_LABEL[code].te, CANCEL_REASON_LABEL[code].en)} strong />
              <Typography variant="body2" sx={{ whiteSpace: "pre-line", mb: 1 }}>
                {note.trim()}
              </Typography>
              {hasMoney ? (
                <>
                  <Line label={L("కట్టింది", "Paid")} value={formatMoney(paidNow)} />
                  <Line
                    label={L("తిరిగి ఇచ్చేది", "Refund")}
                    value={`${formatMoney(refundPreview)}${refundPreview > 0 && method ? ` (${methodLabel(method, L)})` : ""}`}
                  />
                  <Line label={L("ఉంచుకునేది (అంచనా)", "Kept (preview)")} value={formatMoney(keptPreview)} strong />
                </>
              ) : (
                <Typography variant="body2">{paidFailed ? L("కట్టిన మొత్తం server చూస్తుంది.", "The server will check payments.") : L("డబ్బు కట్టలేదు — డబ్బు దశ లేదు.", "Nothing paid — no money step.")}</Typography>
              )}
            </Paper>
            <Box component="ul" sx={{ m: 0, pl: 3, display: "grid", gap: 0.5 }}>
              {staffCount > 0 && <li>{L(`${staffCount} staff free అవుతారు`, `${staffCount} staff will be freed`)}</li>}
              <li>{L("ఇంకా ఇవ్వని సామాన్ల reservation, నడపని vehicle trips విడుదల అవుతాయి", "Unissued equipment and undriven vehicle trips are released")}</li>
              <li>{L("కొటేషన్లు రద్దు, బిల్లు రద్దు (చార్జీ ఉంటే ఆ line మాత్రమే)", "Quotations cancelled; invoice cancelled (only the charge line stays)")}</li>
              <li>{L("వంట plan నుండి తీసేస్తాం, kitchen కి \"plan మారింది\" వెళ్తుంది", "Removed from the cooking plan; kitchen gets \"plan changed\"")}</li>
              <li>{notify ? L("కస్టమర్‌కి సందేశం తయారు చేస్తాం", "A customer message will be prepared") : L("కస్టమర్ సందేశం లేదు", "No customer message")}</li>
            </Box>
            <Alert severity="warning">
              {L("రద్దు తర్వాత ఈ బుకింగ్ చదవడానికే. యజమాని మాత్రమే మళ్ళీ తెరవగలరు; తిరిగి ఇచ్చిన డబ్బు వెనక్కి రాదు.", "After cancelling, the booking is read-only. Only the owner can reopen it; refunds are not reversed.")}
            </Alert>
          </Box>
        )}

        {step === "done" && result && (
          <Box sx={{ display: "grid", gap: 2 }}>
            <Alert severity="success">
              {L("ఆర్డర్ రద్దు అయింది", "Order cancelled")}: {T(result.summary)}
            </Alert>
            {(result.paid > 0 || result.refund > 0 || result.charge > 0) && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Line label={L("కట్టింది", "Paid")} value={formatMoney(result.paid)} />
                <Line label={L("తిరిగి ఇచ్చింది", "Refunded")} value={formatMoney(result.refund)} />
                <Line label={L("ఉంచుకున్నది (రద్దు చార్జీ)", "Kept (cancellation charge)")} value={formatMoney(result.charge)} strong />
              </Paper>
            )}
            {result.customerMessage && (
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                  {L("కస్టమర్‌కి సందేశం", "Message for the customer")}
                </Typography>
                <Paper variant="outlined" sx={{ p: 2, whiteSpace: "pre-line", bgcolor: tokens.color.greenTint }}>
                  {result.customerMessage}
                </Paper>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1, alignItems: "center" }}>
                  <Button variant="outlined" startIcon={<ContentCopyIcon />} onClick={() => copy(result.customerMessage ?? "")}>
                    {copied ? L("కాపీ అయింది", "Copied") : L("కాపీ", "Copy")}
                  </Button>
                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<WhatsAppIcon />}
                    href={waLink(phone, result.customerMessage)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    WhatsApp
                  </Button>
                  {!phone && (
                    <Typography variant="body2" color="text.secondary">
                      {L("కస్టమర్ ఫోన్ లేదు — WhatsApp లో contact ఎంచుకోండి.", "No customer phone — pick the contact in WhatsApp.")}
                    </Typography>
                  )}
                </Box>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {step === "done" ? (
          <Button variant="contained" onClick={close}>
            {L("సరే", "Close")}
          </Button>
        ) : (
          <>
            <Button onClick={step === "reason" ? close : back} disabled={busy}>
              {step === "reason" ? L("వద్దు", "Back out") : L("వెనక్కి", "Back")}
            </Button>
            {step === "summary" ? (
              <Button color="error" variant="contained" onClick={submit} disabled={busy || !reasonOk || !moneyOk}>
                {busy ? <CircularProgress size={20} color="inherit" /> : L("ఆర్డర్ రద్దు చేయి", "Cancel the order")}
              </Button>
            ) : (
              <Button variant="contained" onClick={next} disabled={step === "reason" ? !reasonOk : !moneyOk}>
                {L("తర్వాత", "Next")}
              </Button>
            )}
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

const dateTime = (d: Date | null, lang: "te" | "en") =>
  d ? d.toLocaleString(dateLocale(lang), { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

/** Red band on a cancelled booking: reason, who, when, money; owner's "మళ్ళీ తెరువు". */
export function CancelledBand({ booking, role, onRestore }: { booking: Booking; role: Role; onRestore: () => void }) {
  const { L, lang } = useLang();
  const c = booking.cancelDetail;
  const restorable = canRestore(booking);
  return (
    <Paper
      role="status"
      elevation={0}
      sx={{ p: 2, mb: 2, bgcolor: tokens.color.badTint, border: `1px solid ${tokens.color.bad}`, borderLeft: `6px solid ${tokens.color.bad}` }}
    >
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, flexWrap: "wrap", alignItems: "flex-start" }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" component="p" sx={{ color: tokens.color.bad, fontWeight: 600 }}>
            {L("ఈ ఆర్డర్ రద్దు అయింది", "This order is cancelled")}
          </Typography>
          {c ? (
            <>
              <Typography sx={{ fontWeight: 600 }}>
                {reasonLabel(c.reasonCode, c.reasonTe, L)}
                {c.reason ? ` — ${c.reason}` : ""}
              </Typography>
              <Typography variant="body2">
                {L("రద్దు చేసింది", "Cancelled by")}: {c.byName || "—"} · {dateTime(c.at, lang)}
              </Typography>
            </>
          ) : (
            booking.cancelReason && <Typography>{booking.cancelReason}</Typography>
          )}
        </Box>
        {role === "admin" && booking.status === "Cancelled" && (
          <Box sx={{ textAlign: "right" }}>
            <Button variant="outlined" color="error" onClick={onRestore} disabled={!restorable} sx={{ bgcolor: tokens.color.raised }}>
              {L("మళ్ళీ తెరువు", "Reopen")}
            </Button>
            {!restorable && (
              <Typography variant="caption" sx={{ display: "block", mt: 0.5 }}>
                {L("Event తేదీ దాటింది — మళ్ళీ తెరవలేము", "Event date has passed — can't reopen")}
              </Typography>
            )}
          </Box>
        )}
      </Box>
      {c && (c.paid > 0 || c.refund > 0 || c.charge > 0) && (
        <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap", mt: 1.5 }}>
          <Box>
            <Typography variant="caption">{L("కట్టింది", "Paid")}</Typography>
            <Typography sx={{ ...tabularNums, fontWeight: 600 }}>{formatMoney(c.paid)}</Typography>
          </Box>
          <Box>
            <Typography variant="caption">{L("తిరిగి ఇచ్చింది", "Refunded")}</Typography>
            <Typography sx={{ ...tabularNums, fontWeight: 600 }}>
              {formatMoney(c.refund)}
              {c.refund > 0 && c.refundMethod ? ` (${methodLabel(c.refundMethod, L)})` : ""}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption">{L("ఉంచుకున్నది (రద్దు చార్జీ)", "Kept (cancellation charge)")}</Typography>
            <Typography sx={{ ...tabularNums, fontWeight: 600 }}>{formatMoney(c.charge)}</Typography>
          </Box>
        </Box>
      )}
      {c && (c.releasedStaff > 0 || c.releasedTrips > 0 || c.releasedMoves > 0) && (
        <Typography variant="body2" sx={{ mt: 1 }}>
          {[
            c.releasedStaff > 0 ? L(`${c.releasedStaff} staff free`, `${c.releasedStaff} staff freed`) : "",
            c.releasedTrips > 0 ? L(`${c.releasedTrips} vehicle free`, `${c.releasedTrips} vehicle trip(s) released`) : "",
            c.releasedMoves > 0 ? L(`${c.releasedMoves} సామాన్ల reservation రద్దు`, `${c.releasedMoves} equipment reservation(s) released`) : "",
          ]
            .filter(Boolean)
            .join(", ")}
        </Typography>
      )}
      {role === "admin" && booking.cancelLoss > 0 && (
        <Typography variant="body2" sx={{ mt: 1, color: tokens.color.bad, fontWeight: 600 }}>
          {L("రద్దైన event ఖర్చు (నష్టం)", "Cost of the cancelled event (loss)")}: {formatMoney(booking.cancelLoss)}
        </Typography>
      )}
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        {L("ఈ పేజీ చదవడానికే.", "This page is read-only.")}
      </Typography>
    </Paper>
  );
}

/** Small notes on a live booking: it was cancelled and reopened, or its date was changed. */
export function Round9Notes({ booking }: { booking: Booking }) {
  const { L, lang } = useLang();
  if (booking.cancelled) return null;
  const lc = booking.lastCancel;
  const lp = booking.lastPostponed;
  if (!lc?.restoredAt && !lp) return null;
  return (
    <Box sx={{ display: "grid", gap: 1, mb: 2 }}>
      {lc?.restoredAt && (
        <Alert severity="info">
          {L(
            `ఈ ఆర్డర్ ${dateTime(lc.at, lang)} న రద్దై, ${dateTime(lc.restoredAt, lang)} న ${lc.restoredByName || "యజమాని"} మళ్ళీ తెరిచారు${lc.restoreReason ? ` (${lc.restoreReason})` : ""}.`,
            `Cancelled on ${dateTime(lc.at, lang)} and reopened on ${dateTime(lc.restoredAt, lang)} by ${lc.restoredByName || "the owner"}${lc.restoreReason ? ` (${lc.restoreReason})` : ""}.`,
          )}
          {lc.refund > 0 &&
            L(` ${formatMoney(lc.refund)} తిరిగి ఇచ్చింది అలాగే ఉంది — మళ్ళీ డబ్బు వస్తే కొత్త payment నమోదు చేయండి.`, ` ${formatMoney(lc.refund)} refunded stays refunded — record a new payment if they pay again.`)}
        </Alert>
      )}
      {lp && (
        <Alert severity="info" icon={false}>
          {L("తేదీ మార్చారు", "Date changed")}: {formatDay(lp.from, lang)} → {formatDay(lp.to, lang)}
          {lp.byName ? ` · ${lp.byName}` : ""}
          {lp.reason ? ` · ${lp.reason}` : ""}
        </Alert>
      )}
    </Box>
  );
}

/** Owner-only undo: restoreBooking { bookingId, reason } — shows the server's note. */
export function RestoreDialog({ open, booking, onClose }: { open: boolean; booking: Booking; onClose: () => void }) {
  const { L, T, lang } = useLang();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RestoreBookingResult | null>(null);
  const ok = reason.trim().length >= 3;

  const close = () => {
    if (busy) return;
    setReason("");
    setError(null);
    setResult(null);
    onClose();
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await restoreBooking({ bookingId: booking.id, reason: reason.trim() }));
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
      <DialogTitle>{L("ఆర్డర్ మళ్ళీ తెరువు", "Reopen order")}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {result ? (
          <Box sx={{ display: "grid", gap: 1.5 }}>
            <Alert severity="success">
              {L("ఆర్డర్ మళ్ళీ తెరిచాం — స్థితి", "Order reopened — status")}: {bookingStatusLabel(result.status as Booking["status"], lang)}
            </Alert>
            <Alert severity="info">{T(result.note)}</Alert>
            {result.invoices.map((i) => (
              <Line key={i.id} label={L("బిల్లు బాకీ", "Invoice balance")} value={formatMoney(i.balanceDue)} />
            ))}
          </Box>
        ) : (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {L(
                "రద్దుకు ముందు ఉన్న స్థితికి వెళ్తుంది. తిరిగి ఇచ్చిన డబ్బు వెనక్కి రాదు; సరుకులు event Completed అయినప్పుడు మళ్ళీ తీసుకుంటాం.",
                "Goes back to the status before the cancel. Refunds are not reversed; stock is taken again when the event is Completed.",
              )}
            </Typography>
            <TextField
              autoFocus
              fullWidth
              multiline
              minRows={2}
              label={L("కారణం (తప్పనిసరి)", "Reason (required)")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              helperText={!ok ? L("కనీసం 3 అక్షరాలు", "At least 3 characters") : " "}
            />
          </>
        )}
      </DialogContent>
      <DialogActions>
        {result ? (
          <Button variant="contained" onClick={close}>
            {L("సరే", "Close")}
          </Button>
        ) : (
          <>
            <Button onClick={close} disabled={busy}>
              {L("వద్దు", "Back")}
            </Button>
            <Button variant="contained" onClick={submit} disabled={!ok || busy}>
              {busy ? <CircularProgress size={20} color="inherit" /> : L("మళ్ళీ తెరువు", "Reopen")}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

/** "తేదీ మార్చు": postponeBooking { bookingId, newDate, reason? } — everything else stays. */
export function PostponeDialog({ open, booking, onClose }: { open: boolean; booking: Booking; onClose: () => void }) {
  const { L, lang } = useLang();
  const today = istDay();
  const current = booking.eventDate ? istDay(booking.eventDate) : "";
  const [newDate, setNewDate] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ from: string; to: string } | null>(null);
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(newDate) && newDate >= today && newDate !== current;

  const close = () => {
    if (busy) return;
    setNewDate("");
    setReason("");
    setError(null);
    setResult(null);
    onClose();
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = reason.trim();
      const res = await postponeBooking({ bookingId: booking.id, newDate, ...(r ? { reason: r } : {}) });
      setResult({ from: res.from, to: res.to });
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
      <DialogTitle>{L("తేదీ మార్చు", "Change date")}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {result ? (
          <Alert severity="success">
            {L(
              `తేదీ మార్చాం: ${formatDay(result.from, lang)} → ${formatDay(result.to, lang)}. వంట plan, timeline కొత్త తేదీకి మారతాయి; kitchen కి సందేశం వెళ్తుంది.`,
              `Date changed: ${formatDay(result.from, lang)} → ${formatDay(result.to, lang)}. Cooking plan and timeline follow; the kitchen is notified.`,
            )}
          </Alert>
        ) : (
          <Box sx={{ display: "grid", gap: 2, pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {L("ఇప్పటి తేదీ", "Current date")}: {current ? formatDay(current, lang) : "—"}
              {booking.sessions.length > 0 && L(" · భోజనాల తేదీలు కూడా అన్నే రోజులు జరుగుతాయి", " · meal sessions move by the same number of days")}
            </Typography>
            <TextField
              type="date"
              label={L("కొత్త తేదీ", "New date")}
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              error={!!newDate && !dateOk}
              helperText={
                newDate && newDate === current
                  ? L("ఇది ఇప్పటి తేదీనే", "Same as the current date")
                  : newDate && newDate < today
                    ? L("ఈ రోజు లేదా తర్వాత తేదీ ఎంచుకోండి", "Pick today or later")
                    : " "
              }
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: today } }}
            />
            <TextField
              fullWidth
              label={L("కారణం (ఐచ్ఛికం)", "Reason (optional)")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {result ? (
          <Button variant="contained" onClick={close}>
            {L("సరే", "Close")}
          </Button>
        ) : (
          <>
            <Button onClick={close} disabled={busy}>
              {L("వద్దు", "Back")}
            </Button>
            <Button variant="contained" onClick={submit} disabled={!dateOk || busy}>
              {busy ? <CircularProgress size={20} color="inherit" /> : L("తేదీ మార్చు", "Change date")}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
