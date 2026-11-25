import { useEffect, useState } from "react";
import { Alert, Box, Button, Chip, TextField, Typography } from "@mui/material";
import { useLang } from "../../i18n/LanguageContext";
import { errorText, saveBusinessSettings } from "../../data/functions";
import { FIXED_UOMS, useBusinessSettings } from "../../data/settingsRepository";

/**
 * Module 2h — "కొలతల జాబితా" (owner only): the fixed units and the pack names offered on purchases.
 * Saved through saveBusinessSettings { uomPacks }. How much one Bag holds is set on each grocery item, not here.
 */
export function UomCard() {
  const { L, lang } = useLang();
  const { settings, loaded } = useBusinessSettings();
  const [list, setList] = useState<string[] | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (loaded && list === null) setList(settings.uomPacks);
  }, [loaded, list, settings.uomPacks]);

  const names = list ?? [];
  const clean = text.trim().replace(/\s+/g, " ");
  const taken = [...FIXED_UOMS, ...names].some((n) => n.toLowerCase() === clean.toLowerCase());
  const canAdd = clean.length >= 1 && clean.length <= 30 && !taken && names.length < 60;

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await saveBusinessSettings({ uomPacks: names });
      setSaved(true);
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ display: "grid", gap: 1.5 }}>
      <Typography variant="body2" color="text.secondary">
        {L(
          "కొనుగోలు బిల్‌లో కనిపించే కొలతలు. Kg, Gram లాంటివి ఎప్పుడూ ఉంటాయి. Bag, Tin లాంటి ప్యాక్ పేర్లు మీరు చేర్చవచ్చు, తీసేయవచ్చు. ఒక Bag లో ఎంత ఉంటుందో ప్రతి సరుకు దగ్గర విడిగా రాయాలి.",
          "The units offered on a purchase bill. Kg, Gram and the like are always there. You can add or remove pack names such as Bag or Tin. How much one Bag holds is entered on each grocery item.",
        )}
      </Typography>
      <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
        {FIXED_UOMS.map((u) => (
          <Chip key={u} size="small" label={u} />
        ))}
        {names.map((u) => (
          <Chip key={u} size="small" color="primary" variant="outlined" label={u} onDelete={() => setList(names.filter((x) => x !== u))} />
        ))}
      </Box>
      <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start", flexWrap: "wrap" }}>
        <TextField size="small" label={L("కొత్త ప్యాక్ పేరు", "New pack name")} value={text} onChange={(e) => setText(e.target.value)} error={clean !== "" && taken} helperText={clean !== "" && taken ? L("ఈ పేరు ఇప్పటికే ఉంది", "This name is already in the list") : " "} />
        <Button
          variant="outlined"
          disabled={!canAdd}
          onClick={() => {
            setList([...names, clean]);
            setText("");
          }}
        >
          {L("చేర్చు", "Add")}
        </Button>
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      {saved && <Alert severity="success">{L("సేవ్ అయింది", "Saved")}</Alert>}
      <Box>
        <Button variant="outlined" onClick={save} disabled={saving || list === null}>
          {L("కొలతల జాబితా సేవ్", "Save unit list")}
        </Button>
      </Box>
    </Box>
  );
}
