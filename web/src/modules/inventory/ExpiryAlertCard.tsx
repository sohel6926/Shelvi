import { useEffect, useState } from "react";
import { Alert, Box, Button, FormControlLabel, Switch, TextField, Typography } from "@mui/material";
import { useLang } from "../../i18n/LanguageContext";
import { errorText, saveBusinessSettings } from "../../data/functions";
import { useBusinessSettings } from "../../data/settingsRepository";

/**
 * Module 2d — "గడువు హెచ్చరిక" settings (owner only): on/off and how many days ahead.
 * Saved through saveBusinessSettings { expiryAlert }; the server validates it (1–90 days).
 */
export function ExpiryAlertCard() {
  const { L, lang } = useLang();
  const { settings, loaded } = useBusinessSettings();
  const [on, setOn] = useState(true);
  const [daysText, setDaysText] = useState("7");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (loaded && !ready) {
      setOn(settings.expiryAlert.on);
      setDaysText(String(settings.expiryAlert.days));
      setReady(true);
    }
  }, [loaded, ready, settings.expiryAlert]);

  const days = Number(daysText);
  const valid = Number.isInteger(days) && days >= 1 && days <= 90;

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await saveBusinessSettings({ expiryAlert: { on, days } });
      setSaved(true);
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ display: "grid", gap: 1.5, mt: 2 }}>
      <Typography variant="subtitle2">{L("గడువు తేదీ హెచ్చరిక", "Expiry date alert")}</Typography>
      <FormControlLabel
        control={<Switch checked={on} onChange={(e) => setOn(e.target.checked)} />}
        label={L("ప్రతి ఉదయం 7 గంటలకు గడువు దగ్గరలో ఉన్న / దాటిన వస్తువుల జాబితా పంపు", "Every morning at 7, send the list of items near or past their expiry date")}
      />
      <TextField
        size="small"
        disabled={!on}
        label={L("ఎన్ని రోజుల ముందు చెప్పాలి", "How many days ahead")}
        value={daysText}
        onChange={(e) => setDaysText(e.target.value)}
        error={!valid}
        helperText={L("1 నుండి 90", "1 to 90")}
        sx={{ maxWidth: 220 }}
      />
      {error && <Alert severity="error">{error}</Alert>}
      {saved && <Alert severity="success">{L("సేవ్ అయింది", "Saved")}</Alert>}
      <Box>
        <Button variant="outlined" onClick={save} disabled={!valid || saving || !ready}>
          {L("గడువు హెచ్చరిక సేవ్", "Save expiry alert")}
        </Button>
      </Box>
    </Box>
  );
}
