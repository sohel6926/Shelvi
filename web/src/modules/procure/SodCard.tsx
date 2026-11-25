import { useEffect, useState } from "react";
import { Alert, Box, Button, FormControlLabel, Switch, TextField, Typography } from "@mui/material";
import { useLang } from "../../i18n/LanguageContext";
import { errorText, saveBusinessSettings } from "../../data/functions";
import { useBusinessSettings } from "../../data/settingsRepository";

/**
 * Module 4d — "బాధ్యతల విభజన" settings (owner only): in a purchase above the amount, the person who asked, the
 * person who received, the person who entered the bill and the person who pays must be different people.
 * Saved through saveBusinessSettings { sod }.
 */
export function SodCard() {
  const { L, lang } = useLang();
  const { settings, loaded } = useBusinessSettings();
  const [on, setOn] = useState(true);
  const [ownerExempt, setOwnerExempt] = useState(true);
  const [minText, setMinText] = useState("10000");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (loaded && !ready) {
      setOn(settings.sod.on);
      setOwnerExempt(settings.sod.ownerExempt);
      setMinText(String(settings.sod.minAmount));
      setReady(true);
    }
  }, [loaded, ready, settings.sod]);

  const min = minText.trim() === "" ? NaN : Number(minText.replace(/,/g, ""));
  const valid = Number.isFinite(min) && min >= 0 && min <= 10000000;

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await saveBusinessSettings({ sod: { on, minAmount: min, ownerExempt } });
      setSaved(true);
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ display: "grid", gap: 1.5, mt: 2 }}>
      <Typography variant="subtitle2">{L("కొనుగోలులో బాధ్యతల విభజన", "Separation of duties in purchases")}</Typography>
      <FormControlLabel
        control={<Switch checked={on} onChange={(e) => setOn(e.target.checked)} />}
        label={L("అడిగినవారు, సరుకు తీసుకున్నవారు, బిల్ రాసినవారు, చెల్లించేవారు వేర్వేరు వ్యక్తులు కావాలి", "The person who asks, receives, enters the bill and pays must be different people")}
      />
      <TextField
        size="small"
        disabled={!on}
        label={L("ఎంత మొత్తం నుంచి (₹)", "From what order value (₹)")}
        value={minText}
        onChange={(e) => setMinText(e.target.value)}
        error={!valid}
        helperText={L("ఈ మొత్తం కంటే చిన్న ఆర్డర్లకు నియమం వర్తించదు. చిన్న టీమ్ అయితే ఆఫ్ చేయవచ్చు.", "Orders below this value are not checked. A very small team can switch this off.")}
        sx={{ maxWidth: 360 }}
      />
      <FormControlLabel
        disabled={!on}
        control={<Switch checked={ownerExempt} onChange={(e) => setOwnerExempt(e.target.checked)} />}
        label={L("యజమానికి మినహాయింపు (యజమాని అన్ని దశలు చేయవచ్చు; ప్రతిసారి నమోదవుతుంది)", "The owner is exempt (may do every step; it is recorded each time)")}
      />
      {error && <Alert severity="error">{error}</Alert>}
      {saved && <Alert severity="success">{L("సేవ్ అయింది.", "Saved.")}</Alert>}
      <Box>
        <Button variant="outlined" onClick={save} disabled={!valid || saving || !ready}>
          {L("బాధ్యతల విభజన సేవ్", "Save separation of duties")}
        </Button>
      </Box>
    </Box>
  );
}
