import { useEffect, useState } from "react";
import { Alert, Box, Button, FormControlLabel, Switch, TextField, Typography } from "@mui/material";
import { useLang } from "../../i18n/LanguageContext";
import { errorText, saveBusinessSettings } from "../../data/functions";
import { useBusinessSettings } from "../../data/settingsRepository";

/**
 * Module 2g — "స్టాక్ రిజర్వ్" settings (owner only): on/off and how many days ahead.
 * Saved through saveBusinessSettings { stockReserve }; the server validates it (1–90 days).
 */
export function StockReserveCard() {
  const { L, lang } = useLang();
  const { settings, loaded } = useBusinessSettings();
  const [on, setOn] = useState(true);
  const [daysText, setDaysText] = useState("30");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (loaded && !ready) {
      setOn(settings.stockReserve.on);
      setDaysText(String(settings.stockReserve.days));
      setReady(true);
    }
  }, [loaded, ready, settings.stockReserve]);

  const days = Number(daysText);
  const valid = Number.isInteger(days) && days >= 1 && days <= 90;

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await saveBusinessSettings({ stockReserve: { on, days } });
      setSaved(true);
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ display: "grid", gap: 1.5, mt: 2 }}>
      <Typography variant="subtitle2">{L("ఖరారైన ఈవెంట్‌లకు స్టాక్ రిజర్వ్", "Reserve stock for confirmed events")}</Typography>
      <FormControlLabel
        control={<Switch checked={on} onChange={(e) => setOn(e.target.checked)} />}
        label={L("ఖరారైన ఈవెంట్‌కి కావాల్సిన సరుకును నిల్వలో పక్కన పెట్టు (వేరే ఈవెంట్ లెక్కలో కలవదు)", "Set aside the stock a confirmed event needs (other events do not count it)")}
      />
      <TextField
        size="small"
        disabled={!on}
        label={L("ఎన్ని రోజుల లోపు ఈవెంట్‌లకు", "For events within how many days")}
        value={daysText}
        onChange={(e) => setDaysText(e.target.value)}
        error={!valid}
        helperText={L("1 నుండి 90", "1 to 90")}
        sx={{ maxWidth: 240 }}
      />
      {error && <Alert severity="error">{error}</Alert>}
      {saved && <Alert severity="success">{L("సేవ్ అయింది. ఒక గంట లోపు లెక్క మారుతుంది.", "Saved. The numbers update within an hour.")}</Alert>}
      <Box>
        <Button variant="outlined" onClick={save} disabled={!valid || saving || !ready}>
          {L("స్టాక్ రిజర్వ్ సేవ్", "Save stock reserve")}
        </Button>
      </Box>
    </Box>
  );
}
