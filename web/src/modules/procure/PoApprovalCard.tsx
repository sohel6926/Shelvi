import { useEffect, useState } from "react";
import { Alert, Box, Button, FormControlLabel, Switch, TextField, Typography } from "@mui/material";
import { useLang } from "../../i18n/LanguageContext";
import { errorText, saveBusinessSettings } from "../../data/functions";
import { useBusinessSettings } from "../../data/settingsRepository";

/**
 * Module 3a — "కొనుగోలు ఆర్డర్ ఆమోదం" settings (owner only): on/off and the manager's limit in ₹.
 * Saved through saveBusinessSettings { poApproval }; the server validates it.
 */
export function PoApprovalCard() {
  const { L, lang } = useLang();
  const { settings, loaded } = useBusinessSettings();
  const [on, setOn] = useState(true);
  const [limitText, setLimitText] = useState("10000");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (loaded && !ready) {
      setOn(settings.poApproval.on);
      setLimitText(String(settings.poApproval.managerLimit));
      setReady(true);
    }
  }, [loaded, ready, settings.poApproval]);

  const limit = limitText.trim() === "" ? NaN : Number(limitText.replace(/,/g, ""));
  const valid = Number.isFinite(limit) && limit >= 0 && limit <= 10000000;

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await saveBusinessSettings({ poApproval: { on, managerLimit: limit } });
      setSaved(true);
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ display: "grid", gap: 1.5, mt: 2 }}>
      <Typography variant="subtitle2">{L("కొనుగోలు ఆర్డర్ ఆమోదం", "Purchase order approval")}</Typography>
      <FormControlLabel
        control={<Switch checked={on} onChange={(e) => setOn(e.target.checked)} />}
        label={L("మేనేజర్ రాసిన పెద్ద ఆర్డర్లు నా ఆమోదం కోసం ఆగాలి", "A manager's large orders wait for my approval")}
      />
      <TextField
        size="small"
        disabled={!on}
        label={L("మేనేజర్ పరిమితి (₹)", "Manager's limit (₹)")}
        value={limitText}
        onChange={(e) => setLimitText(e.target.value)}
        error={!valid}
        helperText={L("ఈ మొత్తం వరకు మేనేజర్ ఆర్డర్ వెంటనే ఆమోదం; దాటితే మీ ఆమోదం కావాలి. 0 = ప్రతి ఆర్డర్ ఆగుతుంది.", "Up to this amount a manager's order is approved at once; above it needs you. 0 = every order waits.")}
        sx={{ maxWidth: 360 }}
      />
      {error && <Alert severity="error">{error}</Alert>}
      {saved && <Alert severity="success">{L("సేవ్ అయింది.", "Saved.")}</Alert>}
      <Box>
        <Button variant="outlined" onClick={save} disabled={!valid || saving || !ready}>
          {L("ఆర్డర్ ఆమోదం సేవ్", "Save order approval")}
        </Button>
      </Box>
    </Box>
  );
}
