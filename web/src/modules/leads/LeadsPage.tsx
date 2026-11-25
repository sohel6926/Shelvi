import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  FormControlLabel,
  MenuItem,
  Paper,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useSession } from "../../auth/AuthProvider";
import { useBranch } from "../../session/BranchContext";
import { dateLocale, useLang } from "../../i18n/LanguageContext";
import {
  LEAD_OPEN_STATUSES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  convertLeadToCustomer,
  isLeadOpen,
  leadMinutesLate,
  saveLead,
  setLeadStatus,
  subscribeLeadComments,
  subscribeLeads,
  type Lead,
  type LeadComment,
  type LeadInput,
  type LeadSource,
  type LeadStatus,
} from "../../data/leadsRepository";
import { DataTable, StatCard, StatRow } from "../../components/DataTable";
import { ErrorBox, parseMoney, parseWhole, rupees, ScreenTitle } from "../../components/ui";
import { formatDay, istDay } from "../../util/dates";
import { branchQuery, refreshFromServer } from "../../data/refresh";
import { CancelButton, CancelledChip, ShowCancelledSwitch } from "../../components/CancelControls";
import { addLeadComment, assignLead, errorText, leadAssignees, type LeadAssignee } from "../../data/functions";
import { SOURCE_LABEL, STATUS_LABEL } from "./leadLabels";
import { LeadAssignCard } from "./LeadAssignCard";
import { LeadReportView } from "./LeadReportView";
import { useBusinessSettings } from "../../data/settingsRepository";
import { BAND_LABEL, phoneKey, scoreLead, type LeadBand } from "./leadScore";

interface FormState {
  id?: string;
  name: string;
  phone: string;
  source: LeadSource;
  campaignId: string;
  eventDate: string;
  guests: string;
  budget: string;
  status: LeadStatus;
  followUpDate: string;
  /** Module 1e */
  followUpTime: string;
  notes: string;
  lostReason: string;
  whatsappOptIn: boolean;
  /** Module 1c: "" = automatic HOT / WARM / COLD */
  scoreManual: "" | LeadBand;
  /** R10-7: linked customer ("" = not converted yet). */
  customerId?: string;
}

const EMPTY: FormState = {
  name: "",
  phone: "",
  source: "instagram",
  campaignId: "",
  eventDate: "",
  guests: "",
  budget: "",
  status: "new",
  followUpDate: "",
  followUpTime: "",
  notes: "",
  lostReason: "",
  whatsappOptIn: false,
  scoreManual: "",
};

function toForm(l: Lead): FormState {
  return {
    id: l.id,
    name: l.name,
    phone: l.phone,
    source: l.source,
    campaignId: l.campaignId,
    eventDate: l.eventDate,
    guests: l.guests ? String(l.guests) : "",
    budget: l.budget ? String(l.budget) : "",
    status: l.status,
    followUpDate: l.followUpDate,
    followUpTime: l.followUpTime,
    notes: l.notes,
    lostReason: l.lostReason,
    whatsappOptIn: l.whatsappOptIn,
    scoreManual: l.scoreManual,
    customerId: l.customerId,
  };
}

/** YYYY-MM-DD + n days (calendar arithmetic in UTC, so no time-zone slip). */
function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function LeadsPage() {
  const { L, T, lang } = useLang();
  const session = useSession();
  const { currentBranchId } = useBranch();
  const uid = session.status === "loggedIn" ? session.profile.uid : "";
  const [allLeads, setLeads] = useState<Lead[]>([]);
  const [showCancelled, setShowCancelled] = useState(false);
  const leads = useMemo(() => allLeads.filter((l) => !l.cancelled), [allLeads]);
  const isAdmin = session.status === "loggedIn" && session.profile.role === "admin";
  const [filter, setFilter] = useState<LeadStatus | "open" | "all" | "mine">("open");
  /** Module 1a: list or pipeline board */
  const [view, setView] = useState<"list" | "board" | "report">("list");
  const [people, setPeople] = useState<LeadAssignee[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  /** Module 1b: the response-time rule and a clock that ticks once a minute for the "late" chips. */
  const { settings } = useBusinessSettings();
  const tat = settings.leadTat;
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 60000);
    return () => window.clearInterval(t);
  }, []);
  const lateText = (minutes: number) =>
    minutes >= 60 ? L(`${Math.floor(minutes / 60)} గం ${minutes % 60} ని ఆలస్యం`, `${Math.floor(minutes / 60)} h ${minutes % 60} min late`) : L(`${minutes} ని ఆలస్యం`, `${minutes} min late`);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const today = istDay();
  const navigate = useNavigate();
  const [converting, setConverting] = useState(false);

  /** Module 1e: team notes of the lead that is open in the dialog */
  const [comments, setComments] = useState<LeadComment[]>([]);
  const [noteText, setNoteText] = useState("");
  const [noteMentions, setNoteMentions] = useState<string[]>([]);
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const openLeadId = form?.id ?? "";
  useEffect(() => {
    setComments([]);
    setNoteText("");
    setNoteMentions([]);
    setNoteError(null);
    if (!openLeadId) return;
    return subscribeLeadComments(openLeadId, setComments, (e) => setNoteError(e.message));
  }, [openLeadId]);

  async function sendNote() {
    if (!openLeadId || !noteText.trim()) return;
    setNoteBusy(true);
    setNoteError(null);
    try {
      await addLeadComment({ leadId: openLeadId, text: noteText.trim(), mentions: noteMentions });
      setNoteText("");
      setNoteMentions([]);
    } catch (e) {
      setNoteError(errorText(e, lang));
    } finally {
      setNoteBusy(false);
    }
  }

  /** R10-7: create / link the customer from the saved lead (lead history stays; lead → won). */
  async function convert() {
    if (!form?.id) return;
    const lead = allLeads.find((l) => l.id === form.id);
    if (!lead) return;
    setConverting(true);
    setFormError(null);
    try {
      const customerId = await convertLeadToCustomer(lead, uid);
      setForm({ ...form, customerId, status: "won" });
    } catch (e) {
      setFormError(L("కస్టమర్‌గా మార్చలేకపోయాం", "Could not convert to customer") + `: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setConverting(false);
    }
  }

  useEffect(() => subscribeLeads(currentBranchId, setLeads, (e) => setError(e.message)), [currentBranchId]);

  // People who can take leads (for the "ఎవరికి" picker). The page still works if this fails.
  useEffect(() => {
    let live = true;
    leadAssignees({})
      .then((r) => live && setPeople(r.people))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  /** Module 1a: hand the open lead to a person ("" = nobody). The server checks and stamps it. */
  async function assign(toUid: string) {
    if (!form?.id) return;
    setAssigning(true);
    setFormError(null);
    try {
      await assignLead({ leadId: form.id, uid: toUid });
    } catch (e) {
      setFormError(L("అప్పగించలేకపోయాం", "Could not assign") + `: ${errorText(e, lang)}`);
    } finally {
      setAssigning(false);
    }
  }

  /** Board: move a lead to another stage. */
  async function moveTo(leadId: string, status: LeadStatus) {
    const lead = allLeads.find((l) => l.id === leadId);
    if (!lead || lead.cancelled || lead.status === status) return;
    setError(null);
    try {
      await setLeadStatus(leadId, status);
    } catch (e) {
      setError(L("దశ మార్చలేకపోయాం", "Could not change the stage") + `: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of leads) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [leads]);

  const dueToday = leads.filter((l) => l.followUpDate && l.followUpDate <= today && isLeadOpen(l.status));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (showCancelled ? allLeads : leads)
      .filter((l) =>
        filter === "all" ? true : filter === "open" ? isLeadOpen(l.status) : filter === "mine" ? l.assignedTo === uid && isLeadOpen(l.status) : l.status === filter,
      )
      .filter((l) => !q || l.name.toLowerCase().includes(q) || l.phone.includes(q))
      .sort((a, b) => (a.followUpDate || "9999").localeCompare(b.followUpDate || "9999"));
  }, [allLeads, leads, filter, search, showCancelled, uid]);

  /** Board columns: open leads only, same search box; "mine" narrows it to my leads. */
  const boardLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads
      .filter((l) => isLeadOpen(l.status))
      .filter((l) => (filter === "mine" ? l.assignedTo === uid : true))
      .filter((l) => !q || l.name.toLowerCase().includes(q) || l.phone.includes(q))
      .sort((a, b) => (a.followUpDate || "9999").localeCompare(b.followUpDate || "9999"));
  }, [leads, filter, search, uid]);
  const currentLead = form?.id ? allLeads.find((l) => l.id === form.id) : undefined;

  /** Module 1c: HOT / WARM / COLD chip of a lead (nothing for closed leads). */
  const bandChip = (l: Lead) => {
    const sc = scoreLead(l, today);
    if (!sc) return null;
    return <Chip size="small" color={BAND_LABEL[sc.band].color} variant={sc.manual ? "filled" : "outlined"} label={`${T(BAND_LABEL[sc.band])}${sc.manual ? ` · ${L("చేతితో", "manual")}` : ""}`} />;
  };
  /** Module 1c: another live lead with the same phone (warning only — saving is still allowed). */
  const duplicateOf = useMemo(() => {
    if (!form) return undefined;
    const key = phoneKey(form.phone);
    if (!key) return undefined;
    return leads.find((l) => l.id !== form.id && phoneKey(l.phone) === key);
  }, [form, leads]);
  /** Live score of what is typed in the open form. */
  const formScore = form
    ? scoreLead({ status: form.status, source: form.source, eventDate: form.eventDate, guests: parseWhole(form.guests) || null, budget: parseMoney(form.budget) || null, scoreManual: form.scoreManual }, today)
    : null;

  async function save() {
    if (!form) return;
    setFormError(null);
    if (!form.name.trim() || !form.phone.trim()) {
      setFormError(L("పేరు, ఫోన్ తప్పనిసరి.", "Name and phone are required."));
      return;
    }
    const guests = parseWhole(form.guests);
    const budget = parseMoney(form.budget);
    if (Number.isNaN(guests) || (guests !== null && guests < 1)) {
      setFormError(L("అతిథుల సంఖ్య 1 లేదా ఎక్కువ పూర్ణ సంఖ్య.", "Guests must be a whole number of 1 or more."));
      return;
    }
    if (Number.isNaN(budget)) {
      setFormError(L("బడ్జెట్ సరిగా లేదు.", "Budget is not valid."));
      return;
    }
    if (form.followUpTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(form.followUpTime)) {
      setFormError(L("మళ్ళీ మాట్లాడే సమయం సరిగా లేదు.", "Follow-up time is not valid."));
      return;
    }
    if (form.followUpTime && !form.followUpDate) {
      setFormError(L("సమయం పెట్టాలంటే ముందు తేదీ ఎంచుకోండి.", "Pick a follow-up date before setting a time."));
      return;
    }
    const input: LeadInput = {
      id: form.id,
      name: form.name,
      phone: form.phone,
      source: form.source,
      campaignId: form.campaignId.trim(),
      eventDate: form.eventDate,
      guests,
      budget,
      status: form.status,
      followUpDate: form.followUpDate,
      followUpTime: form.followUpTime,
      notes: form.notes,
      lostReason: form.lostReason,
      whatsappOptIn: form.whatsappOptIn,
      scoreManual: form.scoreManual,
    };
    setSaving(true);
    try {
      await saveLead(input, uid, currentBranchId);
      setForm(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const f = form;

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <ScreenTitle
        title={L("ఎంక్వైరీలు (Leads)", "Leads")}
        subtitle={L("ఎవరు అడిగారు, ఎప్పుడు మళ్ళీ మాట్లాడాలి", "Who asked, and when to call back")}
        onRefresh={() => refreshFromServer(branchQuery("leads", currentBranchId))}
        action={
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            {isAdmin && (
              <Button variant="outlined" onClick={() => setAssignOpen(true)}>
                {L("ఆటో పనులు", "Automation")}
              </Button>
            )}
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setForm({ ...EMPTY })}>
              {L("కొత్త ఎంక్వైరీ", "New lead")}
            </Button>
          </Box>
        }
      />
      <ErrorBox message={error} />
      {dueToday.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {L(`ఈరోజు / ముందే మాట్లాడాల్సినవి: ${dueToday.length}`, `Follow-ups due today or overdue: ${dueToday.length}`)}
        </Alert>
      )}
      <StatRow>
        <StatCard label={L("తెరిచి ఉన్నవి", "Open")} value={leads.filter((l) => isLeadOpen(l.status)).length} />
        <StatCard label={L("ఎవరికీ అప్పగించనివి", "Unassigned")} value={leads.filter((l) => isLeadOpen(l.status) && !l.assignedTo).length} tone="warn" />
        {tat.on && <StatCard label={L(`${tat.minutes} ని దాటినా మాట్లాడనివి`, `Not answered in ${tat.minutes} min`)} value={leads.filter((l) => leadMinutesLate(l, nowMs, tat) > 0).length} tone="warn" />}
        <StatCard label={L("బుక్ అయినవి", "Won")} value={counts.won ?? 0} tone="good" />
        <StatCard label={L("పోయినవి", "Lost")} value={counts.lost ?? 0} tone="warn" />
      </StatRow>

      <ToggleButtonGroup exclusive size="small" value={view} onChange={(_, v) => v && setView(v)} sx={{ mb: 2 }}>
        <ToggleButton value="list" sx={{ minHeight: 44, px: 2 }}>
          {L("జాబితా", "List")}
        </ToggleButton>
        <ToggleButton value="board" sx={{ minHeight: 44, px: 2 }}>
          {L("పైప్‌లైన్ బోర్డ్", "Pipeline board")}
        </ToggleButton>
        <ToggleButton value="report" sx={{ minHeight: 44, px: 2 }}>
          {L("రిపోర్ట్", "Report")}
        </ToggleButton>
      </ToggleButtonGroup>

      {view === "report" && <LeadReportView branchId={currentBranchId} />}

      <Box sx={{ display: view === "report" ? "none" : "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
        {(view === "board" ? (["open", "mine"] as const) : (["open", "mine", "all", ...LEAD_STATUSES] as const)).map((s) => (
          <Chip
            key={s}
            clickable
            onClick={() => setFilter(s)}
            color={(view === "board" && s === "open" ? filter !== "mine" : filter === s) ? "primary" : "default"}
            variant={(view === "board" && s === "open" ? filter !== "mine" : filter === s) ? "filled" : "outlined"}
            sx={{ minHeight: 44 }}
            label={
              s === "open"
                ? L("తెరిచి ఉన్నవి", "Open")
                : s === "mine"
                  ? L("నావి", "Mine")
                  : s === "all"
                  ? L("అన్నీ", "All")
                  : `${T(STATUS_LABEL[s])} (${counts[s] ?? 0})`
            }
          />
        ))}
        <TextField
          size="small"
          placeholder={L("పేరు / ఫోన్ వెతకండి", "Search name or phone")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ ml: { md: "auto" }, minWidth: 220 }}
        />
        {view === "list" && <ShowCancelledSwitch checked={showCancelled} onChange={setShowCancelled} count={allLeads.length - leads.length} />}
      </Box>

      {view === "board" && (
        <Box sx={{ display: "flex", gap: 1.5, overflowX: "auto", pb: 1, alignItems: "flex-start" }}>
          {LEAD_OPEN_STATUSES.map((stage) => {
            const cards = boardLeads.filter((l) => l.status === stage);
            return (
              <Paper
                key={stage}
                variant="outlined"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain") || dragId;
                  setDragId(null);
                  if (id) void moveTo(id, stage);
                }}
                sx={{ flex: "0 0 260px", p: 1, bgcolor: "action.hover", minHeight: 160 }}
              >
                <Typography variant="subtitle2" sx={{ px: 0.5, pb: 1 }}>
                  {T(STATUS_LABEL[stage])} ({cards.length})
                </Typography>
                <Box sx={{ display: "grid", gap: 1 }}>
                  {cards.map((l) => (
                    <Paper
                      key={l.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", l.id);
                        setDragId(l.id);
                      }}
                      onDragEnd={() => setDragId(null)}
                      onClick={() => setForm(toForm(l))}
                      sx={{ p: 1.25, cursor: "pointer", opacity: dragId === l.id ? 0.5 : 1 }}
                    >
                      <Typography sx={{ fontWeight: 600 }}>{l.name}</Typography>
                      <Typography variant="body2">
                        <a href={`tel:${l.phone}`} onClick={(e: { stopPropagation: () => void }) => e.stopPropagation()}>
                          {l.phone}
                        </a>
                        {" · "}
                        {T(SOURCE_LABEL[l.source])}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {l.eventDate ? formatDay(l.eventDate, lang) : L("తేదీ తెలియదు", "No date yet")}
                        {l.guests ? ` · ${l.guests} ${L("మంది", "guests")}` : ""}
                      </Typography>
                      <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.75 }}>
                        <Chip size="small" variant="outlined" color={l.assignedTo ? "default" : "warning"} label={l.assignedName || (l.assignedTo ? "…" : L("ఎవరికీ లేదు", "Unassigned"))} />
                        {leadMinutesLate(l, nowMs, tat) > 0 && <Chip size="small" color="error" label={lateText(leadMinutesLate(l, nowMs, tat))} />}
                        {bandChip(l)}
                        {l.followUpDate && (
                          <Chip
                            size="small"
                            color={l.followUpDate < today ? "error" : l.followUpDate === today ? "warning" : "default"}
                            label={`${formatDay(l.followUpDate, lang)}${l.followUpTime ? ` ${l.followUpTime}` : ""}`}
                          />
                        )}
                      </Box>
                      {/* Touch screens cannot drag: the same move as a picker. */}
                      <TextField
                        select
                        size="small"
                        variant="standard"
                        value={l.status}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => void moveTo(l.id, e.target.value as LeadStatus)}
                        sx={{ mt: 0.75, minWidth: 150 }}
                        slotProps={{ htmlInput: { "aria-label": L("దశ మార్చు", "Change stage") } }}
                      >
                        {LEAD_STATUSES.map((s) => (
                          <MenuItem key={s} value={s}>
                            {T(STATUS_LABEL[s])}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Paper>
                  ))}
                  {cards.length === 0 && (
                    <Typography variant="body2" color="text.secondary" sx={{ px: 0.5 }}>
                      {L("ఖాళీ", "Empty")}
                    </Typography>
                  )}
                </Box>
              </Paper>
            );
          })}
        </Box>
      )}

      {view === "list" && (
      <DataTable
        rows={filtered}
        rowKey={(l) => l.id}
        onRowClick={(l) => !l.cancelled && setForm(toForm(l))}
        emptyText={L("ఎంక్వైరీలు లేవు.", "No leads.")}
        columns={[
          { label: L("పేరు", "Name"), render: (l) => l.name },
          { label: L("ఫోన్", "Phone"), render: (l) => <a href={`tel:${l.phone}`} onClick={(e: { stopPropagation: () => void }) => e.stopPropagation()}>{l.phone}</a> },
          { label: L("ఎక్కడి నుండి", "Source"), hideOnMobile: true, render: (l) => T(SOURCE_LABEL[l.source]) },
          { label: L("అవకాశం", "Chance"), hideOnMobile: true, render: (l) => (l.cancelled ? null : bandChip(l)) ?? "—" },
          { label: L("ఎవరు చూస్తున్నారు", "Assigned to"), hideOnMobile: true, render: (l) => l.assignedName || (l.assignedTo ? "…" : "—") },
          { label: L("Event తేదీ", "Event date"), hideOnMobile: true, render: (l) => formatDay(l.eventDate, lang) },
          { label: L("అతిథులు", "Guests"), align: "right", hideOnMobile: true, render: (l) => l.guests ?? "—" },
          { label: L("బడ్జెట్", "Budget"), align: "right", hideOnMobile: true, render: (l) => (l.budget ? rupees(l.budget) : "—") },
          {
            label: L("మళ్ళీ మాట్లాడాలి", "Follow up"),
            render: (l) =>
              l.followUpDate ? (
                <Chip
                  size="small"
                  color={l.followUpDate < today ? "error" : l.followUpDate === today ? "warning" : "default"}
                  label={`${formatDay(l.followUpDate, lang)}${l.followUpTime ? ` ${l.followUpTime}` : ""}${l.followUpDate < today ? ` · ${L("ఆలస్యం", "late")}` : ""}`}
                />
              ) : (
                "—"
              ),
          },
          {
            label: L("స్థితి", "Status"),
            render: (l) =>
              l.cancelled ? (
                <CancelledChip reason={l.cancelReason} />
              ) : (
                <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                  <Chip size="small" color={STATUS_LABEL[l.status].color} label={T(STATUS_LABEL[l.status])} />
                  {leadMinutesLate(l, nowMs, tat) > 0 && <Chip size="small" color="error" label={lateText(leadMinutesLate(l, nowMs, tat))} />}
                </Box>
              ),
          },
          { label: "", render: (l) => (l.cancelled ? null : <CancelButton collection="leads" id={l.id} what={l.name} />) },
        ]}
      />
      )}

      <Dialog open={assignOpen} onClose={() => setAssignOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{L("ఎంక్వైరీలు: ఆటో అప్పగింత, స్పందన సమయం", "Leads: auto-assign and response time")}</DialogTitle>
        <DialogContent sx={{ pt: "8px !important" }}>{assignOpen && <LeadAssignCard />}</DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignOpen(false)}>{L("మూసివేయి", "Close")}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!f} onClose={() => !saving && setForm(null)} fullWidth maxWidth="sm">
        <DialogTitle>{f?.id ? L("ఎంక్వైరీ మార్చు", "Edit lead") : L("కొత్త ఎంక్వైరీ", "New lead")}</DialogTitle>
        {f && (
          <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
            <TextField label={L("పేరు", "Name")} value={f.name} onChange={(e) => setForm({ ...f, name: e.target.value })} required />
            <TextField label={L("ఫోన్", "Phone")} value={f.phone} onChange={(e) => setForm({ ...f, phone: e.target.value })} inputMode="tel" required />
            {duplicateOf && (
              <Alert
                severity="warning"
                action={
                  <Button color="inherit" size="small" onClick={() => setForm(toForm(duplicateOf))}>
                    {L("అది తెరువు", "Open it")}
                  </Button>
                }
              >
                {L("ఈ ఫోన్ నంబర్ తో ఇప్పటికే ఎంక్వైరీ ఉంది", "A lead with this phone already exists")}: {duplicateOf.name} ({T(STATUS_LABEL[duplicateOf.status])})
              </Alert>
            )}
            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "1fr 1fr" }}>
              <TextField select label={L("ఎక్కడి నుండి", "Source")} value={f.source} onChange={(e) => setForm({ ...f, source: e.target.value as LeadSource })}>
                {LEAD_SOURCES.map((s) => (
                  <MenuItem key={s} value={s}>
                    {T(SOURCE_LABEL[s])}
                  </MenuItem>
                ))}
              </TextField>
              <TextField label={L("Ad / campaign", "Ad / campaign")} value={f.campaignId} onChange={(e) => setForm({ ...f, campaignId: e.target.value })} />
              <TextField
                type="date"
                label={L("Event తేదీ", "Event date")}
                value={f.eventDate}
                onChange={(e) => setForm({ ...f, eventDate: e.target.value })}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField label={L("అతిథులు", "Guests")} value={f.guests} onChange={(e) => setForm({ ...f, guests: e.target.value })} inputMode="numeric" />
              <TextField label={L("బడ్జెట్ (₹)", "Budget (₹)")} value={f.budget} onChange={(e) => setForm({ ...f, budget: e.target.value })} inputMode="decimal" />
              <TextField
                type="date"
                label={L("మళ్ళీ మాట్లాడే తేదీ", "Follow-up date")}
                value={f.followUpDate}
                onChange={(e) => setForm({ ...f, followUpDate: e.target.value })}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                type="time"
                label={L("ఏ సమయానికి (ఐచ్ఛికం)", "At what time (optional)")}
                value={f.followUpTime}
                onChange={(e) => setForm({ ...f, followUpTime: e.target.value })}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Box>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
              <Typography variant="body2" color="text.secondary">
                {L("వాయిదా:", "Snooze:")}
              </Typography>
              {([1, 3, 7] as const).map((n) => (
                <Button key={n} size="small" variant="outlined" sx={{ minHeight: 40 }} onClick={() => setForm({ ...f, followUpDate: addDays(today, n) })}>
                  {n === 1 ? L("రేపు", "Tomorrow") : L(`${n} రోజుల తర్వాత`, `In ${n} days`)}
                </Button>
              ))}
              {f.followUpDate && (
                <Button size="small" sx={{ minHeight: 40 }} onClick={() => setForm({ ...f, followUpDate: "", followUpTime: "" })}>
                  {L("తీసేయి", "Clear")}
                </Button>
              )}
            </Box>
            <TextField
              label={L("నోట్స్ (కస్టమర్ ఏం అడిగారు)", "Notes (what the customer asked)")}
              value={f.notes}
              onChange={(e) => setForm({ ...f, notes: e.target.value })}
              multiline
              minRows={2}
              slotProps={{ htmlInput: { maxLength: 5000 } }}
            />
            <TextField select label={L("స్థితి", "Status")} value={f.status} onChange={(e) => setForm({ ...f, status: e.target.value as LeadStatus })}>
              {LEAD_STATUSES.map((s) => (
                <MenuItem key={s} value={s}>
                  {T(STATUS_LABEL[s])}
                </MenuItem>
              ))}
            </TextField>
            {formScore && (
              <Paper variant="outlined" sx={{ p: 1.5, display: "grid", gap: 1 }}>
                <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                  <Chip size="small" color={BAND_LABEL[formScore.band].color} label={T(BAND_LABEL[formScore.band])} />
                  <Typography variant="body2">
                    {L(`ఆటో మార్కులు: ${formScore.score} / 100`, `Automatic points: ${formScore.score} / 100`)}
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {formScore.reasons.map((r) => `${T(r)} (+${r.points})`).join(" · ")}
                </Typography>
                <TextField
                  select
                  size="small"
                  label={L("అవకాశం: ఆటో లేదా చేతితో", "Chance: automatic or by hand")}
                  value={f.scoreManual}
                  onChange={(e) => setForm({ ...f, scoreManual: e.target.value as "" | LeadBand })}
                >
                  <MenuItem value="">{L("ఆటోమేటిక్ (CRM లెక్క)", "Automatic")}</MenuItem>
                  <MenuItem value="hot">{T(BAND_LABEL.hot)}</MenuItem>
                  <MenuItem value="warm">{T(BAND_LABEL.warm)}</MenuItem>
                  <MenuItem value="cold">{T(BAND_LABEL.cold)}</MenuItem>
                </TextField>
              </Paper>
            )}
            {f.id ? (
              <TextField
                select
                label={L("ఎవరు చూసుకోవాలి", "Assigned to")}
                value={people.some((p) => p.uid === (currentLead?.assignedTo ?? "")) ? (currentLead?.assignedTo ?? "") : ""}
                onChange={(e) => void assign(e.target.value)}
                disabled={assigning || people.length === 0}
                helperText={
                  assigning
                    ? L("అప్పగిస్తున్నాం…", "Assigning…")
                    : currentLead?.assignedBy === "auto"
                      ? L("CRM దానంతట అదే అప్పగించింది. మీరు మార్చవచ్చు.", "Assigned automatically. You can change it.")
                      : currentLead?.assignedTo && !people.some((p) => p.uid === currentLead.assignedTo)
                        ? `${L("ఇప్పుడు", "Now")}: ${currentLead.assignedName}`
                        : " "
                }
              >
                <MenuItem value="">{L("— ఎవరికీ లేదు —", "— nobody —")}</MenuItem>
                {people.map((p) => (
                  <MenuItem key={p.uid} value={p.uid}>
                    {p.name}
                  </MenuItem>
                ))}
              </TextField>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {L("Save చేశాక ఎవరికి అప్పగించాలో ఎంచుకోవచ్చు (ఆటో అప్పగింత ఆన్‌లో ఉంటే దానంతట అదే జరుగుతుంది).", "After saving you can pick who handles it (it happens by itself when auto-assign is on).")}
              </Typography>
            )}
            {f.status === "lost" && (
              <TextField
                label={L("ఎందుకు పోయింది", "Why was it lost")}
                value={f.lostReason}
                onChange={(e) => setForm({ ...f, lostReason: e.target.value })}
                multiline
              />
            )}
            {f.id && (
              <Paper variant="outlined" sx={{ p: 1.5, display: "grid", gap: 1 }}>
                <Typography variant="subtitle2">{L("టీమ్ నోట్స్ (మన మధ్య మాత్రమే)", "Team notes (internal only)")}</Typography>
                {comments.length === 0 && (
                  <Typography variant="body2" color="text.secondary">
                    {L("ఇంకా నోట్స్ లేవు.", "No notes yet.")}
                  </Typography>
                )}
                <Box sx={{ display: "grid", gap: 1, maxHeight: 220, overflowY: "auto" }}>
                  {comments.map((c) => (
                    <Box key={c.id} sx={{ bgcolor: "action.hover", borderRadius: 1, p: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        {c.createdByName || people.find((p) => p.uid === c.createdBy)?.name || L("(తెలియదు)", "(unknown)")}
                        {c.createdAt ? ` · ${c.createdAt.toLocaleString(dateLocale(lang), { dateStyle: "medium", timeStyle: "short" })}` : ""}
                        {c.mentions.length > 0 ? ` · @${c.mentions.map((u) => people.find((p) => p.uid === u)?.name ?? "…").join(", @")}` : ""}
                      </Typography>
                      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                        {c.text}
                      </Typography>
                    </Box>
                  ))}
                </Box>
                <TextField
                  size="small"
                  multiline
                  placeholder={L("నోట్ రాయండి…", "Write a note…")}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  slotProps={{ htmlInput: { maxLength: 2000, "aria-label": L("టీమ్ నోట్", "Team note") } }}
                />
                <TextField
                  select
                  size="small"
                  label={L("ఎవరికి చెప్పాలి (@)", "Who to tell (@)")}
                  value={noteMentions}
                  onChange={(e) => setNoteMentions(typeof e.target.value === "string" ? e.target.value.split(",") : (e.target.value as unknown as string[]))}
                  slotProps={{ select: { multiple: true } }}
                  disabled={people.length === 0}
                >
                  {people
                    .filter((p) => p.uid !== uid)
                    .map((p) => (
                      <MenuItem key={p.uid} value={p.uid}>
                        {p.name}
                      </MenuItem>
                    ))}
                </TextField>
                <ErrorBox message={noteError} />
                <Box>
                  <Button variant="outlined" onClick={sendNote} disabled={noteBusy || !noteText.trim()}>
                    {noteBusy ? L("పంపుతున్నాం…", "Sending…") : L("నోట్ చేర్చు", "Add note")}
                  </Button>
                </Box>
              </Paper>
            )}
            <FormControlLabel
              control={<Checkbox checked={f.whatsappOptIn} onChange={(e) => setForm({ ...f, whatsappOptIn: e.target.checked })} />}
              label={L("WhatsApp లో మెసేజ్ పంపడానికి customer అనుమతి ఇచ్చారు", "Customer agreed to WhatsApp messages")}
            />
            <ErrorBox message={formError} />
          </DialogContent>
        )}
        <DialogActions sx={{ flexWrap: "wrap", gap: 1 }}>
          {f?.id &&
            (f.customerId ? (
              <Button onClick={() => navigate(`/customers/${f.customerId}/edit`)} sx={{ mr: "auto" }}>
                {L("కస్టమర్ చూడు", "Open customer")}
              </Button>
            ) : (
              <Button variant="outlined" color="success" onClick={convert} disabled={converting || saving} sx={{ mr: "auto" }}>
                {converting ? L("మారుస్తున్నాం…", "Converting…") : L("కస్టమర్‌గా మార్చు", "Convert to customer")}
              </Button>
            ))}
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
