import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControlLabel,
  MenuItem,
  Paper,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { getMenuItem, MENU_CATEGORIES, saveMenuItem, type MenuCategory } from "../../data/menuRepository";
import { useLang } from "../../i18n/LanguageContext";
import { categoryLabel } from "./categoryLabel";

/** Admin-only (firestore.rules: menuItems write = admin). Same fields as MenuItemEditScreen.kt's basics. */
export function MenuFormPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isEdit = !!id;
  const { L } = useLang();

  const [loading, setLoading] = useState(isEdit);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<MenuCategory>("Main Course");
  const [price, setPrice] = useState("");
  const [isVeg, setIsVeg] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    getMenuItem(id).then((item) => {
      if (item) {
        setName(item.name);
        setCategory(item.category);
        setPrice(String(item.pricePerPlate));
        setIsVeg(item.isVeg);
        setIsActive(item.isActive);
      }
      setLoading(false);
    });
  }, [id]);

  async function handleSave() {
    const pricePerPlate = Number(price);
    if (!name.trim()) return setError(L("పేరు రాయండి", "Name is required"));
    if (!Number.isFinite(pricePerPlate) || pricePerPlate < 0) return setError(L("ప్లేటుకు సరైన ధర రాయండి", "Enter a valid price per plate"));
    setSaving(true);
    setError(null);
    try {
      await saveMenuItem({ id, name: name.trim(), category, pricePerPlate, isVeg, isActive });
      navigate("/menu");
    } catch {
      setError(L("సేవ్ కాలేదు. మెనూని ఓనర్ మాత్రమే మార్చగలరు.", "Could not save. Only admins can change the menu."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 520 }}>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
        {isEdit ? L("మెనూ ఐటమ్ మార్చు", "Edit Menu Item") : L("కొత్త మెనూ ఐటమ్", "New Menu Item")}
      </Typography>
      <Paper sx={{ p: 3 }}>
        <TextField label={L("పేరు", "Name")} fullWidth margin="normal" value={name} onChange={(e) => setName(e.target.value)} />
        <TextField
          select
          label={L("రకం", "Category")}
          fullWidth
          margin="normal"
          value={category}
          onChange={(e) => setCategory(e.target.value as MenuCategory)}
        >
          {MENU_CATEGORIES.map((c) => (
            <MenuItem key={c} value={c}>
              {categoryLabel(c, L)}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label={L("ప్లేటుకు ధర (₹)", "Price per plate (₹)")}
          type="number"
          fullWidth
          margin="normal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <FormControlLabel control={<Switch checked={isVeg} onChange={(e) => setIsVeg(e.target.checked)} />} label={L("శాకాహారం", "Veg")} />
        <FormControlLabel
          control={<Switch checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />}
          label={L("వాడుకలో ఉంది (బుకింగ్ చేసేటప్పుడు కనిపిస్తుంది)", "Active (shown when making bookings)")}
        />
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
        <Box sx={{ display: "flex", gap: 2, mt: 3 }}>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? L("సేవ్ అవుతోంది...", "Saving...") : L("సేవ్", "Save")}
          </Button>
          <Button onClick={() => navigate("/menu")}>{L("రద్దు", "Cancel")}</Button>
        </Box>
      </Paper>
    </Box>
  );
}
