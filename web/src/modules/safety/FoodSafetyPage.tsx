import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Chip, IconButton, MenuItem, Paper, Tab, Tabs, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import { collection, onSnapshot, query, where, type DocumentData } from "firebase/firestore";
import { db } from "../../firebase";
import { useLang } from "../../i18n/LanguageContext";
import { useSession } from "../../auth/AuthProvider";
import { useBranch } from "../../session/BranchContext";
import { useBusinessSettings, type SafetyChecklist } from "../../data/settingsRepository";
import { errorText, listSafetyChecklists, resolveSafetyIncident, saveBusinessSettings, saveSafetyCheck, saveSafetyIncident } from "../../data/functions";
import { PageHeader } from "../../components/DataTable";
import { formatDay, istDay } from "../../util/dates";
import { AllergenPanel } from "./AllergenPanel";

const KINDS = [
  { code: "hygiene", te: "పరిశుభ్రత", en: "Hygiene" },
  { code: "cleaning", te: "శుభ్రత", en: "Cleaning" },
  { code: "temperature", te: "ఉష్ణోగ్రత", en: "Temperature" },
  { code: "tasting", te: "రుచి ఆమోదం", en: "Tasting approval" },
  { code: "storage", te: "నిల్వ", en: "Storage" },
  { code: "transport", te: "రవాణా", en: "Transport" },
  { code: "other", te: "ఇతర", en: "Other" },
];
const SEVERITY = [
  { code: "low", te: "చిన్నది", en: "Minor" },
  { code: "medium", te: "మధ్యస్థం", en: "Medium" },
  { code: "high", te: "తీవ్రం", en: "Serious" },
];
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Live documents of one food-safety collection the viewer may read: the owner — the chosen branch (or all); a manager — own branch; staff — own. */
function useSafetyDocs(name: string, uid: string, level: string, ownBranch: string, branchId: string | null): (DocumentData & { id: string })[] {
  const [rows, setRows] = useState<(DocumentData & { id: string })[]>([]);
  useEffect(() => {
    if (!uid) return;
    const base = collection(db, name);
    const q = level === "admin" ? (branchId ? query(base, where("branchId", "==", branchId)) : query(base)) : level === "manager" && ownBranch ? query(base, where("branchId", "==", ownBranch)) : query(base, where("byUid", "==", uid));
    return onSnapshot(
      q,
      (snap) => setRows(snap.docs.map((d): DocumentData & { id: string } => ({ ...d.data(), id: d.id })).sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)).slice(0, 100)),
      () => setRows([]),
    );
  }, [name, uid, level, ownBranch, branchId]);
  return rows;
}

/** X38: for the owner / manager — the checklists that have a "daily by" time, and whether today's check is in. */
function DueToday({ lists, checks }: { lists: SafetyChecklist[]; checks: (DocumentData & { id: string })[] }) {
  const { L } = useLang();
  const watched = lists.filter((l) => l.dailyBy);
  if (watched.length === 0) return null;
  const today = istDay();
  const now = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
  return (
    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2, alignItems: "center" }}>
      <Typography variant="body2" color="text.secondary">
        {L("ఈరోజు తనిఖీలు:", "Today's checks:")}
      </Typography>
      {watched.map((l) => {
        const done = checks.some((c) => str(c.day) === today && str(c.checklistId) === l.id);
        const late = !done && now >= l.dailyBy;
        return <Chip key={l.id} size="small" color={done ? "success" : late ? "error" : "default"} label={`${L(l.te, l.en || l.te)} · ${done ? L("అయింది ✓", "done ✓") : late ? L(`ఆలస్యం (${l.dailyBy} లోపు)`, `late (by ${l.dailyBy})`) : L(`${l.dailyBy} లోపు`, `by ${l.dailyBy}`)}`} />;
      })}
    </Box>
  );
}

function DoCheck({ lists }: { lists: SafetyChecklist[] }) {
  const { L, lang } = useLang();
  const [listId, setListId] = useState("");
  const [answers, setAnswers] = useState<Record<string, boolean | string>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ result: string; failed: number } | null>(null);
  const list = lists.find((l) => l.id === listId);
  const complete = !!list && list.items.every((i) => (i.type === "yesno" ? typeof answers[i.key] === "boolean" : answers[i.key] !== undefined && answers[i.key] !== "" && Number.isFinite(Number(answers[i.key]))));

  if (lists.length === 0) return <Alert severity="info">{L("ఇంకా చెక్‌లిస్ట్‌లు లేవు. యజమాని \"చెక్‌లిస్ట్‌లు\" ట్యాబ్‌లో తనిఖీ అంశాలు రాయాలి.", "There are no checklists yet. The owner writes the lines to check on the \"Checklists\" tab.")}</Alert>;

  const save = async () => {
    if (!list) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const out: Record<string, boolean | number> = {};
      for (const i of list.items) out[i.key] = i.type === "yesno" ? answers[i.key] === true : Number(answers[i.key]);
      const r = await saveSafetyCheck({ checklistId: list.id, answers: out, ...(note.trim() ? { note: note.trim() } : {}) });
      setDone(r);
      setAnswers({});
      setNote("");
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ display: "grid", gap: 2, maxWidth: 640 }}>
      <TextField select label={L("ఏ తనిఖీ", "Which check")} value={listId} onChange={(e) => { setListId(e.target.value); setAnswers({}); setDone(null); }}>
        {lists.map((l) => (
          <MenuItem key={l.id} value={l.id}>
            {L(l.te, l.en)}
          </MenuItem>
        ))}
      </TextField>
      {list?.items.map((i) => (
        <Box key={i.key} sx={{ display: "flex", gap: 1.5, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", borderBottom: 1, borderColor: "divider", pb: 1 }}>
          <Typography sx={{ flex: "1 1 220px" }}>{L(i.te, i.en)}</Typography>
          {i.type === "yesno" ? (
            <ToggleButtonGroup exclusive size="small" value={typeof answers[i.key] === "boolean" ? String(answers[i.key]) : null} onChange={(_, v) => v !== null && setAnswers((a) => ({ ...a, [i.key]: v === "true" }))}>
              <ToggleButton value="true" color="success">
                {L("సరే", "OK")}
              </ToggleButton>
              <ToggleButton value="false" color="error">
                {L("సరిగా లేదు", "Not OK")}
              </ToggleButton>
            </ToggleButtonGroup>
          ) : (
            <TextField
              size="small"
              label={i.unit || L("అంకె", "Number")}
              value={typeof answers[i.key] === "string" ? answers[i.key] : ""}
              onChange={(e) => setAnswers((a) => ({ ...a, [i.key]: e.target.value }))}
              helperText={i.min !== null || i.max !== null ? `${i.min ?? "…"} – ${i.max ?? "…"} ${i.unit}` : undefined}
              slotProps={{ htmlInput: { inputMode: "decimal" } }}
              sx={{ width: 150 }}
            />
          )}
        </Box>
      ))}
      {list && <TextField label={L("గమనిక (ఐచ్ఛికం)", "Note (optional)")} value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={2} />}
      {error && <Alert severity="error">{error}</Alert>}
      {done && <Alert severity={done.result === "pass" ? "success" : "warning"}>{done.result === "pass" ? L("తనిఖీ నమోదైంది — అన్నీ సరిగా ఉన్నాయి.", "Check saved — everything is fine.") : L(`తనిఖీ నమోదైంది — ${done.failed} అంశాలు సరిగా లేవు. యజమానికి, మేనేజర్‌కు తెలియజేశాం.`, `Check saved — ${done.failed} lines are not fine. The owner and manager have been told.`)}</Alert>}
      {list && (
        <Box>
          <Button variant="contained" onClick={() => void save()} disabled={!complete || busy}>
            {L("తనిఖీ నమోదు చేయి", "Save the check")}
          </Button>
        </Box>
      )}
    </Box>
  );
}

type DraftList = { kind: string; te: string; en: string; items: [string, string][] };
/**
 * Draft yes / no checklists the owner may add with one tap (20 Nov 2026, at his request). They are added PAUSED so nothing
 * is asked of staff until he has read them, changed what he wants and pressed "Use again". They hold no temperature or
 * other limits — a measured line and its allowed range are always the owner's own.
 */
const DRAFT_LISTS: DraftList[] = [
  {
    kind: "hygiene",
    te: "వంటశాల పరిశుభ్రత (ముసాయిదా)",
    en: "Kitchen hygiene (draft)",
    items: [
      ["సిబ్బంది శుభ్రమైన ఆప్రాన్, టోపీ ధరించారు", "Staff wear a clean apron and cap"],
      ["పని మొదలుపెట్టే ముందు చేతులు సబ్బుతో కడుక్కున్నారు", "Hands washed with soap before starting work"],
      ["అనారోగ్యంగా ఉన్నవారు ఆహారం ముట్టడం లేదు", "No one who is unwell is handling food"],
      ["వంట బల్లలు, కత్తులు, పాత్రలు శుభ్రంగా ఉన్నాయి", "Work tables, knives and vessels are clean"],
      ["వంటకు వాడే నీరు శుభ్రమైనది", "The water used for cooking is clean"],
      ["చెత్త డబ్బాలకు మూతలు ఉన్నాయి, నిండిపోలేదు", "Waste bins are covered and not overflowing"],
    ],
  },
  {
    kind: "storage",
    te: "సరుకు నిల్వ (ముసాయిదా)",
    en: "Storage (draft)",
    items: [
      ["శాకాహార, మాంసాహార సరుకు వేరు వేరుగా ఉంచారు", "Veg and non-veg goods are kept apart"],
      ["ముడి సరుకు, వండినవి వేరు వేరుగా ఉంచారు", "Raw and cooked food are kept apart"],
      ["డబ్బాలకు మూతలు, పేరు చీటీలు ఉన్నాయి", "Containers are covered and labelled"],
      ["గడువు తేదీ దాటిన సరుకు ఏదీ లేదు", "Nothing past its expiry date is in stock"],
      ["సరుకు నేల మీద నేరుగా లేదు", "Nothing is kept directly on the floor"],
    ],
  },
  {
    kind: "transport",
    te: "ఈవెంట్‌కు పంపే ముందు (ముసాయిదా)",
    en: "Before sending to an event (draft)",
    items: [
      ["వండిన వంటకాలు రుచి చూసి సరిగా ఉన్నాయని నిర్ధారించారు", "Cooked dishes were tasted and found fine"],
      ["వంటకాలు శుభ్రమైన, మూత ఉన్న పాత్రల్లో ప్యాక్ చేశారు", "Dishes are packed in clean, covered vessels"],
      ["శాకాహార, మాంసాహార పాత్రలు వేరు వేరుగా లోడ్ చేశారు", "Veg and non-veg vessels are loaded separately"],
      ["అలెర్జీ ఉన్నవారి ప్రత్యేక భోజనాలకు గుర్తు పెట్టారు", "Allergy special meals are marked"],
      ["వాహనం శుభ్రంగా ఉంది", "The vehicle is clean"],
    ],
  },
];

function ChecklistEditor({ initial }: { initial: SafetyChecklist[] }) {
  const { L, lang } = useLang();
  const [lists, setLists] = useState<SafetyChecklist[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const patch = (i: number, p: Partial<SafetyChecklist>) => setLists((cur) => cur.map((l, k) => (k === i ? { ...l, ...p } : l)));
  const patchItem = (i: number, n: number, p: Partial<SafetyChecklist["items"][number]>) => patch(i, { items: lists[i].items.map((it, k) => (k === n ? { ...it, ...p } : it)) });
  const numOrNull = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await saveBusinessSettings({ foodSafety: { checklists: lists } });
      setSaved(true);
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ display: "grid", gap: 2, maxWidth: 820 }}>
      <Alert severity="info">{L("తనిఖీ అంశాలు, ఉష్ణోగ్రత పరిమితులు మీరే రాయాలి — CRM ఏదీ ఊహించి పెట్టదు. ఉదా: \"చేతులు కడిగారా\" (సరే / సరిగా లేదు), \"ఫ్రిజ్ ఉష్ణోగ్రత\" (అంకె, మీరు చెప్పిన పరిమితితో).", "You write the lines to check and any temperature limits — the CRM does not guess them. Example: \"Hands washed\" (OK / not OK), \"Fridge temperature\" (a number, with the range you give).")}</Alert>
      {lists.some((l) => !l.active && l.te.includes("ముసాయిదా")) && <Alert severity="warning">{L("\"ముసాయిదా\" జాబితాలు ఆపి ఉన్నాయి. చదివి, మీకు కావలసినట్టు మార్చి, \"వాడుకలోకి\" నొక్కి, సేవ్ చేస్తే మాత్రమే సిబ్బందికి కనిపిస్తాయి.", "The draft lists are paused. They reach staff only after you read them, change what you want, press \"Use again\" and save.")}</Alert>}
      {lists.map((l, i) => (
        <Paper key={i} variant="outlined" sx={{ p: 2, display: "grid", gap: 1.5 }}>
          <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
            <TextField size="small" label={L("చెక్‌లిస్ట్ పేరు (తెలుగు)", "Checklist name (Telugu)")} value={l.te} onChange={(e) => patch(i, { te: e.target.value })} sx={{ flex: "1 1 200px" }} />
            <TextField size="small" label={L("పేరు (English)", "Name (English)")} value={l.en} onChange={(e) => patch(i, { en: e.target.value })} sx={{ flex: "1 1 200px" }} />
            <TextField select size="small" label={L("రకం", "Type")} value={l.kind} onChange={(e) => patch(i, { kind: e.target.value })} sx={{ minWidth: 150 }}>
              {KINDS.map((k) => (
                <MenuItem key={k.code} value={k.code}>
                  {L(k.te, k.en)}
                </MenuItem>
              ))}
            </TextField>
            <TextField size="small" type="time" label={L("రోజూ ఈ సమయంలోపు చేయాలి", "Do daily by")} value={l.dailyBy} onChange={(e) => patch(i, { dailyBy: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} helperText={l.dailyBy ? L("చేయకపోతే గుర్తు చేస్తాం", "We remind if not done") : L("ఖాళీ = గుర్తు చేయం", "Empty = no reminder")} sx={{ width: 190 }} />
            <Button size="small" color={l.active ? "warning" : "success"} onClick={() => patch(i, { active: !l.active })}>
              {l.active ? L("ఆపు", "Pause") : L("వాడుకలోకి", "Use again")}
            </Button>
            <IconButton aria-label={L("చెక్‌లిస్ట్ తీసేయి", "Remove checklist")} onClick={() => setLists((cur) => cur.filter((_, k) => k !== i))}>
              <DeleteIcon />
            </IconButton>
          </Box>
          {l.items.map((it, n) => (
            <Box key={n} sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
              <TextField size="small" label={L("తనిఖీ అంశం (తెలుగు)", "Line to check (Telugu)")} value={it.te} onChange={(e) => patchItem(i, n, { te: e.target.value })} sx={{ flex: "2 1 200px" }} />
              <TextField size="small" label="English" value={it.en} onChange={(e) => patchItem(i, n, { en: e.target.value })} sx={{ flex: "2 1 160px" }} />
              <TextField select size="small" label={L("జవాబు", "Answer")} value={it.type} onChange={(e) => patchItem(i, n, { type: e.target.value === "number" ? "number" : "yesno" })} sx={{ minWidth: 130 }}>
                <MenuItem value="yesno">{L("సరే / సరిగా లేదు", "OK / not OK")}</MenuItem>
                <MenuItem value="number">{L("అంకె", "Number")}</MenuItem>
              </TextField>
              {it.type === "number" && (
                <>
                  <TextField size="small" label={L("కనిష్టం", "Lowest")} defaultValue={it.min ?? ""} onBlur={(e) => patchItem(i, n, { min: numOrNull(e.target.value) })} sx={{ width: 90 }} />
                  <TextField size="small" label={L("గరిష్టం", "Highest")} defaultValue={it.max ?? ""} onBlur={(e) => patchItem(i, n, { max: numOrNull(e.target.value) })} sx={{ width: 90 }} />
                  <TextField size="small" label={L("కొలత", "Unit")} value={it.unit} onChange={(e) => patchItem(i, n, { unit: e.target.value })} sx={{ width: 80 }} />
                </>
              )}
              <IconButton aria-label={L("అంశం తీసేయి", "Remove line")} onClick={() => patch(i, { items: l.items.filter((_, k) => k !== n) })}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
          ))}
          <Box>
            <Button size="small" startIcon={<AddIcon />} onClick={() => patch(i, { items: [...l.items, { key: "", te: "", en: "", type: "yesno", min: null, max: null, unit: "" }] })}>
              {L("అంశం చేర్చు", "Add a line")}
            </Button>
          </Box>
        </Paper>
      ))}
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
        <Button startIcon={<AddIcon />} onClick={() => setLists((cur) => [...cur, { id: "", kind: "hygiene", te: "", en: "", active: true, dailyBy: "", items: [{ key: "", te: "", en: "", type: "yesno", min: null, max: null, unit: "" }] }])}>
          {L("కొత్త చెక్‌లిస్ట్", "New checklist")}
        </Button>
        <Button
          onClick={() =>
            setLists((cur) => [
              ...cur,
              ...DRAFT_LISTS.map((d) => ({ id: "", kind: d.kind, te: d.te, en: d.en, active: false, dailyBy: "", items: d.items.map(([te, en]) => ({ key: "", te, en, type: "yesno" as const, min: null, max: null, unit: "" })) })),
            ])
          }
        >
          {L("ముసాయిదా జాబితాలు చేర్చు", "Add draft lists")}
        </Button>
        <Button variant="contained" onClick={() => void save()} disabled={busy}>
          {L("చెక్‌లిస్ట్‌లు సేవ్", "Save checklists")}
        </Button>
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      {saved && <Alert severity="success">{L("సేవ్ అయింది.", "Saved.")}</Alert>}
    </Box>
  );
}

/**
 * Module 5e — food safety (spec §44, X10): do a check from the owner's checklists, see past checks, report and
 * resolve food incidents, and (owner) write the checklists. Batch hold / trace is on the Inventory page.
 */
export function FoodSafetyPage() {
  const { L, lang } = useLang();
  const session = useSession();
  const { currentBranchId } = useBranch();
  const { settings, loaded } = useBusinessSettings();
  const profile = session.status === "loggedIn" ? session.profile : null;
  const level = profile?.role ?? "staff";
  const uid = profile?.uid ?? "";
  const [tab, setTab] = useState("check");
  const checks = useSafetyDocs("safetyChecks", uid, level, profile?.branchId ?? "", currentBranchId);
  const incidents = useSafetyDocs("safetyIncidents", uid, level, profile?.branchId ?? "", currentBranchId);
  // Staff cannot read settings, so they get the active checklists from the server (listSafetyChecklists).
  const [staffLists, setStaffLists] = useState<SafetyChecklist[] | null>(null);
  useEffect(() => {
    if (level !== "staff" || !uid) return;
    void listSafetyChecklists({}).then((r) => setStaffLists(r.checklists)).catch(() => setStaffLists([]));
  }, [level, uid]);
  const active = useMemo(() => (level === "staff" ? staffLists ?? [] : settings.foodSafety.checklists.filter((c) => c.active)), [level, staffLists, settings.foodSafety]);
  const [what, setWhat] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [action, setAction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (work: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      after?.();
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };
  const openIncidents = incidents.filter((i) => i.status === "open").length;

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <PageHeader title={L("ఫుడ్ సేఫ్టీ", "Food safety")} />
      <Tabs value={tab} onChange={(_, v) => setTab(v as string)} variant="scrollable" sx={{ mb: 2 }}>
        <Tab value="check" label={L("తనిఖీ చేయి", "Do a check")} />
        <Tab value="history" label={`${L("తనిఖీల చరిత్ర", "Past checks")} (${checks.length})`} />
        <Tab value="incidents" label={`${L("ఆహార సంఘటనలు", "Food incidents")}${openIncidents ? ` (${openIncidents})` : ""}`} />
        {level !== "staff" && <Tab value="allergens" label={L("అలర్జీ / వెజ్-నాన్‌వెజ్", "Allergens / veg-non-veg")} />}
        {level === "admin" && <Tab value="lists" label={L("చెక్‌లిస్ట్‌లు", "Checklists")} />}
      </Tabs>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {tab === "check" && loaded && level !== "staff" && <DueToday lists={active} checks={checks} />}
      {tab === "check" && loaded && (level !== "staff" || staffLists !== null) && <DoCheck lists={active} />}
      {tab === "history" && (
        <Box sx={{ display: "grid", gap: 1 }}>
          {checks.length === 0 && <Typography color="text.secondary">{L("ఇంకా తనిఖీలు లేవు.", "No checks yet.")}</Typography>}
          {checks.map((c) => (
            <Paper key={c.id} variant="outlined" sx={{ p: 1.5 }}>
              <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                <Chip size="small" color={c.result === "pass" ? "success" : "error"} label={c.result === "pass" ? L("సరే", "OK") : L("ఫెయిల్", "Failed")} />
                <Typography sx={{ fontWeight: 600 }}>{L(str(c.name?.te), str(c.name?.en))}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {formatDay(str(c.day), lang)} · {str(c.by?.name)}
                </Typography>
              </Box>
              {c.result !== "pass" && Array.isArray(c.answers) && (
                <Typography variant="body2" color="error" sx={{ mt: 0.5 }}>
                  {(c.answers as { ok: boolean; te: string; en: string; value: number | null; unit: string }[]).filter((a) => !a.ok).map((a) => `${L(a.te, a.en)}${a.value !== null ? ` (${a.value} ${a.unit})` : ""}`).join(" · ")}
                </Typography>
              )}
              {str(c.note) && <Typography variant="body2">{str(c.note)}</Typography>}
            </Paper>
          ))}
        </Box>
      )}
      {tab === "incidents" && (
        <Box sx={{ display: "grid", gap: 2 }}>
          <Paper variant="outlined" sx={{ p: 2, display: "grid", gap: 1.5, maxWidth: 640 }}>
            <Typography variant="subtitle2">{L("ఆహార సంఘటన నమోదు", "Report a food incident")}</Typography>
            <TextField label={L("ఏం జరిగింది", "What happened")} value={what} onChange={(e) => setWhat(e.target.value)} multiline minRows={2} />
            <TextField select label={L("తీవ్రత", "How serious")} value={severity} onChange={(e) => setSeverity(e.target.value)}>
              {SEVERITY.map((s) => (
                <MenuItem key={s.code} value={s.code}>
                  {L(s.te, s.en)}
                </MenuItem>
              ))}
            </TextField>
            <TextField label={L("వెంటనే ఏం చేశారు (ఐచ్ఛికం)", "What was done at once (optional)")} value={action} onChange={(e) => setAction(e.target.value)} />
            <Box>
              <Button variant="contained" color="warning" disabled={busy || what.trim().length < 5} onClick={() => void run(() => saveSafetyIncident({ what: what.trim(), severity, ...(action.trim() ? { action: action.trim() } : {}), ...(level === "admin" && currentBranchId ? { branchId: currentBranchId } : {}) }), () => { setWhat(""); setAction(""); })}>
                {L("సంఘటన నమోదు చేయి", "Report the incident")}
              </Button>
            </Box>
          </Paper>
          {incidents.map((i) => (
            <Paper key={i.id} variant="outlined" sx={{ p: 1.5 }}>
              <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                <Chip size="small" color={i.status === "open" ? "warning" : "default"} label={i.status === "open" ? L("తెరిచి ఉంది", "Open") : L("ముగిసింది", "Resolved")} />
                <Chip size="small" variant="outlined" color={i.severity === "high" ? "error" : "default"} label={L(SEVERITY.find((s) => s.code === i.severity)?.te ?? "", SEVERITY.find((s) => s.code === i.severity)?.en ?? "")} />
                <Typography variant="body2" color="text.secondary">
                  {formatDay(str(i.day), lang)} · {str(i.by?.name)}
                </Typography>
              </Box>
              <Typography sx={{ mt: 0.5 }}>{str(i.what)}</Typography>
              {str(i.action) && <Typography variant="body2">{L("వెంటనే చేసింది", "Done at once")}: {str(i.action)}</Typography>}
              {str(i.resolution) && <Typography variant="body2">{L("ముగింపు", "Resolution")}: {str(i.resolution)}</Typography>}
              {i.status === "open" && level !== "staff" && (i.byUid !== uid || level === "admin") && (
                <Button
                  size="small"
                  sx={{ mt: 0.5 }}
                  disabled={busy}
                  onClick={() => {
                    const resolution = (window.prompt(L("ఈ సంఘటన ఎలా ముగిసింది? ఏ చర్య తీసుకున్నారు?", "How was this incident resolved? What was done?")) ?? "").trim();
                    if (resolution) void run(() => resolveSafetyIncident({ id: i.id, resolution }));
                  }}
                >
                  {L("ముగించు", "Resolve")}
                </Button>
              )}
            </Paper>
          ))}
        </Box>
      )}
      {tab === "allergens" && level !== "staff" && loaded && <AllergenPanel allergens={settings.allergens} isOwner={level === "admin"} />}
      {tab === "lists" && level === "admin" && loaded && <ChecklistEditor initial={settings.foodSafety.checklists} />}
    </Box>
  );
}
