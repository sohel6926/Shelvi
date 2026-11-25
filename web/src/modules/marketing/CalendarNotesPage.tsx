import { useEffect, useMemo, useState } from "react";
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useLang } from "../../i18n/LanguageContext";
import { NOTE_KINDS, deleteCalendarNote, saveCalendarNote, subscribeCalendarNotes, type CalendarNote, type CalendarNoteInput, type NoteKind } from "../../data/calendarNotesRepository";
import { subscribeBookings, type Booking } from "../../data/bookingRepository";
import { useBranch } from "../../session/BranchContext";
import { ErrorBox, ScreenTitle } from "../../components/ui";
import { formatDay, istDay, istMonth } from "../../util/dates";
import { tokens } from "../../theme/tokens";

const KIND_LABEL: Record<NoteKind, { te: string; en: string; color: "default" | "warning" | "success" | "info" }> = {
  Festival: { te: "పండుగ", en: "Festival", color: "warning" },
  Idea: { te: "ఐడియా", en: "Idea", color: "info" },
  Note: { te: "నోట్", en: "Note", color: "default" },
  Reminder: { te: "గుర్తు", en: "Reminder", color: "success" },
};
const WEEKDAYS_TE = ["ఆది", "సోమ", "మంగళ", "బుధ", "గురు", "శుక్ర", "శని"];
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function daysOfMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}
const EMPTY = (day: string): CalendarNoteInput => ({ day, kind: "Festival", title: "", note: "" });
const dayKey = (d: Date | null): string => (d ? istDay(d) : "");

/**
 * 20 Nov 2026 — calendar of festivals, ideas, notes and reminders, shown together with the month's event bookings.
 * Notes are typed by the owner / manager (no festival dates are shipped: lunar festival days change every year).
 * Photos on notes (the old v15 CRM had them) are not built.
 */
export function CalendarNotesPage() {
  const { L, T, lang } = useLang();
  const { currentBranchId } = useBranch();
  const [month, setMonth] = useState(istMonth());
  const [rows, setRows] = useState<CalendarNote[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CalendarNoteInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const today = istDay();

  useEffect(() => subscribeCalendarNotes(month, (r) => { setRows(r); setError(null); }, (e) => setError(e.message)), [month]);
  useEffect(() => subscribeBookings(currentBranchId, setBookings, (e) => setError(e.message)), [currentBranchId]);

  const notesByDay = useMemo(() => {
    const m: Record<string, CalendarNote[]> = {};
    for (const r of rows) (m[r.day] ??= []).push(r);
    return m;
  }, [rows]);
  const eventsByDay = useMemo(() => {
    const m: Record<string, Booking[]> = {};
    for (const b of bookings) {
      if (b.status === "Cancelled") continue;
      const k = dayKey(b.eventDate);
      if (k.startsWith(month)) (m[k] ??= []).push(b);
    }
    return m;
  }, [bookings, month]);

  const days = daysOfMonth(month);
  const lead = new Date(`${days[0]}T00:00:00Z`).getUTCDay();

  async function save() {
    if (!form) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.day) || form.title.trim().length < 2) {
      setFormError(L("తేదీ, పేరు తప్పనిసరి.", "Date and title are required."));
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await saveCalendarNote(form);
      setForm(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    if (!form?.id) return;
    setSaving(true);
    try {
      await deleteCalendarNote(form.id);
      setForm(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const noteChip = (n: CalendarNote) => (
    <Chip key={n.id} size="small" clickable color={KIND_LABEL[n.kind].color} label={`${T(KIND_LABEL[n.kind])}: ${n.title}`} onClick={() => setForm({ ...n })} sx={{ justifyContent: "flex-start", maxWidth: "100%" }} />
  );
  const eventLine = (b: Booking) => (
    <Typography key={b.id} variant="caption" sx={{ display: "block", color: tokens.color.green }}>
      🍽 {b.customerNameSnapshot} · {b.guestCount}
    </Typography>
  );

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200 }}>
      <ScreenTitle
        title={L("పండుగలు & నోట్లు", "Festivals & notes")}
        subtitle={L("పండుగలు, ఐడియాలు, గుర్తులు — ఈ నెల ఈవెంట్లతో కలిపి", "Festivals, ideas and reminders — together with this month's events")}
        action={
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
            <TextField type="month" size="small" label={L("నెల", "Month")} value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && setView(v)}>
              <ToggleButton value="calendar">{L("క్యాలెండర్", "Calendar")}</ToggleButton>
              <ToggleButton value="list">{L("జాబితా", "List")}</ToggleButton>
            </ToggleButtonGroup>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setForm(EMPTY(month === today.slice(0, 7) ? today : `${month}-01`))}>
              {L("కొత్తది", "Add")}
            </Button>
          </Box>
        }
      />
      <ErrorBox message={error} />
      {view === "calendar" ? (
        <Paper sx={{ p: 1, overflowX: "auto" }}>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(120px, 1fr))", gap: 0.5, minWidth: 860 }}>
            {(lang === "te" ? WEEKDAYS_TE : WEEKDAYS_EN).map((w) => (
              <Typography key={w} variant="caption" sx={{ textAlign: "center", fontWeight: 600, py: 0.5 }}>
                {w}
              </Typography>
            ))}
            {Array.from({ length: lead }, (_, i) => (
              <Box key={`b${i}`} />
            ))}
            {days.map((d) => (
              <Box key={d} sx={{ minHeight: 96, border: `1px solid ${tokens.color.border}`, borderRadius: 1, p: 0.75, bgcolor: d === today ? tokens.color.greenTint : tokens.color.raised, display: "grid", alignContent: "start", gap: 0.5 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    {Number(d.slice(8))}
                  </Typography>
                  <Button size="small" sx={{ minWidth: 0, px: 0.75, lineHeight: 1 }} aria-label={L(`${formatDay(d, "te")} కి చేర్చు`, `Add on ${formatDay(d, "en")}`)} onClick={() => setForm(EMPTY(d))}>
                    +
                  </Button>
                </Box>
                {(eventsByDay[d] ?? []).map(eventLine)}
                {(notesByDay[d] ?? []).map(noteChip)}
              </Box>
            ))}
          </Box>
        </Paper>
      ) : (
        <Paper sx={{ p: 2, display: "grid", gap: 1.5 }}>
          {rows.length === 0 && Object.keys(eventsByDay).length === 0 ? (
            <Typography color="text.secondary">{L("ఈ నెల ఇంకా ఏమీ లేదు.", "Nothing this month yet.")}</Typography>
          ) : (
            days
              .filter((d) => notesByDay[d] || eventsByDay[d])
              .map((d) => (
                <Box key={d} sx={{ display: "grid", gap: 0.5, borderBottom: `1px solid ${tokens.color.border}`, pb: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    {formatDay(d, lang)}
                  </Typography>
                  {(eventsByDay[d] ?? []).map(eventLine)}
                  {(notesByDay[d] ?? []).map((n) => (
                    <Box key={n.id}>
                      {noteChip(n)}
                      {n.note && (
                        <Typography variant="body2" sx={{ mt: 0.5 }}>
                          {n.note}
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Box>
              ))
          )}
        </Paper>
      )}

      <Dialog open={!!form} onClose={() => !saving && setForm(null)} fullWidth maxWidth="sm">
        <DialogTitle>{form?.id ? L("మార్చు", "Edit") : L("కొత్తది", "New")}</DialogTitle>
        {form && (
          <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
            <TextField type="date" label={L("తేదీ", "Date")} value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField select label={L("రకం", "Type")} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as NoteKind })}>
              {NOTE_KINDS.map((k) => (
                <MenuItem key={k} value={k}>
                  {T(KIND_LABEL[k])}
                </MenuItem>
              ))}
            </TextField>
            <TextField label={L("పేరు", "Title")} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            {!!form.photos?.length && (
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                {form.photos.map((u) => (
                  <Box key={u} component="a" href={u} target="_blank" rel="noopener noreferrer">
                    <Box component="img" src={u} alt="" sx={{ width: 72, height: 72, objectFit: "cover", borderRadius: 1 }} />
                  </Box>
                ))}
              </Box>
            )}
            <TextField label={L("వివరం (ఐచ్ఛికం)", "Details (optional)")} value={form.note} multiline minRows={2} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            <ErrorBox message={formError} />
          </DialogContent>
        )}
        <DialogActions>
          {form?.id && (
            <Button color="error" onClick={() => void remove()} disabled={saving}>
              {L("తీసేయి", "Delete")}
            </Button>
          )}
          <Button onClick={() => setForm(null)} disabled={saving}>
            {L("వద్దు", "Cancel")}
          </Button>
          <Button variant="contained" onClick={() => void save()} disabled={saving}>
            {saving ? L("Save అవుతోంది…", "Saving…") : L("Save", "Save")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
