import { Box, MenuItem, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { dateLocale, useLang } from "../i18n/LanguageContext";
import { isClosed, sessionName, type Booking } from "../data/bookingRepository";
import { CENTRE_LABEL, OVERHEAD_CENTRES, type CostTarget, type OverheadCentre } from "../data/costTarget";

/** "12 Nov · Ramesh" — short booking label for pickers and tables. */
export function bookingLabel(b: Pick<Booking, "eventDate" | "customerNameSnapshot" | "venue">, lang: "te" | "en"): string {
  const d = b.eventDate?.toLocaleDateString(dateLocale(lang), { day: "numeric", month: "short" }) ?? "—";
  return `${d} · ${b.customerNameSnapshot || b.venue || "—"}`;
}

/** Bookings a cost may be tagged to: not cancelled, not closed (rules deny writes for closed events). */
export function openBookings(bookings: Booking[]): Booking[] {
  return bookings.filter((b) => !b.cancelled && !isClosed(b));
}

/**
 * R7-1 cost target: an event (and optionally one meal session) or an overhead centre. The user must
 * choose; the screen's default is the booking picked on screen, else "general".
 */
export function CostTargetPicker({
  value,
  onChange,
  bookings,
  disabled,
}: {
  value: CostTarget;
  onChange: (t: CostTarget) => void;
  bookings: Booking[];
  disabled?: boolean;
}) {
  const { L, T, lang } = useLang();
  const choices = openBookings(bookings);
  const selected = value.type === "booking" ? bookings.find((b) => b.id === value.bookingId) : undefined;
  // Keep the current (possibly closed) booking in the list so an old entry still shows its label.
  const list = selected && !choices.includes(selected) ? [selected, ...choices] : choices;

  return (
    <Box sx={{ display: "grid", gap: 1.5 }}>
      <Typography variant="subtitle2">{L("ఈ ఖర్చు దేనికి?", "What is this cost for?")}</Typography>
      <ToggleButtonGroup
        exclusive
        size="small"
        color="primary"
        disabled={disabled}
        value={value.type}
        onChange={(_, v) => {
          if (v === "booking") onChange({ type: "booking", bookingId: choices[0]?.id ?? "" });
          else if (v === "overhead") onChange({ type: "overhead", centre: "general" });
        }}
      >
        <ToggleButton value="booking">{L("ఒక Event కి", "An event")}</ToggleButton>
        <ToggleButton value="overhead">{L("సాధారణ ఖర్చు (overhead)", "Overhead")}</ToggleButton>
      </ToggleButtonGroup>
      {value.type === "booking" ? (
        <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: selected?.sessions.length ? "2fr 1fr" : "1fr" } }}>
          <TextField
            select
            size="small"
            required
            disabled={disabled}
            label={L("Event / బుకింగ్", "Event / booking")}
            value={value.bookingId}
            error={!value.bookingId}
            helperText={!value.bookingId ? L("Event ఎంచుకోండి", "Pick an event") : " "}
            onChange={(e) => onChange({ type: "booking", bookingId: e.target.value })}
          >
            {list.length === 0 && (
              <MenuItem value="" disabled>
                {L("తెరిచి ఉన్న events లేవు", "No open events")}
              </MenuItem>
            )}
            {list.map((b) => (
              <MenuItem key={b.id} value={b.id} disabled={isClosed(b)}>
                {bookingLabel(b, lang)}
              </MenuItem>
            ))}
          </TextField>
          {selected && selected.sessions.length > 0 && (
            <TextField
              select
              size="small"
              disabled={disabled}
              label={L("భోజనం (session)", "Meal session")}
              value={value.sessionId ?? ""}
              onChange={(e) =>
                onChange(e.target.value ? { type: "booking", bookingId: value.bookingId, sessionId: e.target.value } : { type: "booking", bookingId: value.bookingId })
              }
            >
              <MenuItem value="">{L("మొత్తం event", "Whole event")}</MenuItem>
              {selected.sessions.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {sessionName(s, lang)}
                </MenuItem>
              ))}
            </TextField>
          )}
        </Box>
      ) : (
        <TextField
          select
          size="small"
          disabled={disabled}
          label={L("ఏ ఖాతా", "Overhead centre")}
          value={value.centre}
          onChange={(e) => onChange({ type: "overhead", centre: e.target.value as OverheadCentre })}
        >
          {OVERHEAD_CENTRES.map((c) => (
            <MenuItem key={c} value={c}>
              {T(CENTRE_LABEL[c])}
            </MenuItem>
          ))}
        </TextField>
      )}
    </Box>
  );
}

/** Table cell text for a cost target. */
export function useCostTargetText(bookings: Booking[]): (t: CostTarget) => string {
  const { T, lang } = useLang();
  return (t) => {
    if (t.type === "overhead") return T(CENTRE_LABEL[t.centre]);
    const b = bookings.find((x) => x.id === t.bookingId);
    if (!b) return lang === "te" ? "Event" : "Event";
    const s = t.sessionId ? b.sessions.find((x) => x.id === t.sessionId) : undefined;
    return s ? `${bookingLabel(b, lang)} · ${sessionName(s, lang)}` : bookingLabel(b, lang);
  };
}
