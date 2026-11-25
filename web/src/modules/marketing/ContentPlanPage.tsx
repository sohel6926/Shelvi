import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  MenuItem,
  Paper,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useLang } from "../../i18n/LanguageContext";
import {
  CONTENT_PLATFORMS,
  CONTENT_STATUSES,
  contentPlanQuery,
  saveContentItem,
  setContentStatus,
  subscribeContentPlan,
  type ContentInput,
  type ContentItem,
  type ContentStatus,
} from "../../data/contentPlanRepository";
import { refreshFromServer } from "../../data/refresh";
import { ErrorBox, ScreenTitle } from "../../components/ui";
import { formatDay, istDay, istMonth } from "../../util/dates";
import { tokens } from "../../theme/tokens";

const STATUS_LABEL: Record<ContentStatus, { te: string; en: string; color: "default" | "warning" | "success" }> = {
  Idea: { te: "ఆలోచన", en: "Idea", color: "default" },
  Ready: { te: "సిద్ధం", en: "Ready", color: "warning" },
  Posted: { te: "పెట్టాం", en: "Posted", color: "success" },
};
const NEXT: Record<ContentStatus, ContentStatus> = { Idea: "Ready", Ready: "Posted", Posted: "Idea" };
const WEEKDAYS_TE = ["ఆది", "సోమ", "మంగళ", "బుధ", "గురు", "శుక్ర", "శని"];
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function daysOfMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

const EMPTY = (date: string): ContentInput => ({ date, platform: "Instagram", idea: "", owner: "", status: "Idea", link: "" });

/** R10-13: marketing content plan — month calendar + list; tap a status chip to move Idea → Ready → Posted. */
export function ContentPlanPage() {
  const { L, T, lang } = useLang();
  const [month, setMonth] = useState(istMonth());
  const [rows, setRows] = useState<ContentItem[]>([]);
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ContentInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const today = istDay();

  useEffect(() => subscribeContentPlan(month, (r) => { setRows(r); setError(null); }, (e) => setError(e.message)), [month]);

  const byDay = useMemo(() => {
    const m: Record<string, ContentItem[]> = {};
    for (const r of rows) (m[r.date] ??= []).push(r);
    return m;
  }, [rows]);

  const days = daysOfMonth(month);
  const lead = new Date(`${days[0]}T00:00:00Z`).getUTCDay();

  async function save() {
    if (!form) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date) || form.idea.trim().length < 2) {
      setFormError(L("తేదీ, ఆలోచన తప్పనిసరి.", "Date and idea are required."));
      return;
    }
    if (form.link.trim() && !/^https?:\/\//i.test(form.link.trim())) {
      setFormError(L("Link https:// తో మొదలవ్వాలి.", "The link must start with https://."));
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await saveContentItem(form);
      setForm(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const cycle = async (r: ContentItem) => {
    try {
      await setContentStatus(r.id, NEXT[r.status]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const itemRow = (r: ContentItem) => (
    <Box key={r.id} sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
      <Chip
        size="small"
        clickable
        color={STATUS_LABEL[r.status].color}
        label={T(STATUS_LABEL[r.status])}
        onClick={() => cycle(r)}
        aria-label={L(`స్థితి మార్చు: ${STATUS_LABEL[r.status].te}`, `Change status: ${r.status}`)}
      />
      <Typography
        component="button"
        variant="body2"
        onClick={() => setForm({ ...r })}
        sx={{ border: 0, bgcolor: "transparent", p: 0, cursor: "pointer", textAlign: "left", font: "inherit", color: "inherit" }}
      >
        <b>{r.platform}</b> · {r.idea}
      </Typography>
    </Box>
  );

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200 }}>
      <ScreenTitle
        title={L("కంటెంట్ ప్లాన్", "Content plan")}
        subtitle={L("ఏ రోజు ఏ platform లో ఏం పెట్టాలి", "What to post, where and when")}
        onRefresh={() => refreshFromServer(contentPlanQuery(month))}
        action={
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
            <TextField
              type="month"
              size="small"
              label={L("నెల", "Month")}
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
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
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
        {CONTENT_STATUSES.map((s) => (
          <Chip key={s} size="small" variant="outlined" color={STATUS_LABEL[s].color} label={`${T(STATUS_LABEL[s])}: ${rows.filter((r) => r.status === s).length}`} />
        ))}
      </Box>

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
              <Box
                key={d}
                sx={{
                  minHeight: 96,
                  border: `1px solid ${tokens.color.border}`,
                  borderRadius: 1,
                  p: 0.75,
                  bgcolor: d === today ? tokens.color.greenTint : tokens.color.raised,
                  display: "grid",
                  alignContent: "start",
                  gap: 0.5,
                }}
              >
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    {Number(d.slice(8))}
                  </Typography>
                  <Button
                    size="small"
                    sx={{ minWidth: 0, px: 0.75, lineHeight: 1 }}
                    aria-label={L(`${formatDay(d, "te")} కి చేర్చు`, `Add on ${formatDay(d, "en")}`)}
                    onClick={() => setForm(EMPTY(d))}
                  >
                    +
                  </Button>
                </Box>
                {(byDay[d] ?? []).map(itemRow)}
              </Box>
            ))}
          </Box>
        </Paper>
      ) : (
        <Paper sx={{ p: 2, display: "grid", gap: 1.5 }}>
          {rows.length === 0 ? (
            <Typography color="text.secondary">{L("ఈ నెల ఇంకా ఏమీ లేదు.", "Nothing planned this month yet.")}</Typography>
          ) : (
            rows.map((r) => (
              <Box key={r.id} sx={{ display: "grid", gap: 0.5, borderBottom: `1px solid ${tokens.color.border}`, pb: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  {formatDay(r.date, lang)}
                  {r.owner ? ` · ${r.owner}` : ""}
                </Typography>
                {itemRow(r)}
                {r.link && (
                  <Link href={r.link} target="_blank" rel="noopener noreferrer" variant="body2" sx={{ wordBreak: "break-all" }}>
                    {r.link}
                  </Link>
                )}
              </Box>
            ))
          )}
        </Paper>
      )}

      <Dialog open={!!form} onClose={() => !saving && setForm(null)} fullWidth maxWidth="sm">
        <DialogTitle>{form?.id ? L("కంటెంట్ మార్చు", "Edit content") : L("కొత్త కంటెంట్", "New content")}</DialogTitle>
        {form && (
          <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
            <TextField type="date" label={L("తేదీ", "Date")} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField select label={L("ఎక్కడ", "Platform")} value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value as ContentInput["platform"] })}>
              {CONTENT_PLATFORMS.map((p) => (
                <MenuItem key={p} value={p}>
                  {p}
                </MenuItem>
              ))}
            </TextField>
            <TextField label={L("ఆలోచన / ఏం పెట్టాలి", "Idea / what to post")} value={form.idea} onChange={(e) => setForm({ ...form, idea: e.target.value })} multiline minRows={2} />
            <TextField label={L("ఎవరు చేస్తారు", "Who does it")} value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} />
            <TextField select label={L("స్థితి", "Status")} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ContentStatus })}>
              {CONTENT_STATUSES.map((s) => (
                <MenuItem key={s} value={s}>
                  {T(STATUS_LABEL[s])}
                </MenuItem>
              ))}
            </TextField>
            <TextField label={L("పెట్టిన link (ఐచ్ఛికం)", "Post link (optional)")} value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="https://" />
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
