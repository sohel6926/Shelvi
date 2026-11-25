import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import { dateLocale, useLang } from "../../i18n/LanguageContext";
import { can, type Role } from "../../auth/roles";
import {
  isClosed,
  sessionName,
  subscribeEventExtras,
  subscribeGuestLog,
  type Booking,
  type EventExtra,
  type GuestLogEntry,
  type MealSession,
} from "../../data/bookingRepository";
import type { MenuPackage } from "../../data/menuPackageRepository";
import {
  addEventExtra,
  approveEventExtra,
  closeEvent,
  errorText,
  logGuestCount,
  reopenEvent,
  type CloseBlocker,
} from "../../data/functions";
import { subscribeBookingCosts, type Expense, type OutsideOrder, type Purchase } from "../../data/records";
import { liveRows } from "../../data/cancel";
import { outstanding, subscribeEquipmentMoves } from "../../data/assetsRepository";
import { StatusChip } from "../../components/StatusChip";
import { DataTable } from "../../components/DataTable";
import { ServiceTimelineCard } from "./BookingDetailCards";
import { KidsSpecialChips } from "./KidsSpecialEditor";
import { formatDate, formatINR, sum } from "../../util/format";

function Card({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Paper sx={{ p: 2.5, mt: 2 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
        <Typography variant="h6" component="h2">
          {title}
        </Typography>
        {action}
      </Box>
      {children}
    </Paper>
  );
}

const timeText = (d: Date | null, lang: "te" | "en") =>
  d ? d.toLocaleString(dateLocale(lang), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—";

// ---------------------------------------------------------------- R7-5 sessions

export function SessionsCard({ booking, packages, role }: { booking: Booking; packages: MenuPackage[]; role: Role }) {
  const { L, lang } = useLang();
  const navigate = useNavigate();
  const [openTimeline, setOpenTimeline] = useState<string | null>(null);
  if (booking.sessions.length === 0) return null;
  const pkgName = (id: string) => {
    const p = packages.find((x) => x.id === id);
    return p ? (lang === "te" ? p.nameTe || p.nameEn : p.nameEn || p.nameTe) : L("మెనూ ఇంకా లేదు", "No menu yet");
  };
  const q = (s: MealSession) => `booking=${booking.id}&session=${encodeURIComponent(s.id)}`;

  return (
    <Card title={L(`భోజనాలు (${booking.sessions.length})`, `Meal sessions (${booking.sessions.length})`)}>
      <Box sx={{ display: "grid", gap: 1.5 }}>
        {booking.sessions.map((s) => (
          <Paper key={s.id} variant="outlined" sx={{ p: 1.5, opacity: s.status === "cancelled" ? 0.6 : 1 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
              <Box>
                <Typography sx={{ fontWeight: 600 }}>{sessionName(s, lang)}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {formatDate(s.date, lang)} · {s.serveTime || "—"} · {pkgName(s.packageId)}
                </Typography>
                <Typography variant="body2">
                  {L("అతిథులు", "Guests")}: {s.guests}
                  {s.guestCountConfirmed ? ` · ${L("ఖరారు", "confirmed")} ${s.guestCountConfirmed}` : ""}
                  {s.guestCountActual ? ` · ${L("వచ్చినవారు", "actual")} ${s.guestCountActual}` : ""}
                </Typography>
                <KidsSpecialChips kidsCount={s.kidsCount} specialMeals={s.specialMeals} />
              </Box>
              <StatusChip status={s.status} />
            </Box>
            {s.status !== "cancelled" && (
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1 }}>
                <Button size="small" variant="outlined" onClick={() => setOpenTimeline(openTimeline === s.id ? null : s.id)}>
                  {L("సమయ పట్టిక", "Timeline")}
                </Button>
                <Button size="small" variant="outlined" onClick={() => navigate(`/cooking?${q(s)}`)}>
                  {L("వంట లెక్క", "Cooking")}
                </Button>
                <Button size="small" variant="outlined" onClick={() => navigate(`/grocery?${q(s)}`)}>
                  {L("సరుకుల లెక్క", "Groceries")}
                </Button>
                {can.quote(role) && (
                  <Button size="small" variant="outlined" onClick={() => navigate(`/quotes/new?${q(s)}`)}>
                    {L("కొటేషన్", "Quote")}
                  </Button>
                )}
              </Box>
            )}
            <Collapse in={openTimeline === s.id} unmountOnExit>
              <ServiceTimelineCard
                request={{ bookingId: booking.id, sessionId: s.id }}
                reloadKey={[s.serveTime, s.travelMinutes, s.mealType, s.guests, s.date?.getTime()].join("|")}
                title={sessionName(s, lang)}
              />
            </Collapse>
          </Paper>
        ))}
      </Box>
    </Card>
  );
}

// ---------------------------------------------------------------- R7-7 guest count

export function GuestCountCard({ booking }: { booking: Booking }) {
  const { L, lang } = useLang();
  const [log, setLog] = useState<GuestLogEntry[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [count, setCount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = isClosed(booking) || booking.cancelled;

  useEffect(() => subscribeGuestLog(booking.id, setLog, (e) => setError(errorText(e, lang))), [booking.id, lang]);

  const n = parseInt(count, 10);
  const valid = Number.isInteger(n) && n >= 0 && (booking.sessions.length === 0 || !!sessionId);
  const name = (sid: string) => {
    const s = booking.sessions.find((x) => x.id === sid);
    return s ? sessionName(s, lang) : "";
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await logGuestCount({ bookingId: booking.id, ...(sessionId ? { sessionId } : {}), count: n, ...(note.trim() ? { note: note.trim() } : {}) });
      setCount("");
      setNote("");
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={L("వచ్చిన అతిథులు (ఇప్పుడు)", "Live guest count")}>
      {error && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}
      {!locked && (
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center", mb: 1.5 }}>
          {booking.sessions.length > 0 && (
            <TextField select size="small" label={L("భోజనం", "Meal")} value={sessionId} onChange={(e) => setSessionId(e.target.value)} sx={{ minWidth: 160 }}>
              {booking.sessions
                .filter((s) => s.status !== "cancelled")
                .map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {sessionName(s, lang)}
                  </MenuItem>
                ))}
            </TextField>
          )}
          <TextField size="small" type="number" label={L("ఎంత మంది", "How many")} value={count} onChange={(e) => setCount(e.target.value)} sx={{ width: 130 }} />
          <TextField size="small" label={L("గమనిక", "Note")} value={note} onChange={(e) => setNote(e.target.value)} sx={{ flex: "1 1 160px" }} />
          <Button variant="contained" onClick={save} disabled={!valid || busy}>
            {L("నమోదు", "Log")}
          </Button>
        </Box>
      )}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {L(
          "చివరి లెక్కే \"వచ్చినవారు\" అవుతుంది. కోట్ చేసిన ప్లేట్ల కంటే ఎక్కువ అయితే తుది బిల్లులో అదనపు ప్లేట్లుగా వస్తాయి.",
          "The latest count becomes the actual guests. Plates above the quoted number go on the final invoice as extra plates.",
        )}
      </Typography>
      {log.length > 0 && (
        <DataTable
          rows={log.slice(0, 20)}
          rowKey={(r) => r.id}
          columns={[
            { label: L("ఎప్పుడు", "When"), render: (r) => timeText(r.at, lang) },
            ...(booking.sessions.length ? [{ label: L("భోజనం", "Meal"), render: (r: GuestLogEntry) => name(r.sessionId) || "—" }] : []),
            { label: L("మంది", "Guests"), align: "right" as const, render: (r: GuestLogEntry) => r.count },
            { label: L("ఎవరు", "By"), hideOnMobile: true, render: (r: GuestLogEntry) => r.byName || "—" },
            { label: L("గమనిక", "Note"), hideOnMobile: true, render: (r: GuestLogEntry) => r.note || "—" },
          ]}
        />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- R7-7 event extras

export function ExtrasCard({ booking, role }: { booking: Booking; role: Role }) {
  const { L, lang } = useLang();
  const [rows, setRows] = useState<EventExtra[]>([]);
  const [adding, setAdding] = useState(false);
  const [item, setItem] = useState("");
  const [qty, setQty] = useState("");
  const [rate, setRate] = useState("");
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState<EventExtra | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = isClosed(booking) || booking.cancelled;
  const mayApprove = can.approveExtras(role) && !locked;

  useEffect(() => subscribeEventExtras(booking.id, setRows, (e) => setError(errorText(e, lang))), [booking.id, lang]);

  const q = Number(qty);
  const r = Number(rate);
  const valid = item.trim() && q > 0 && r >= 0 && rate.trim() !== "" && custName.trim().length >= 2;

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await addEventExtra({
        bookingId: booking.id,
        ...(sessionId ? { sessionId } : {}),
        item: item.trim(),
        qty: q,
        rate: r,
        customerApprovedBy: { name: custName.trim(), ...(custPhone.trim() ? { phone: custPhone.trim() } : {}) },
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setItem("");
      setQty("");
      setRate("");
      setNote("");
      setAdding(false);
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  const decide = async (x: EventExtra, approve: boolean, reason?: string) => {
    setBusy(true);
    setError(null);
    try {
      await approveEventExtra({ bookingId: booking.id, extraId: x.id, approve, ...(reason ? { reason } : {}) });
      setRejecting(null);
      setRejectReason("");
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  const pending = rows.filter((x) => x.status === "pending");

  return (
    <Card
      title={L("Event లో అదనంగా అడిగినవి", "Extras during the event")}
      action={
        !locked && (
          <Button size="small" variant="outlined" onClick={() => setAdding((v) => !v)}>
            {adding ? L("మూసివేయి", "Close") : L("అదనం చేర్చు", "Add extra")}
          </Button>
        )
      }
    >
      {error && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}
      {pending.length > 0 && (
        <Alert severity="warning" sx={{ mb: 1 }}>
          {L(`${pending.length} అదనపు ఐటమ్స్ ఆమోదం కోసం ఉన్నాయి.`, `${pending.length} extras waiting for approval.`)}
        </Alert>
      )}
      <Collapse in={adding}>
        <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, mb: 2 }}>
          <TextField size="small" label={L("ఏమిటి (ఉదా: అదనపు ఐస్ క్రీమ్)", "What (e.g. extra ice cream)")} value={item} onChange={(e) => setItem(e.target.value)} />
          {booking.sessions.length > 0 ? (
            <TextField select size="small" label={L("భోజనం", "Meal")} value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
              <MenuItem value="">{L("మొత్తం event", "Whole event")}</MenuItem>
              {booking.sessions.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {sessionName(s, lang)}
                </MenuItem>
              ))}
            </TextField>
          ) : (
            <Box />
          )}
          <TextField size="small" type="number" label={L("ఎన్ని", "Quantity")} value={qty} onChange={(e) => setQty(e.target.value)} />
          <TextField size="small" type="number" label={L("ధర / ఒక్కటి", "Rate each")} value={rate} onChange={(e) => setRate(e.target.value)} />
          <TextField size="small" label={L("ఒప్పుకున్న customer పేరు", "Customer who agreed (name)")} value={custName} onChange={(e) => setCustName(e.target.value)} />
          <TextField size="small" type="tel" label={L("వారి ఫోన్", "Their phone")} value={custPhone} onChange={(e) => setCustPhone(e.target.value)} />
          <TextField size="small" label={L("గమనిక", "Note")} value={note} onChange={(e) => setNote(e.target.value)} sx={{ gridColumn: { sm: "1 / -1" } }} />
          <Box>
            <Button variant="contained" onClick={add} disabled={!valid || busy}>
              {L("సేవ్", "Save")}
            </Button>
          </Box>
        </Box>
      </Collapse>
      {rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {L("ఇంకా అదనంగా ఏమీ అడగలేదు.", "No extras yet.")}
        </Typography>
      ) : (
        <DataTable
          rows={rows}
          rowKey={(x) => x.id}
          columns={[
            { label: L("ఏమిటి", "Item"), render: (x) => `${x.item} × ${x.qty}` },
            { label: L("మొత్తం", "Amount"), align: "right", render: (x) => formatINR(x.amount) },
            { label: L("ఒప్పుకున్నవారు", "Agreed by"), hideOnMobile: true, render: (x) => [x.customerName, x.customerPhone].filter(Boolean).join(" · ") || "—" },
            { label: L("స్థితి", "Status"), render: (x) => <StatusChip status={x.status} /> },
            {
              label: "",
              render: (x) =>
                x.status === "pending" && mayApprove ? (
                  <Box sx={{ display: "flex", gap: 0.5 }}>
                    <Button size="small" variant="contained" color="success" disabled={busy} onClick={() => decide(x, true)}>
                      {L("ఆమోదించు", "Approve")}
                    </Button>
                    <Button size="small" color="error" disabled={busy} onClick={() => setRejecting(x)}>
                      {L("వద్దు", "Reject")}
                    </Button>
                  </Box>
                ) : x.decisionReason ? (
                  <Typography variant="caption">{x.decisionReason}</Typography>
                ) : null,
            },
          ]}
        />
      )}
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        {L("ఆమోదించినవి తుది బిల్లులో వేరే లైన్లుగా వస్తాయి.", "Approved extras go on the final invoice as separate lines.")}
      </Typography>
      <Dialog open={!!rejecting} onClose={() => setRejecting(null)} fullWidth maxWidth="xs">
        <DialogTitle>{L("ఎందుకు వద్దు?", "Why reject?")}</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth size="small" label={L("కారణం", "Reason")} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejecting(null)}>{L("వెనక్కి", "Back")}</Button>
          <Button color="error" variant="contained" disabled={rejectReason.trim().length < 3 || busy} onClick={() => rejecting && decide(rejecting, false, rejectReason.trim())}>
            {L("తిరస్కరించు", "Reject")}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}

// ---------------------------------------------------------------- R7-1 / R7-4 / R7-6 costs of this event

export function EventCostsCard({ booking }: { booking: Booking }) {
  const { L, lang } = useLang();
  const navigate = useNavigate();
  const [costs, setCosts] = useState<{ purchases: Purchase[]; expenses: Expense[]; outsideOrders: OutsideOrder[] }>({ purchases: [], expenses: [], outsideOrders: [] });
  const [out, setOut] = useState<{ equipmentId: string; qty: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const locked = isClosed(booking) || booking.cancelled;
  const branch = booking.branchId || null;

  useEffect(() => subscribeBookingCosts(booking.id, branch, setCosts, (e) => setError(errorText(e, lang))), [booking.id, branch, lang]);
  useEffect(
    () =>
      subscribeEquipmentMoves(
        branch,
        (moves) => {
          const per = outstanding(moves).get(booking.id);
          setOut(per ? [...per.entries()].filter(([, q]) => q > 0).map(([equipmentId, qty]) => ({ equipmentId, qty })) : []);
        },
        () => setOut([]),
        booking.id,
      ),
    [booking.id, branch],
  );

  const p = liveRows(costs.purchases);
  const e = liveRows(costs.expenses);
  const o = liveRows(costs.outsideOrders);
  const openOrders = o.filter((x) => x.status !== "settled").length;
  const q = `booking=${booking.id}`;

  return (
    <Card
      title={L("ఈ Event ఖర్చులు", "Costs of this event")}
      action={
        !locked && (
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button size="small" variant="outlined" onClick={() => navigate(`/purchases/new?${q}`)}>
              {L("+ కొనుగోలు", "+ Purchase")}
            </Button>
            <Button size="small" variant="outlined" onClick={() => navigate(`/expenses/new?${q}`)}>
              {L("+ ఖర్చు", "+ Expense")}
            </Button>
            <Button size="small" variant="outlined" onClick={() => navigate(`/outside-orders?${q}`)}>
              {L("బయటి ఆర్డర్లు", "Outside orders")}
            </Button>
          </Box>
        )
      }
    >
      {error && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}
      <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" } }}>
        <Box>
          <Typography variant="caption" color="text.secondary">
            {L("కొనుగోళ్లు", "Purchases")} ({p.length})
          </Typography>
          <Typography sx={{ fontWeight: 600 }}>{formatINR(sum(p, (x) => x.totalAmount))}</Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">
            {L("ఖర్చులు", "Expenses")} ({e.length})
          </Typography>
          <Typography sx={{ fontWeight: 600 }}>{formatINR(sum(e, (x) => x.totalAmount))}</Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">
            {L("బయటి ఆర్డర్లు", "Outside orders")} ({o.length})
          </Typography>
          <Typography sx={{ fontWeight: 600 }}>
            {openOrders ? L(`${openOrders} settle కాలేదు`, `${openOrders} not settled`) : L("అన్నీ settle", "All settled")}
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">
            {L("పాత్రలు బయట", "Vessels out")}
          </Typography>
          <Typography sx={{ fontWeight: 600, color: out.length ? "error.main" : undefined }}>
            {out.length ? sum(out, (x) => x.qty) : L("అన్నీ వచ్చాయి", "All back")}
          </Typography>
        </Box>
      </Box>
      {out.length > 0 && (
        <Button size="small" sx={{ mt: 1 }} onClick={() => navigate("/equipment")}>
          {L("పాత్రల పేజీ తెరువు", "Open vessels page")}
        </Button>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- R7-9 close / reopen

const COST_LABEL: Record<string, { te: string; en: string }> = {
  food: { te: "సరుకులు / ఆహారం", en: "Food" },
  labour: { te: "కూలీ", en: "Labour" },
  transport: { te: "రవాణా", en: "Transport" },
  rentals: { te: "అద్దెలు", en: "Rentals" },
  other: { te: "ఇతర", en: "Other" },
};

/** Closed banner for everyone; profit snapshot for the owner only (managers never see profit). */
export function ClosedBanner({ booking, role }: { booking: Booking; role: Role }) {
  const { L, T, lang } = useLang();
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = booking.closed;
  if (!isClosed(booking)) return null;

  const reopen = async () => {
    setBusy(true);
    setError(null);
    try {
      await reopenEvent({ bookingId: booking.id, reason: reason.trim() });
      setReopenOpen(false);
      setReason("");
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Alert
      severity="success"
      sx={{ mt: 2, alignItems: "flex-start" }}
      action={
        can.closeEvent(role) ? (
          <Button color="inherit" size="small" onClick={() => setReopenOpen(true)}>
            {L("మళ్ళీ తెరువు", "Reopen")}
          </Button>
        ) : undefined
      }
    >
      <Typography sx={{ fontWeight: 600 }}>
        {L("ఈ Event ముగించాం (lock) — ఇక మార్పులు లేవు.", "This event is closed — no more changes.")}
      </Typography>
      {c && (
        <Typography variant="body2">
          {timeText(c.at, lang)}
          {c.by ? ` · ${c.by}` : ""}
        </Typography>
      )}
      {c && can.seeProfit(role) && (
        <Box sx={{ mt: 1, display: "grid", gap: 0.5, gridTemplateColumns: "auto auto", columnGap: 3 }}>
          <Typography variant="body2">{L("ఆదాయం", "Income")}</Typography>
          <Typography variant="body2" sx={{ textAlign: "right" }}>{formatINR(c.income ?? 0)}</Typography>
          {Object.entries(c.costs).map(([k, v]) => (
            <Box key={k} sx={{ display: "contents" }}>
              <Typography variant="body2">{COST_LABEL[k] ? T(COST_LABEL[k]) : k}</Typography>
              <Typography variant="body2" sx={{ textAlign: "right" }}>− {formatINR(v)}</Typography>
            </Box>
          ))}
          <Typography variant="body2" sx={{ fontWeight: 700 }}>{L("లాభం", "Profit")}</Typography>
          <Typography variant="body2" sx={{ textAlign: "right", fontWeight: 700 }}>
            {formatINR(c.profit ?? 0)}
            {c.marginPct !== null ? ` (${Math.round(c.marginPct)}%)` : ""}
          </Typography>
        </Box>
      )}
      <Dialog open={reopenOpen} onClose={() => !busy && setReopenOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{L("Event మళ్ళీ తెరవాలా?", "Reopen this event?")}</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 1 }}>
              {error}
            </Alert>
          )}
          <TextField autoFocus fullWidth multiline minRows={2} size="small" label={L("ఎందుకు? (తప్పనిసరి)", "Why? (required)")} value={reason} onChange={(e) => setReason(e.target.value)} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReopenOpen(false)} disabled={busy}>
            {L("వద్దు", "Back")}
          </Button>
          <Button variant="contained" disabled={reason.trim().length < 3 || busy} onClick={reopen}>
            {L("మళ్ళీ తెరువు", "Reopen")}
          </Button>
        </DialogActions>
      </Dialog>
    </Alert>
  );
}

export function CloseEventCard({ booking, role }: { booking: Booking; role: Role }) {
  const { L, T, lang } = useLang();
  const [billsIn, setBillsIn] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [blockers, setBlockers] = useState<CloseBlocker[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsOverride = useMemo(() => blockers.some((b) => b.overridable), [blockers]);

  if (!can.closeEvent(role) || isClosed(booking) || booking.cancelled) return null;
  const completed = booking.status === "Completed";

  const close = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await closeEvent({
        bookingId: booking.id,
        confirm: { vendorBillsEntered: billsIn },
        ...(overrideReason.trim() ? { overrideReason: overrideReason.trim() } : {}),
      });
      setBlockers(res.blockers);
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={L("Event ముగించు", "Close the event")}>
      {!completed ? (
        <Typography variant="body2" color="text.secondary">
          {L(
            "Event అయిపోయాక స్థితిని \"పూర్తి\" గా మార్చండి. తర్వాత ఇక్కడ ముగించవచ్చు — పాత్రలు తిరిగి రావాలి, బయటి ఆర్డర్లు settle అవ్వాలి, అదనపు ఐటమ్స్ నిర్ణయించాలి, సిబ్బందికి attendance వేయాలి, customer బాకీ తీరాలి.",
            "When the event is over, set its status to Completed. Then close it here — vessels back, outside orders settled, extras decided, staff attendance marked, customer paid.",
          )}
        </Typography>
      ) : (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {L("ముగించాక ఈ event, దాని ఖర్చులు మార్చలేరు. లాభం లెక్క అప్పుడే స్థిరం అవుతుంది.", "After closing, the event and its costs are locked and the profit is fixed.")}
          </Typography>
          {error && (
            <Alert severity="error" sx={{ mb: 1, whiteSpace: "pre-line" }}>
              {error}
            </Alert>
          )}
          {blockers.length > 0 && (
            <Alert severity="warning" sx={{ mb: 1 }}>
              <Typography sx={{ fontWeight: 600, mb: 0.5 }}>{L("ఇంకా ఇవి మిగిలి ఉన్నాయి:", "Still to do:")}</Typography>
              <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                {blockers.map((b) => (
                  <li key={b.code}>{T(b)}</li>
                ))}
              </Box>
            </Alert>
          )}
          <FormControlLabel
            control={<Checkbox checked={billsIn} onChange={(e) => setBillsIn(e.target.checked)} />}
            label={L("ఈ event కి సరఫరాదారుల బిల్లులు అన్నీ నమోదు చేశాం", "All vendor bills for this event are entered")}
          />
          {needsOverride && (
            <TextField
              fullWidth
              size="small"
              label={L("Customer బాకీ ఉన్నా ముగించడానికి కారణం", "Reason to close with the customer balance unpaid")}
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              sx={{ my: 1 }}
            />
          )}
          <Box>
            <Button variant="contained" onClick={close} disabled={busy}>
              {L("Event ముగించు", "Close event")}
            </Button>
          </Box>
        </>
      )}
    </Card>
  );
}
