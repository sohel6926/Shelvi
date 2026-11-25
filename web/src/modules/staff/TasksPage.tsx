import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { collection, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import { useLang } from "../../i18n/LanguageContext";
import { useSession } from "../../auth/AuthProvider";
import { useBranch } from "../../session/BranchContext";
import { subscribeStaff, type Staff } from "../../data/records";
import { subscribeBookings, type Booking } from "../../data/bookingRepository";
import { completeTask, errorText } from "../../data/functions";
import { saveTask, SHIFT_ROLE_LABEL, subscribeDayShifts, subscribeTasks, type Shift, type Task, type TaskInput, type Who } from "../../data/staffWorkRepository";
import { refreshFromServer } from "../../data/refresh";
import { CancelButton } from "../../components/CancelControls";
import { ErrorBox, ScreenTitle } from "../../components/ui";
import { formatDay, istDay } from "../../util/dates";
import { tokens } from "../../theme/tokens";

/** R10-2 "ఈరోజు పనులు": today's shifts and the open / due tasks. Staff see only their own; A/M their branch. */
export function TasksPage() {
  const { L, T, lang } = useLang();
  const session = useSession();
  const { currentBranchId } = useBranch();
  const profile = session.status === "loggedIn" ? session.profile : null;
  const role = profile?.role ?? "staff";
  const canManage = role === "admin" || role === "manager";
  const who = useMemo<Who>(
    () => ({ role, branchId: role === "admin" ? currentBranchId : profile?.branchId ?? null, staffId: profile?.staffId ?? "", uid: profile?.uid ?? "" }),
    [role, currentBranchId, profile?.branchId, profile?.staffId, profile?.uid],
  );
  const today = istDay();
  const [day, setDay] = useState(today);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [showDone, setShowDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<TaskInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => subscribeDayShifts(day, who, setShifts, (e) => setError(e.message)), [day, who]);
  useEffect(() => subscribeTasks(who, setTasks, (e) => setError(e.message)), [who]);
  useEffect(() => (canManage ? subscribeStaff(who.branchId, (s) => setStaff(s.filter((x) => x.active && !x.cancelled))) : undefined), [canManage, who.branchId]);
  useEffect(() => (canManage ? subscribeBookings(who.branchId, (b) => setBookings(b.filter((x) => !x.cancelled))) : undefined), [canManage, who.branchId]);

  const liveTasks = tasks.filter((t) => !t.cancelled);
  const dueNow = liveTasks.filter((t) => t.status === "Open" && (!t.due || t.due <= day));
  const later = liveTasks.filter((t) => t.status === "Open" && t.due && t.due > day);
  const done = liveTasks.filter((t) => t.status === "Done");
  const upcomingBookings = bookings.filter((b) => !b.eventDate || istDay(b.eventDate) >= today).slice(0, 50);

  async function toggle(t: Task) {
    setError(null);
    try {
      await completeTask({ taskId: t.id, done: t.status !== "Done" });
    } catch (e) {
      setError(errorText(e, lang));
    }
  }

  async function save() {
    if (!form) return;
    if (form.title.trim().length < 2) {
      setFormError(L("పని ఏమిటో రాయండి.", "Write what the task is."));
      return;
    }
    const branch = who.branchId || profile?.branchId || "";
    if (!branch) {
      setFormError(L("ముందు పైన శాఖ (branch) ఎంచుకోండి.", "Select a branch first."));
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await saveTask(form, branch);
      setForm(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const taskRow = (t: Task) => (
    <Box key={t.id} sx={{ display: "flex", gap: 1, alignItems: "flex-start", borderBottom: `1px solid ${tokens.color.border}`, py: 0.75 }}>
      <Checkbox checked={t.status === "Done"} onChange={() => toggle(t)} slotProps={{ input: { "aria-label": L(`పూర్తి: ${t.title}`, `Done: ${t.title}`) } }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600, textDecoration: t.status === "Done" ? "line-through" : "none" }}>{t.title}</Typography>
        <Typography variant="body2" color="text.secondary">
          {[t.assigneeName, t.due ? `${L("గడువు", "due")} ${formatDay(t.due, lang)}` : "", t.status === "Done" && t.doneBy ? `${L("చేశారు", "done by")} ${t.doneBy}` : ""].filter(Boolean).join(" · ")}
        </Typography>
        {t.due && t.due < day && t.status === "Open" && <Chip size="small" color="error" label={L("గడువు దాటింది", "Overdue")} sx={{ mt: 0.5 }} />}
      </Box>
      {canManage && (
        <Box sx={{ display: "flex", alignItems: "center" }}>
          <Button size="small" onClick={() => setForm({ id: t.id, title: t.title, assigneeStaffId: t.assigneeStaffId, assigneeName: t.assigneeName, bookingId: t.bookingId, due: t.due })}>
            {L("మార్చు", "Edit")}
          </Button>
          <CancelButton collection="tasks" id={t.id} what={t.title} />
        </Box>
      )}
    </Box>
  );

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1000 }}>
      <ScreenTitle
        title={L("ఈరోజు పనులు", "Today's tasks")}
        subtitle={role === "staff" ? L("మీ shifts, మీకు ఇచ్చిన పనులు", "Your shifts and tasks") : L("Shifts, పనులు — ఎవరు ఏం చేయాలి", "Shifts and tasks — who does what")}
        onRefresh={() =>
          refreshFromServer(
            query(collection(db, "shifts"), where("date", "==", day), ...(who.role === "staff" ? [where("staffId", "==", who.staffId || "-")] : who.branchId ? [where("branchId", "==", who.branchId)] : [])),
          )
        }
        action={
          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            <TextField type="date" size="small" label={L("రోజు", "Day")} value={day} onChange={(e) => e.target.value && setDay(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            {canManage && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setFormError(null); setForm({ title: "", assigneeStaffId: "", assigneeName: "", bookingId: "", due: day }); }}>
                {L("కొత్త పని", "New task")}
              </Button>
            )}
          </Box>
        }
      />
      <ErrorBox message={error} />
      {role === "staff" && !profile?.staffId && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {L("మీ login కి సిబ్బంది record జత చేయలేదు — యజమానిని అడగండి.", "Your login is not linked to a staff record — ask the owner.")}
        </Alert>
      )}

      <Paper sx={{ p: 2.5, mb: 2 }}>
        <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
          {L(`Shifts — ${formatDay(day, "te")}`, `Shifts — ${formatDay(day, "en")}`)}
        </Typography>
        {shifts.filter((s) => !s.cancelled).length === 0 ? (
          <Typography color="text.secondary">{L("ఈ రోజు shifts లేవు.", "No shifts on this day.")}</Typography>
        ) : (
          shifts
            .filter((s) => !s.cancelled)
            .map((s) => (
              <Box key={s.id} sx={{ display: "flex", justifyContent: "space-between", gap: 1, flexWrap: "wrap", borderBottom: `1px solid ${tokens.color.border}`, py: 0.75 }}>
                <Typography sx={{ fontWeight: 600 }}>
                  {s.startTime}–{s.endTime} · {s.staffName}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {SHIFT_ROLE_LABEL[s.role] ? T(SHIFT_ROLE_LABEL[s.role]) : s.role} · {s.customer}
                </Typography>
              </Box>
            ))
        )}
      </Paper>

      <Paper sx={{ p: 2.5, mb: 2 }}>
        <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
          {L(`చేయాల్సిన పనులు (${dueNow.length})`, `Tasks to do (${dueNow.length})`)}
        </Typography>
        {dueNow.length === 0 ? <Typography color="text.secondary">{L("ఈ రోజుకి పనులు లేవు.", "Nothing due.")}</Typography> : dueNow.map(taskRow)}
        {later.length > 0 && (
          <>
            <Typography sx={{ fontWeight: 600, mt: 2 }}>{L("తర్వాత రోజులు", "Later")}</Typography>
            {later.map(taskRow)}
          </>
        )}
        {done.length > 0 && (
          <Button size="small" sx={{ mt: 1 }} onClick={() => setShowDone((v) => !v)}>
            {showDone ? L("పూర్తైనవి దాచు", "Hide done") : L(`పూర్తైనవి చూపించు (${done.length})`, `Show done (${done.length})`)}
          </Button>
        )}
        {showDone && done.slice(0, 50).map(taskRow)}
      </Paper>

      <Dialog open={!!form} onClose={() => !saving && setForm(null)} fullWidth maxWidth="sm">
        <DialogTitle>{form?.id ? L("పని మార్చు", "Edit task") : L("కొత్త పని", "New task")}</DialogTitle>
        {form && (
          <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
            <TextField label={L("ఏం చేయాలి", "What to do")} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} multiline />
            <TextField
              select
              label={L("ఎవరికి", "Assign to")}
              value={form.assigneeStaffId}
              onChange={(e) => setForm({ ...form, assigneeStaffId: e.target.value, assigneeName: staff.find((s) => s.id === e.target.value)?.name ?? "" })}
            >
              <MenuItem value="">{L("ఎవరికీ కాదు", "Nobody yet")}</MenuItem>
              {staff.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label={L("ఏ event కి (ఐచ్ఛికం)", "For which event (optional)")} value={form.bookingId} onChange={(e) => setForm({ ...form, bookingId: e.target.value })}>
              <MenuItem value="">{L("ఏదీ కాదు", "None")}</MenuItem>
              {upcomingBookings.map((b) => (
                <MenuItem key={b.id} value={b.id}>
                  {b.customerNameSnapshot} · {b.eventDate ? formatDay(istDay(b.eventDate), lang) : ""}
                </MenuItem>
              ))}
            </TextField>
            <TextField type="date" label={L("గడువు", "Due")} value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
            <ErrorBox message={formError} />
          </DialogContent>
        )}
        <DialogActions>
          <Button onClick={() => setForm(null)} disabled={saving}>
            {L("వద్దు", "Cancel")}
          </Button>
          <Button variant="contained" onClick={save} disabled={saving}>
            {saving ? L("Save అవుతోంది…", "Saving…") : L("Save", "Save")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
