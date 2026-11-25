import { useEffect, useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Paper, Switch, Typography } from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { dateLocale, useLang } from "../../i18n/LanguageContext";
import {
  AGENTS,
  subscribeAgentSettings,
  subscribeApprovals,
  subscribeLatestRuns,
  type AgentRun,
  type AgentSetting,
  type OutboxMessage,
} from "../../data/agentsRepository";
import { approveMessage, errorText, runAgentNow, setAgentEnabled } from "../../data/functions";
import { tokens } from "../../theme/tokens";
import { ErrorBox, ScreenTitle } from "../../components/ui";
import { allOf, refreshFromServer } from "../../data/refresh";
import { collection, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "../../firebase";

function when(d: Date | null, lang: "te" | "en"): string {
  if (!d) return "—";
  return d.toLocaleString(dateLocale(lang), { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
}

function runChip(status: string, L: (te: string, en: string) => string) {
  const s = status.toLowerCase();
  if (s === "ok" || s === "success" || s === "done") return <Chip size="small" color="success" label={L("బాగా జరిగింది", "OK")} />;
  if (s === "running") return <Chip size="small" color="info" label={L("నడుస్తోంది", "Running")} />;
  if (s === "error" || s === "failed") return <Chip size="small" color="error" label={L("సమస్య", "Failed")} />;
  if (s === "alert" || s === "warning") return <Chip size="small" color="warning" label={L("హెచ్చరిక", "Alert")} />;
  return <Chip size="small" label={status || "—"} />;
}

export function AgentsPage() {
  const { L, T, lang } = useLang();
  const [settings, setSettings] = useState<Record<string, AgentSetting> | null>(null);
  const [runs, setRuns] = useState<Record<string, AgentRun>>({});
  const [approvals, setApprovals] = useState<OutboxMessage[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => subscribeAgentSettings(setSettings, (e) => setError(e.message)), []);
  useEffect(() => subscribeLatestRuns(setRuns, (e) => setError(e.message)), []);
  useEffect(() => subscribeApprovals(setApprovals, (e) => setError(e.message)), []);

  async function act(key: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (done) setNotice(done);
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100 }}>
      <ScreenTitle
        title={L("ఆటో సహాయకులు (Agents)", "Agents")}
        subtitle={L(
          "ఇవి దానంతట అవే పని చేస్తాయి. డబ్బు సంబంధిత / మొదటి మెసేజ్‌లు మీరు ఓకే అన్నాకే వెళ్తాయి.",
          "They run on their own. Money-related or first-contact messages go out only after you approve.",
        )}
        onRefresh={() =>
          refreshFromServer(
            allOf("agentSettings"),
            query(collection(db, "agentRuns"), orderBy("startedAt", "desc"), limit(200)),
            query(collection(db, "messagesOutbox"), where("status", "==", "needs-approval")),
          )
        }
      />
      <ErrorBox message={error} />
      {notice && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {notice}
        </Alert>
      )}

      <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
        {L(`మీ అనుమతి కోసం (${approvals.length})`, `Waiting for your approval (${approvals.length})`)}
      </Typography>
      {approvals.length === 0 ? (
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          {L("అనుమతి కోసం ఏమీ లేవు.", "Nothing waiting.")}
        </Typography>
      ) : (
        <Box sx={{ display: "grid", gap: 1.5, mb: 3 }}>
          {approvals.map((m) => (
            <Paper key={m.id} sx={{ p: 2, display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
              <Box sx={{ flex: 1, minWidth: 220 }}>
                <Typography sx={{ fontWeight: 600 }}>
                  {m.channel === "whatsapp" ? "WhatsApp" : m.channel} → {m.to || "—"}
                </Typography>
                <Typography variant="body2">
                  {L("Template", "Template")}: {m.template || "—"}
                  {m.relatedType && ` · ${m.relatedType} ${m.relatedId}`}
                </Typography>
                {m.holdReason === "template-missing" && (
                  <Typography variant="body2" sx={{ color: tokens.color.warning, fontWeight: 600 }}>
                    {L(m.holdTe || "template కావాలి", "Meta template needed")} —{" "}
                    {L("Settings → WhatsApp templates లో పేరు పెడితే template తో వెళ్తుంది; ఇప్పుడే ఓకే చేస్తే మామూలు మెసేజ్‌గా (24 గంటల్లో మాత్రమే అందుతుంది).", "set it in Settings → WhatsApp templates; approving now sends plain text (delivered only inside 24 h).")}
                  </Typography>
                )}
                {Object.keys(m.params).length > 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ wordBreak: "break-word" }}>
                    {Object.entries(m.params)
                      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
                      .join(" · ")}
                  </Typography>
                )}
                <Typography variant="caption" color="text.secondary">
                  {when(m.createdAt, lang)}
                </Typography>
              </Box>
              <Button
                variant="contained"
                disabled={busy === `msg-${m.id}`}
                onClick={() =>
                  act(`msg-${m.id}`, () => approveMessage({ messageId: m.id }), L("మెసేజ్ ఓకే చేశారు.", "Message approved."))
                }
              >
                {busy === `msg-${m.id}` ? <CircularProgress size={18} /> : L("ఓకే, పంపు", "Approve")}
              </Button>
            </Paper>
          ))}
        </Box>
      )}

      <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
        {L("అన్ని agents", "All agents")}
      </Typography>
      {settings === null ? (
        <CircularProgress />
      ) : (
        <Box sx={{ display: "grid", gap: 1.5 }}>
          {AGENTS.map((a) => {
            // No agentSettings doc yet = on (contract audit fix 7).
            const enabled = settings[a.id]?.enabled !== false;
            const run = runs[a.id];
            return (
              <Paper key={a.id} sx={{ p: 2, display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
                <Switch
                  checked={enabled}
                  disabled={busy === `on-${a.id}`}
                  slotProps={{ input: { "aria-label": `${T(a.name)}: ${enabled ? L("ఆన్", "on") : L("ఆఫ్", "off")}` } }}
                  onChange={(e) => {
                    const next = e.target.checked;
                    void act(`on-${a.id}`, () => setAgentEnabled({ agentId: a.id, enabled: next }));
                  }}
                />
                <Box sx={{ flex: 1, minWidth: 220 }}>
                  <Typography sx={{ fontWeight: 600 }}>
                    {T(a.name)}{" "}
                    <Typography component="span" variant="body2" color={enabled ? "success.main" : "text.secondary"}>
                      · {enabled ? L("ఆన్", "On") : L("ఆఫ్", "Off")}
                    </Typography>
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {T(a.about)}
                  </Typography>
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", mt: 0.5 }}>
                    <Typography variant="body2">
                      {L("చివరి సారి", "Last run")}: {run ? when(run.startedAt, lang) : L("ఇంకా నడవలేదు", "never")}
                    </Typography>
                    {run && runChip(run.status, L)}
                  </Box>
                  {run?.summary && (
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                      {run.summary}
                    </Typography>
                  )}
                </Box>
                <Button
                  variant="outlined"
                  startIcon={<PlayArrowIcon />}
                  disabled={busy === `run-${a.id}`}
                  onClick={() => act(`run-${a.id}`, () => runAgentNow({ agentId: a.id }), L(`${T(a.name)} మొదలైంది.`, `${T(a.name)} started.`))}
                >
                  {L("ఇప్పుడే నడుపు", "Run now")}
                </Button>
              </Paper>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
