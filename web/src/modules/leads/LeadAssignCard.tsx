import { useEffect, useState } from "react";
import { Alert, Box, Button, Checkbox, FormControlLabel, MenuItem, Radio, RadioGroup, Switch, TextField, Typography } from "@mui/material";
import { useLang } from "../../i18n/LanguageContext";
import { LEAD_SOURCES } from "../../data/leadsRepository";
import { errorText, leadAssignees, saveBusinessSettings, type LeadAssignConfig, type LeadAssignee, type LeadTatConfig } from "../../data/functions";
import { useBusinessSettings } from "../../data/settingsRepository";
import { SOURCE_LABEL } from "./leadLabels";

/**
 * Module 1a — "ఆటో అప్పగింత" settings (owner only): on/off, turn by turn or by source, and who takes leads.
 * Saved through saveBusinessSettings { leadAssign }; the server validates it.
 */
export function LeadAssignCard({ onSaved }: { onSaved?: () => void }) {
  const { L, T, lang } = useLang();
  const { settings, loaded } = useBusinessSettings();
  const [cfg, setCfg] = useState<LeadAssignConfig | null>(null);
  const [tat, setTat] = useState<LeadTatConfig | null>(null);
  const [minutesText, setMinutesText] = useState("15");
  const [people, setPeople] = useState<LeadAssignee[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (loaded && cfg === null) {
      setCfg(settings.leadAssign);
      setTat(settings.leadTat);
      setMinutesText(String(settings.leadTat.minutes));
    }
  }, [loaded, settings.leadAssign, settings.leadTat, cfg]);

  useEffect(() => {
    let live = true;
    leadAssignees({})
      .then((r) => live && setPeople(r.people))
      .catch((e) => live && setError(errorText(e, lang)));
    return () => {
      live = false;
    };
  }, []);

  if (!cfg || !tat) return <Typography color="text.secondary">{L("Load అవుతోంది…", "Loading…")}</Typography>;

  const nameOf = (uid: string) => people.find((p) => p.uid === uid)?.name ?? L("(తెలియని వ్యక్తి)", "(unknown person)");
  const togglePerson = (uid: string, on: boolean) =>
    setCfg({ ...cfg, pool: on ? [...cfg.pool.filter((u) => u !== uid), uid] : cfg.pool.filter((u) => u !== uid) });
  const setRule = (source: string, uid: string) =>
    setCfg({ ...cfg, rules: [...cfg.rules.filter((r) => r.source !== source), ...(uid ? [{ source, uid }] : [])] });
  const nobodyPicked = cfg.pool.length === 0 && cfg.rules.length === 0;

  async function save() {
    if (!cfg || !tat) return;
    setError(null);
    const minutes = Number(minutesText.trim());
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 1440) {
      setError(L("స్పందన సమయం 5 నుండి 1440 నిమిషాల మధ్య పూర్ణ సంఖ్య ఉండాలి.", "Response time must be a whole number from 5 to 1440 minutes."));
      return;
    }
    if (cfg.auto && nobodyPicked) {
      setError(L("ఆన్ చేయాలంటే కనీసం ఒకరిని ఎంచుకోండి.", "Pick at least one person before turning this on."));
      return;
    }
    setSaving(true);
    try {
      await saveBusinessSettings({ leadAssign: cfg, leadTat: { ...tat, minutes } });
      setSavedAt(new Date());
      onSaved?.();
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <FormControlLabel
        control={<Switch checked={cfg.auto} onChange={(e) => setCfg({ ...cfg, auto: e.target.checked })} />}
        label={L("కొత్త ఎంక్వైరీని దానంతట అదే ఒకరికి అప్పగించు (ఆటో)", "Hand every new lead to a person automatically")}
      />
      <Typography variant="body2" color="text.secondary">
        {cfg.auto
          ? L("ఆన్: ఎంక్వైరీ రాగానే క్రింద ఎంచుకున్న వారికి వెళ్తుంది. మీరు ఎప్పుడైనా వేరొకరికి మార్చవచ్చు.", "On: a new lead goes to the people picked below. You can still move any lead to someone else.")
          : L("ఆఫ్: ఎంక్వైరీలు ఎవరికీ అప్పగించబడవు. మీరే చేతితో అప్పగించాలి.", "Off: new leads stay unassigned until you hand them to someone.")}
      </Typography>

      <RadioGroup value={cfg.mode} onChange={(e) => setCfg({ ...cfg, mode: e.target.value === "rules" ? "rules" : "roundRobin" })}>
        <FormControlLabel value="roundRobin" control={<Radio />} label={L("వంతుల వారీగా (అందరికీ సమానంగా)", "Turn by turn (equal share)")} />
        <FormControlLabel value="rules" control={<Radio />} label={L("ఎక్కడి నుండి వచ్చిందో బట్టి, మిగిలినవి వంతుల వారీగా", "By source first, the rest turn by turn")} />
      </RadioGroup>

      <Box>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          {L("వంతుల వారీగా ఎవరెవరు తీసుకోవాలి", "Who takes turns")}
        </Typography>
        {people.length === 0 && <Typography color="text.secondary">{L("Admin / manager users లేరు.", "No admin or manager users yet.")}</Typography>}
        {people.map((p) => (
          <FormControlLabel
            key={p.uid}
            sx={{ display: "flex", minHeight: 44 }}
            control={<Checkbox checked={cfg.pool.includes(p.uid)} onChange={(e) => togglePerson(p.uid, e.target.checked)} />}
            label={`${p.name} · ${p.role === "admin" ? L("ఓనర్", "Owner") : L("మేనేజర్", "Manager")}`}
          />
        ))}
        {cfg.pool.length > 1 && (
          <Typography variant="body2" color="text.secondary">
            {L("వరుస", "Order")}: {cfg.pool.map(nameOf).join(" → ")}
          </Typography>
        )}
      </Box>

      {cfg.mode === "rules" && (
        <Box sx={{ display: "grid", gap: 1.5 }}>
          <Typography variant="subtitle2">{L("ఎక్కడి నుండి వస్తే ఎవరికి", "Which source goes to whom")}</Typography>
          {LEAD_SOURCES.map((s) => (
            <TextField
              key={s}
              select
              size="small"
              label={T(SOURCE_LABEL[s])}
              value={cfg.rules.find((r) => r.source === s)?.uid ?? ""}
              onChange={(e) => setRule(s, e.target.value)}
            >
              <MenuItem value="">{L("— వంతుల వారీగా —", "— turn by turn —")}</MenuItem>
              {people.map((p) => (
                <MenuItem key={p.uid} value={p.uid}>
                  {p.name}
                </MenuItem>
              ))}
            </TextField>
          ))}
        </Box>
      )}

      <Box sx={{ display: "grid", gap: 1.5, borderTop: 1, borderColor: "divider", pt: 2 }}>
        <Typography variant="subtitle2">{L("స్పందన సమయం నియమం", "Response-time rule")}</Typography>
        <FormControlLabel
          control={<Switch checked={tat.on} onChange={(e) => setTat({ ...tat, on: e.target.checked })} />}
          label={L("కొత్త ఎంక్వైరీతో సమయం లోపు మాట్లాడకపోతే alert పంపు", "Alert when a new lead is not answered in time")}
        />
        <TextField
          size="small"
          label={L("ఎన్ని నిమిషాల్లో మాట్లాడాలి", "Minutes allowed for the first response")}
          value={minutesText}
          onChange={(e) => setMinutesText(e.target.value)}
          inputMode="numeric"
          disabled={!tat.on}
          sx={{ maxWidth: 280 }}
        />
        <FormControlLabel
          control={<Switch checked={tat.escalate} disabled={!tat.on} onChange={(e) => setTat({ ...tat, escalate: e.target.checked })} />}
          label={L("రెండింతల సమయం దాటితే ఓనర్ కి కూడా చెప్పు", "Also tell the owner after twice that time")}
        />
        <Typography variant="body2" color="text.secondary">
          {L(
            "మొదటి alert ఎంక్వైరీ ఎవరిదో వారికి వెళ్తుంది (ఎవరికీ లేకపోతే ఓనర్, మేనేజర్లకి). Alerts live అయ్యాక ప్రతి 5 నిమిషాలకి నడుస్తాయి.",
            "The first alert goes to the person who has the lead (to the owner and managers when nobody has it). Alerts run every 5 minutes once the CRM is live.",
          )}
        </Typography>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
        <Button variant="contained" onClick={save} disabled={saving}>
          {saving ? L("Save అవుతోంది…", "Saving…") : L("Save", "Save")}
        </Button>
        {savedAt && <Typography color="success.main">{L("Save అయింది", "Saved")} · {savedAt.toLocaleTimeString()}</Typography>}
      </Box>
    </Box>
  );
}
