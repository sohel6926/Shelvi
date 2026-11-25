import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Rating,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import { useLang } from "../../i18n/LanguageContext";
import { useSession } from "../../auth/AuthProvider";
import { type Booking, isClosed, sessionName } from "../../data/bookingRepository";
import { subscribeStaff, type Staff } from "../../data/records";
import { errorText, rateStaff, saveShift, SHIFT_ROLES, type ShiftRole } from "../../data/functions";
import { SHIFT_ROLE_LABEL, subscribeBookingRatings, subscribeBookingShifts, type Shift, type StaffRating, type Who } from "../../data/staffWorkRepository";
import { CancelButton } from "../../components/CancelControls";
import { formatDay, istDay } from "../../util/dates";

interface ShiftForm {
  id?: string;
  staffId: string;
  role: ShiftRole;
  sessionId: string;
  date: string;
  startTime: string;
  endTime: string;
  note: string;
}

/** R10-2: shifts on a booking / session (saveShift) and star ratings after the event (rateStaff). A/M only. */
export function ShiftsCard({ booking }: { booking: Booking }) {
  const { L, T, lang } = useLang();
  const session = useSession();
  const profile = session.status === "loggedIn" ? session.profile : null;
  const who = useMemo<Who>(
    () => ({ role: profile?.role ?? "staff", branchId: profile?.role === "admin" ? null : profile?.branchId ?? null, staffId: profile?.staffId ?? "", uid: profile?.uid ?? "" }),
    [profile?.role, profile?.branchId, profile?.staffId, profile?.uid],
  );
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [ratings, setRatings] = useState<StaffRating[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ShiftForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [rateFor, setRateFor] = useState<{ staffId: string; name: string; stars: number; note: string } | null>(null);
  const locked = booking.cancelled || isClosed(booking);
  const eventDay = booking.eventDate ? istDay(booking.eventDate) : istDay();
  const eventDone = eventDay <= istDay();

  useEffect(() => subscribeBookingShifts(booking.id, who, setShifts, (e) => setError(e.message)), [booking.id, who]);
  useEffect(() => subscribeBookingRatings(booking.id, who, setRatings, () => setRatings([])), [booking.id, who]);
  useEffect(() => subscribeStaff(booking.branchId || null, (s) => setStaff(s.filter((x) => x.active && !x.cancelled))), [booking.branchId]);

  const live = shifts.filter((s) => !s.cancelled);
  const people = [...new Map(live.map((s) => [s.staffId, s.staffName])).entries()];
  const ratingOf = (staffId: string) => ratings.find((r) => r.staffId === staffId && !r.cancelled);

  const openNew = () => {
    const firstSession = booking.sessions.find((s) => s.status !== "cancelled");
    const day = firstSession?.date ? istDay(firstSession.date) : eventDay;
    const serve = firstSession?.serveTime || booking.serveTime || "12:00";
    const startH = Math.max(0, Number(serve.slice(0, 2)) - 5);
    setFormError(null);
    setForm({
      staffId: "",
      role: "cook",
      sessionId: firstSession?.id ?? "",
      date: day,
      startTime: `${String(startH).padStart(2, "0")}:00`,
      endTime: `${String(Math.min(23, Number(serve.slice(0, 2)) + 3)).padStart(2, "0")}:00`,
      note: "",
    });
  };

  async function save() {
    if (!form) return;
    if (!form.staffId || !/^\d{4}-\d{2}-\d{2}$/.test(form.date) || !/^\d{2}:\d{2}$/.test(form.startTime) || !/^\d{2}:\d{2}$/.test(form.endTime)) {
      setFormError(L("సిబ్బంది, తేదీ, సమయాలు ఇవ్వండి.", "Pick the staff member, date and times."));
      return;
    }
    if (form.endTime <= form.startTime) {
      setFormError(L("ముగింపు సమయం మొదలు తర్వాత ఉండాలి.", "End time must be after the start."));
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await saveShift({
        ...(form.id ? { id: form.id } : {}),
        bookingId: booking.id,
        ...(form.sessionId ? { sessionId: form.sessionId } : {}),
        staffId: form.staffId,
        role: form.role,
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime,
        ...(form.note.trim() ? { note: form.note.trim() } : {}),
      });
      setForm(null);
    } catch (e) {
      setFormError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  }

  async function rate() {
    if (!rateFor || rateFor.stars < 1) return;
    setBusy(true);
    setError(null);
    try {
      await rateStaff({ staffId: rateFor.staffId, bookingId: booking.id, stars: rateFor.stars, ...(rateFor.note.trim() ? { note: rateFor.note.trim() } : {}) });
      setRateFor(null);
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  }

  const sessionLabel = (id: string) => {
    const s = booking.sessions.find((x) => x.id === id);
    return s ? sessionName(s, lang) : "";
  };

  return (
    <Paper sx={{ p: 2.5, mt: 2 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 1 }}>
        <Typography variant="h6" component="h2">
          {L("సిబ్బంది shifts", "Staff shifts")}
        </Typography>
        {!locked && (
          <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={openNew}>
            {L("Shift వేయి", "Add shift")}
          </Button>
        )}
      </Box>
      {error && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}
      {live.length === 0 ? (
        <Typography color="text.secondary">{L("ఇంకా shifts వేయలేదు.", "No shifts yet.")}</Typography>
      ) : (
        <Box sx={{ display: "grid", gap: 1 }}>
          {live.map((s) => (
            <Box key={s.id} sx={{ display: "flex", justifyContent: "space-between", gap: 1, flexWrap: "wrap", alignItems: "center", borderBottom: "1px solid", borderColor: "divider", pb: 0.75 }}>
              <Box>
                <Typography sx={{ fontWeight: 600 }}>
                  {s.staffName} · {SHIFT_ROLE_LABEL[s.role] ? T(SHIFT_ROLE_LABEL[s.role]) : s.role}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {formatDay(s.date, lang)} · {s.startTime}–{s.endTime} ({s.hours} {L("గం", "h")})
                  {s.sessionId ? ` · ${sessionLabel(s.sessionId)}` : ""}
                  {s.note ? ` · ${s.note}` : ""}
                </Typography>
              </Box>
              {!locked && (
                <Box sx={{ display: "flex", alignItems: "center" }}>
                  <Tooltip title={L("మార్చు", "Edit")}>
                    <IconButton
                      size="small"
                      aria-label={L("shift మార్చు", "Edit shift")}
                      onClick={() => setForm({ id: s.id, staffId: s.staffId, role: (s.role as ShiftRole) || "cook", sessionId: s.sessionId, date: s.date, startTime: s.startTime, endTime: s.endTime, note: s.note })}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <CancelButton collection="shifts" id={s.id} what={`${s.staffName} ${s.startTime}`} />
                </Box>
              )}
            </Box>
          ))}
        </Box>
      )}

      {people.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography sx={{ fontWeight: 600, mb: 0.5 }}>{L("పని ఎలా చేశారు (రేటింగ్)", "How did they do (rating)")}</Typography>
          {!eventDone && (
            <Typography variant="body2" color="text.secondary">
              {L("Event అయ్యాక రేటింగ్ ఇవ్వండి.", "Rate after the event.")}
            </Typography>
          )}
          <Box sx={{ display: "grid", gap: 0.5 }}>
            {people.map(([id, name]) => {
              const r = ratingOf(id);
              return (
                <Box key={id} sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                  <Typography sx={{ minWidth: 140 }}>{name}</Typography>
                  <Rating value={r?.stars ?? 0} readOnly size="small" />
                  {r?.note && (
                    <Typography variant="body2" color="text.secondary">
                      {r.note}
                    </Typography>
                  )}
                  {eventDone && !booking.cancelled && (
                    <Button size="small" onClick={() => setRateFor({ staffId: id, name, stars: r?.stars ?? 0, note: r?.note ?? "" })}>
                      {r ? L("మార్చు", "Change") : L("రేటింగ్ ఇవ్వు", "Rate")}
                    </Button>
                  )}
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      <Dialog open={!!form} onClose={() => !busy && setForm(null)} fullWidth maxWidth="sm">
        <DialogTitle>{form?.id ? L("Shift మార్చు", "Edit shift") : L("కొత్త shift", "New shift")}</DialogTitle>
        {form && (
          <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
            <TextField select label={L("సిబ్బంది", "Staff")} value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })}>
              {staff.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.name}
                  {s.jobRole ? ` · ${s.jobRole}` : ""}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label={L("పని", "Role")} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as ShiftRole })}>
              {SHIFT_ROLES.map((r) => (
                <MenuItem key={r} value={r}>
                  {T(SHIFT_ROLE_LABEL[r])}
                </MenuItem>
              ))}
            </TextField>
            {booking.sessions.length > 0 && (
              <TextField
                select
                label={L("భోజనం", "Meal session")}
                value={form.sessionId}
                onChange={(e) => {
                  const s = booking.sessions.find((x) => x.id === e.target.value);
                  setForm({ ...form, sessionId: e.target.value, date: s?.date ? istDay(s.date) : form.date });
                }}
              >
                <MenuItem value="">{L("మొత్తం event", "Whole event")}</MenuItem>
                {booking.sessions
                  .filter((s) => s.status !== "cancelled")
                  .map((s) => (
                    <MenuItem key={s.id} value={s.id}>
                      {sessionName(s, lang)}
                    </MenuItem>
                  ))}
              </TextField>
            )}
            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "1fr 1fr 1fr" }}>
              <TextField type="date" label={L("తేదీ", "Date")} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField type="time" label={L("మొదలు", "Start")} value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField type="time" label={L("ముగింపు", "End")} value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
            </Box>
            <TextField label={L("గమనిక (ఐచ్ఛికం)", "Note (optional)")} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            {formError && <Alert severity="error">{formError}</Alert>}
          </DialogContent>
        )}
        <DialogActions>
          <Button onClick={() => setForm(null)} disabled={busy}>
            {L("వద్దు", "Back")}
          </Button>
          <Button variant="contained" onClick={save} disabled={busy}>
            {busy ? <CircularProgress size={20} color="inherit" /> : L("Save", "Save")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!rateFor} onClose={() => !busy && setRateFor(null)} fullWidth maxWidth="xs">
        <DialogTitle>{L(`${rateFor?.name ?? ""} — రేటింగ్`, `Rate ${rateFor?.name ?? ""}`)}</DialogTitle>
        {rateFor && (
          <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
            <Rating value={rateFor.stars} onChange={(_, v) => setRateFor({ ...rateFor, stars: v ?? 0 })} size="large" />
            <TextField label={L("గమనిక (ఐచ్ఛికం)", "Note (optional)")} value={rateFor.note} onChange={(e) => setRateFor({ ...rateFor, note: e.target.value })} multiline />
          </DialogContent>
        )}
        <DialogActions>
          <Button onClick={() => setRateFor(null)} disabled={busy}>
            {L("వద్దు", "Back")}
          </Button>
          <Button variant="contained" onClick={rate} disabled={busy || !rateFor || rateFor.stars < 1}>
            {L("Save", "Save")}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
