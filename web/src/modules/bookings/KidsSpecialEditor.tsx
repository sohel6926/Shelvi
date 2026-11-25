import { Box, Button, Chip, IconButton, MenuItem, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import { useLang } from "../../i18n/LanguageContext";
import { SPECIAL_MEAL_LABEL, SPECIAL_MEAL_TYPES, type SpecialMeal, type SpecialMealType } from "../../data/bookingRepository";

/**
 * R10-11: kids plates and special meals (count + kitchen note). Prices come from the server quotation
 * (kids at the package kidsPrice); nothing is priced here.
 */
export function KidsSpecialEditor({
  kidsCount,
  specialMeals,
  onChange,
  disabled,
  size = "medium",
}: {
  kidsCount: number;
  specialMeals: SpecialMeal[];
  onChange: (kidsCount: number, specialMeals: SpecialMeal[]) => void;
  disabled?: boolean;
  size?: "small" | "medium";
}) {
  const { L, T } = useLang();
  const setMeal = (i: number, p: Partial<SpecialMeal>) => onChange(kidsCount, specialMeals.map((m, j) => (j === i ? { ...m, ...p } : m)));
  const whole = (v: string) => {
    const n = parseInt(v.replace(/\D/g, "").slice(0, 5), 10);
    return Number.isFinite(n) ? n : 0;
  };
  return (
    <Box sx={{ display: "grid", gap: 1, mt: 1 }}>
      <TextField
        size={size}
        disabled={disabled}
        label={L("పిల్లలు (ఎంత మంది)", "Kids (count)")}
        helperText={L("పిల్లల ప్లేట్ ధర ప్యాకేజీలో పెడితే కొటేషన్‌లో వేరే line వస్తుంది", "Kids plates are priced from the package kids price in the quotation")}
        value={kidsCount > 0 ? String(kidsCount) : ""}
        onChange={(e) => onChange(whole(e.target.value), specialMeals)}
        slotProps={{ htmlInput: { inputMode: "numeric" } }}
        sx={{ maxWidth: 260 }}
      />
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {L("ప్రత్యేక భోజనాలు", "Special meals")}
      </Typography>
      {specialMeals.map((m, i) => (
        <Box key={i} sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "flex-start" }}>
          <TextField
            select
            size="small"
            disabled={disabled}
            label={L("రకం", "Type")}
            value={m.type}
            onChange={(e) => setMeal(i, { type: e.target.value as SpecialMealType })}
            sx={{ minWidth: 200 }}
          >
            {SPECIAL_MEAL_TYPES.map((t) => (
              <MenuItem key={t} value={t}>
                {T(SPECIAL_MEAL_LABEL[t])}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            disabled={disabled}
            label={L("ఎన్ని", "Count")}
            value={m.count > 0 ? String(m.count) : ""}
            onChange={(e) => setMeal(i, { count: whole(e.target.value) })}
            error={m.count < 1}
            slotProps={{ htmlInput: { inputMode: "numeric" } }}
            sx={{ width: 100 }}
          />
          <TextField
            size="small"
            disabled={disabled}
            label={L("వంటగదికి గమనిక", "Note for the kitchen")}
            value={m.note}
            onChange={(e) => setMeal(i, { note: e.target.value })}
            sx={{ flex: 1, minWidth: 180 }}
          />
          {!disabled && (
            <IconButton size="small" aria-label={L("తీసేయి", "Remove")} onClick={() => onChange(kidsCount, specialMeals.filter((_, j) => j !== i))}>
              <CloseIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
      ))}
      {!disabled && (
        <Box>
          <Button size="small" startIcon={<AddIcon />} onClick={() => onChange(kidsCount, [...specialMeals, { type: "no-onion-garlic", count: 0, note: "" }])}>
            {L("ప్రత్యేక భోజనం", "Special meal")}
          </Button>
        </Box>
      )}
    </Box>
  );
}

/** Read-only chips: "పిల్లలు 20 · జైన్ 5 (note)". */
export function KidsSpecialChips({ kidsCount, specialMeals }: { kidsCount: number; specialMeals: SpecialMeal[] }) {
  const { L, T } = useLang();
  if (kidsCount <= 0 && specialMeals.length === 0) return null;
  return (
    <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", mt: 1 }}>
      {kidsCount > 0 && <Chip size="small" color="info" variant="outlined" label={L(`పిల్లలు ${kidsCount}`, `Kids ${kidsCount}`)} />}
      {specialMeals.map((m, i) => (
        <Chip key={i} size="small" color="warning" variant="outlined" label={`${T(SPECIAL_MEAL_LABEL[m.type])} ${m.count}${m.note ? ` — ${m.note}` : ""}`} />
      ))}
    </Box>
  );
}
