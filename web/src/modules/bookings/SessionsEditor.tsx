import { Box, Button, Chip, IconButton, MenuItem, Paper, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import { useLang } from "../../i18n/LanguageContext";
import { MEAL_TYPES, SESSION_STATUSES, type MealSession, type MealType, type SessionStatus } from "../../data/bookingRepository";
import type { MenuPackage } from "../../data/menuPackageRepository";
import { SERVICE_STYLES, STYLE_LABEL, type ServiceStyle } from "../../data/dishRepository";
import { KidsSpecialEditor } from "./KidsSpecialEditor";

const MEAL_LABEL: Record<MealType, { te: string; en: string }> = {
  tiffin: { te: "టిఫిన్", en: "Tiffin" },
  lunch: { te: "మధ్యాహ్న భోజనం", en: "Lunch" },
  dinner: { te: "రాత్రి భోజనం", en: "Dinner" },
  "lunch-dinner": { te: "భోజనం + రాత్రి", en: "Lunch + dinner" },
  other: { te: "ఇతర", en: "Other" },
};

const STATUS_LABEL: Record<SessionStatus, { te: string; en: string }> = {
  planned: { te: "ప్లాన్", en: "Planned" },
  done: { te: "అయిపోయింది", en: "Done" },
  cancelled: { te: "రద్దు", en: "Cancelled" },
};

const PRESETS: { te: string; en: string; meal: MealType; time: string; dayOffset: number }[] = [
  { te: "ముందు రోజు రాత్రి భోజనం", en: "Previous night dinner", meal: "dinner", time: "20:00", dayOffset: -1 },
  { te: "టిఫిన్", en: "Breakfast", meal: "tiffin", time: "08:00", dayOffset: 0 },
  { te: "పెళ్లి భోజనం", en: "Wedding lunch", meal: "lunch", time: "12:30", dayOffset: 0 },
  { te: "రాత్రి భోజనం", en: "Dinner", meal: "dinner", time: "20:00", dayOffset: 0 },
];

const toInput = (d: Date | null) =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "";

/** Guests of the live (not cancelled) sessions. */
export function sessionGuests(sessions: MealSession[]): number {
  return sessions.filter((s) => s.status !== "cancelled").reduce((a, s) => a + (s.guests || 0), 0);
}

/** Earliest date of the live sessions. */
export function earliestSessionDate(sessions: MealSession[]): Date | null {
  const ds = sessions.filter((s) => s.status !== "cancelled" && s.date).map((s) => (s.date as Date).getTime());
  return ds.length ? new Date(Math.min(...ds)) : null;
}

/** Problems that block saving (Telugu / English). */
export function sessionProblems(sessions: MealSession[], L: (te: string, en: string) => string): string[] {
  const out: string[] = [];
  sessions.forEach((s, i) => {
    const n = s.nameTe || s.nameEn || `${i + 1}`;
    if (!s.nameTe.trim() && !s.nameEn.trim()) out.push(L(`భోజనం ${i + 1} కి పేరు రాయండి.`, `Name meal ${i + 1}.`));
    if (!s.date) out.push(L(`"${n}" కి తేదీ ఇవ్వండి.`, `Give "${n}" a date.`));
    if (!Number.isInteger(s.guests) || s.guests < 1) out.push(L(`"${n}" కి అతిథులు 1 లేదా ఎక్కువ.`, `"${n}" needs 1 or more guests.`));
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.serveTime)) out.push(L(`"${n}" వడ్డించే సమయం HH:MM.`, `"${n}" serving time must be HH:MM.`));
    if (!Number.isInteger(s.travelMinutes) || s.travelMinutes < 0 || s.travelMinutes > 300) out.push(L(`"${n}" ప్రయాణం 0–300 నిమిషాలు.`, `"${n}" travel must be 0–300 min.`));
    if (s.specialMeals.some((m) => m.count < 1)) out.push(L(`"${n}" లో ప్రత్యేక భోజనానికి సంఖ్య ఇవ్వండి (లేదా తీసేయండి).`, `Give a count for each special meal in "${n}" (or remove it).`));
    if (s.status !== "cancelled" && !s.serviceStyle) out.push(L(`"${n}" కి బంతి భోజనమా / బఫేనా ఎంచుకోండి.`, `Choose banthi or buffet for "${n}".`));
  });
  return out;
}

/**
 * R7-5 meal sessions (lightweight): several meals inside one booking, each with its own date, time,
 * menu package and guests. The server keeps booking.guestCount = Σ guests and the date = earliest.
 */
export function SessionsEditor({
  sessions,
  onChange,
  packages,
  eventDate,
  savedIds,
  disabled,
  defaultStyle,
}: {
  sessions: MealSession[];
  onChange: (s: MealSession[]) => void;
  packages: MenuPackage[];
  /** YYYY-MM-DD of the booking, used for new sessions. */
  eventDate: string;
  /** Sessions already saved (they can be cancelled but not removed, because costs may point to them). */
  savedIds: ReadonlySet<string>;
  disabled?: boolean;
  /** The booking's service style, used for new sessions. */
  defaultStyle?: ServiceStyle | "";
}) {
  const { L, T, lang } = useLang();
  const base = eventDate ? new Date(`${eventDate}T12:00:00`) : new Date();

  const patch = (i: number, p: Partial<MealSession>) => onChange(sessions.map((s, j) => (j === i ? { ...s, ...p } : s)));

  const add = (preset?: (typeof PRESETS)[number]) => {
    const d = new Date(base);
    if (preset) d.setDate(d.getDate() + preset.dayOffset);
    onChange([
      ...sessions,
      {
        id: `s${Date.now().toString(36)}`,
        nameTe: preset?.te ?? "",
        nameEn: preset?.en ?? "",
        date: d,
        serveTime: preset?.time ?? "12:30",
        mealType: preset?.meal ?? "lunch",
        packageId: "",
        guests: 100,
        guestCountConfirmed: null,
        guestCountActual: null,
        travelMinutes: 45,
        status: "planned",
        serviceStyle: defaultStyle ?? "",
        kidsCount: 0,
        specialMeals: [],
      },
    ]);
  };

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
        {L("భోజనాలు (sessions)", "Meal sessions")}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {sessions.length === 0
          ? L(
              "ఒక్క భోజనమే అయితే ఏమీ చేర్చనక్కర్లేదు. పెళ్లిలో ఎక్కువ భోజనాలు ఉంటే (ముందు రోజు రాత్రి, టిఫిన్, భోజనం…) ఇక్కడ చేర్చండి — ఒక్కోదానికి వేరే మెనూ, సమయం, అతిథులు.",
              "One meal? Add nothing. For several meals (previous night, breakfast, lunch…) add them here — each has its own menu, time and guests.",
            )
          : L("మొత్తం అతిథులు, తేదీ ఈ భోజనాల నుండి తనంతట అదే వస్తాయి.", "Total guests and the date come from these meals automatically.")}
      </Typography>
      {sessions.map((s, i) => (
        <Paper key={s.id} variant="outlined" sx={{ p: 2, mb: 1.5, opacity: s.status === "cancelled" ? 0.6 : 1 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
            <Typography sx={{ fontWeight: 600 }}>
              {L(`భోజనం ${i + 1}`, `Meal ${i + 1}`)}
            </Typography>
            {!savedIds.has(s.id) && !disabled && (
              <IconButton size="small" aria-label={L("తీసేయి", "Remove")} onClick={() => onChange(sessions.filter((_, j) => j !== i))}>
                <CloseIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
          <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
            <TextField size="small" disabled={disabled} label={L("పేరు (తెలుగు)", "Name (Telugu)")} value={s.nameTe} onChange={(e) => patch(i, { nameTe: e.target.value })} />
            <TextField size="small" disabled={disabled} label={L("పేరు (English)", "Name (English)")} value={s.nameEn} onChange={(e) => patch(i, { nameEn: e.target.value })} />
            <TextField
              size="small"
              type="date"
              disabled={disabled}
              label={L("తేదీ", "Date")}
              value={toInput(s.date)}
              onChange={(e) => patch(i, { date: e.target.value ? new Date(`${e.target.value}T12:00:00`) : null })}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              size="small"
              type="time"
              disabled={disabled}
              label={L("వడ్డించే సమయం", "Serving time")}
              value={s.serveTime}
              onChange={(e) => patch(i, { serveTime: e.target.value })}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField select size="small" disabled={disabled} label={L("భోజనం రకం", "Meal")} value={s.mealType} onChange={(e) => patch(i, { mealType: e.target.value as MealType })}>
              {MEAL_TYPES.map((m) => (
                <MenuItem key={m} value={m}>
                  {T(MEAL_LABEL[m])}
                </MenuItem>
              ))}
            </TextField>
            <TextField select size="small" disabled={disabled} label={L("మెనూ ప్యాకేజీ", "Menu package")} value={s.packageId} onChange={(e) => patch(i, { packageId: e.target.value })}>
              <MenuItem value="">{L("ఇంకా లేదు", "Not yet")}</MenuItem>
              {packages.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {lang === "te" ? p.nameTe || p.nameEn : p.nameEn || p.nameTe}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              type="number"
              disabled={disabled}
              label={L("అతిథులు", "Guests")}
              value={s.guests || ""}
              onChange={(e) => patch(i, { guests: parseInt(e.target.value, 10) || 0 })}
            />
            <TextField
              size="small"
              type="number"
              disabled={disabled}
              label={L("ఖరారు చేసిన అతిథులు (ఐచ్ఛికం)", "Confirmed guests (optional)")}
              value={s.guestCountConfirmed ?? ""}
              onChange={(e) => patch(i, { guestCountConfirmed: e.target.value ? parseInt(e.target.value, 10) || null : null })}
            />
            <TextField
              size="small"
              type="number"
              disabled={disabled}
              label={L("ప్రయాణం (నిమిషాలు)", "Travel (minutes)")}
              value={s.travelMinutes}
              onChange={(e) => patch(i, { travelMinutes: parseInt(e.target.value, 10) || 0 })}
            />
            <TextField
              select
              size="small"
              required
              disabled={disabled}
              label={L("వడ్డన రకం", "Service style")}
              value={s.serviceStyle}
              error={!s.serviceStyle && s.status !== "cancelled"}
              onChange={(e) => patch(i, { serviceStyle: e.target.value as ServiceStyle })}
            >
              {SERVICE_STYLES.map((st) => (
                <MenuItem key={st} value={st}>
                  {T(STYLE_LABEL[st])}
                </MenuItem>
              ))}
            </TextField>
            <TextField select size="small" disabled={disabled} label={L("స్థితి", "Status")} value={s.status} onChange={(e) => patch(i, { status: e.target.value as SessionStatus })}>
              {SESSION_STATUSES.map((st) => (
                <MenuItem key={st} value={st}>
                  {T(STATUS_LABEL[st])}
                </MenuItem>
              ))}
            </TextField>
          </Box>
          <KidsSpecialEditor
            size="small"
            disabled={disabled}
            kidsCount={s.kidsCount}
            specialMeals={s.specialMeals}
            onChange={(kidsCount, specialMeals) => patch(i, { kidsCount, specialMeals })}
          />
        </Paper>
      ))}
      {!disabled && (
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
          {PRESETS.map((p) => (
            <Chip key={p.en} icon={<AddIcon />} label={T(p)} variant="outlined" onClick={() => add(p)} />
          ))}
          <Button size="small" startIcon={<AddIcon />} onClick={() => add()}>
            {L("వేరే భోజనం", "Other meal")}
          </Button>
        </Box>
      )}
    </Box>
  );
}
