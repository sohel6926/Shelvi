import { useEffect, useState } from "react";
import { Alert, Box, Button, FormControlLabel, Switch, TextField, Typography } from "@mui/material";
import { useLang } from "../../i18n/LanguageContext";
import { errorText, saveBusinessSettings } from "../../data/functions";
import { useBusinessSettings } from "../../data/settingsRepository";

/**
 * Module 4d (B5) — "స్టాక్ సవరణ ఆమోదం" settings (owner only): on/off and from what share of the stock on hand a
 * hand change (count / damage / correction) by store or staff must wait for a supervisor.
 * Saved through saveBusinessSettings { stockAdjust }.
 */
export function StockAdjustCard() {
  const { L, lang } = useLang();
  const { settings, loaded } = useBusinessSettings();
  const [on, setOn] = useState(true);
  const [pctText, setPctText] = useState("10");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (loaded && !ready) {
      setOn(settings.stockAdjust.on);
      setPctText(String(settings.stockAdjust.percent));
      setReady(true);
    }
  }, [loaded, ready, settings.stockAdjust]);

  const pct = pctText.trim() === "" ? NaN : Number(pctText);
  const valid = Number.isFinite(pct) && pct >= 0 && pct <= 100;

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await saveBusinessSettings({ stockAdjust: { on, percent: pct } });
      setSaved(true);
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ display: "grid", gap: 1.5, mt: 2 }}>
      <Typography variant="subtitle2">{L("స్టాక్ సవరణ ఆమోదం", "Stock adjustment approval")}</Typography>
      <FormControlLabel
        control={<Switch checked={on} onChange={(e) => setOn(e.target.checked)} />}
        label={L("స్టోర్ / సిబ్బంది చేసే పెద్ద స్టాక్ మార్పు (లెక్కింపు, పాడైంది, సరిదిద్దడం) ఆమోదం తర్వాతే వర్తిస్తుంది", "A big stock change by store / staff (count, damage, correction) applies only after approval")}
      />
      <TextField
        size="small"
        disabled={!on}
        label={L("నిల్వలో ఎంత శాతం నుంచి (%)", "From what share of the stock (%)")}
        value={pctText}
        onChange={(e) => setPctText(e.target.value)}
        error={!valid}
        helperText={L("ఉదా: 10 అంటే 50 కిలోల నిల్వలో 5 కిలోలు లేదా ఎక్కువ మార్పు ఆగుతుంది. 0 అంటే ప్రతి మార్పూ ఆగుతుంది. యజమాని, ఆమోదించగల మేనేజర్ మార్పులు ఆగవు.", "Example: 10 means a change of 5 kg or more on a 50 kg stock waits. 0 means every change waits. Changes by the owner or an approving manager do not wait.")}
        sx={{ maxWidth: 420 }}
      />
      {error && <Alert severity="error">{error}</Alert>}
      {saved && <Alert severity="success">{L("సేవ్ అయింది.", "Saved.")}</Alert>}
      <Box>
        <Button variant="outlined" onClick={save} disabled={!valid || saving || !ready}>
          {L("స్టాక్ సవరణ ఆమోదం సేవ్", "Save stock adjustment approval")}
        </Button>
      </Box>
    </Box>
  );
}
