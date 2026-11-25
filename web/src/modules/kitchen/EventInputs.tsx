import { useEffect, useMemo, useState } from "react";
import { Autocomplete, MenuItem, Paper, TextField } from "@mui/material";
import { dateLocale, useLang } from "../../i18n/LanguageContext";
import { useSession } from "../../auth/AuthProvider";
import { useBranch } from "../../session/BranchContext";
import { EVENT_TYPE_CODES, sessionName, subscribeBookings, type Booking, type EventTypeCode, type MealSession } from "../../data/bookingRepository";
import { EVENT_TYPE_LABEL } from "../../i18n/eventLabels";

export interface EventInputValue {
  booking: Booking | null;
  /** R7-5: one meal session of the booking ("" = whole event). */
  sessionId: string;
  guests: string;
  eventTypeCode: EventTypeCode;
}

export const EMPTY_EVENT_INPUT: EventInputValue = { booking: null, sessionId: "", guests: "100", eventTypeCode: "wedding" };

function guestsOfBooking(b: Booking): number {
  return b.guestCountActual || b.guestCountConfirmed || b.guestCount;
}

function guestsOfSession(s: MealSession): number {
  return s.guestCountActual || s.guestCountConfirmed || s.guests;
}

/** Request fields for the server: the booking (and session) when one is picked. */
export function eventRef(v: EventInputValue): { bookingId?: string; sessionId?: string } {
  if (!v.booking) return {};
  return v.sessionId ? { bookingId: v.booking.id, sessionId: v.sessionId } : { bookingId: v.booking.id };
}

/** Menu package of the picked booking / session. */
export function packageOf(v: EventInputValue): string {
  if (!v.booking) return "";
  const s = v.sessionId ? v.booking.sessions.find((x) => x.id === v.sessionId) : undefined;
  return s?.packageId || v.booking.packageId;
}

/**
 * "Pick a booking (fills guests + event type) or type them" — shared by the grocery and cooking pages.
 * Staff only type the numbers (they may not be able to list all bookings).
 */
export function EventInputs({
  value,
  onChange,
  initialBookingId,
  initialSessionId,
}: {
  value: EventInputValue;
  onChange: (v: EventInputValue) => void;
  /** From the URL (?booking=…&session=…), e.g. links on the booking detail page. */
  initialBookingId?: string | null;
  initialSessionId?: string | null;
}) {
  const { L, T, lang } = useLang();
  const session = useSession();
  const role = session.status === "loggedIn" ? session.profile.role : "staff";
  const { currentBranchId } = useBranch();
  const [bookings, setBookings] = useState<Booking[]>([]);
  // QA fix: staff pick too, from the events assigned to them only (subscribeBookings' staff scope).
  const canPick = role === "admin" || role === "manager" || role === "staff";
  const isStaff = role === "staff";
  const staffKey = isStaff && session.status === "loggedIn" ? session.profile.staffId : "";
  const [loaded, setLoaded] = useState(false);

  useEffect(
    () =>
      canPick
        ? subscribeBookings(
            currentBranchId,
            (b) => {
              setBookings(b);
              setLoaded(true);
            },
            () => {
              setBookings([]);
              setLoaded(true);
            },
          )
        : undefined,
    [canPick, currentBranchId, staffKey],
  );

  // Upcoming first (soonest on top), then recent past ones; cancelled bookings are left out.
  // Pick the booking named in the URL once the list arrives.
  const [applied, setApplied] = useState(false);
  useEffect(() => {
    if (applied || !initialBookingId) return;
    const b = bookings.find((x) => x.id === initialBookingId);
    if (!b) return;
    setApplied(true);
    const s = initialSessionId ? b.sessions.find((x) => x.id === initialSessionId) : undefined;
    onChange({ booking: b, sessionId: s?.id ?? "", guests: String(s ? guestsOfSession(s) : guestsOfBooking(b)), eventTypeCode: b.eventTypeCode });
  }, [bookings, applied, initialBookingId, initialSessionId, onChange]);

  const options = useMemo(() => {
    const now = Date.now() - 86_400_000;
    const live = bookings.filter((b) => !b.cancelled);
    const upcoming = live.filter((b) => (b.eventDate?.getTime() ?? 0) >= now).sort((a, b) => (a.eventDate?.getTime() ?? 0) - (b.eventDate?.getTime() ?? 0));
    const past = live.filter((b) => (b.eventDate?.getTime() ?? 0) < now).slice(0, 30);
    return [...upcoming, ...past];
  }, [bookings]);

  const label = (b: Booking) =>
    `${b.eventDate ? b.eventDate.toLocaleDateString(dateLocale(lang), { day: "numeric", month: "short" }) : "—"} · ${b.customerNameSnapshot || L("పేరు లేదు", "Unnamed")} · ${L(`${guestsOfBooking(b)} మంది`, `${guestsOfBooking(b)} guests`)}`;

  const sessions = value.booking?.sessions ?? [];
  return (
    <Paper
      sx={{
        p: 2,
        mb: 2,
        display: "grid",
        gap: 2,
        gridTemplateColumns: { xs: "1fr", md: canPick ? (sessions.length ? "2fr 1fr 1fr 1fr" : "2fr 1fr 1fr") : "1fr 1fr" },
        displayPrint: "none",
      }}
    >
      {canPick && (
        <Autocomplete
          options={options}
          value={value.booking}
          onChange={(_e, b) =>
            onChange(
              b
                ? { booking: b, sessionId: "", guests: String(guestsOfBooking(b)), eventTypeCode: b.eventTypeCode }
                : { ...value, booking: null, sessionId: "" },
            )
          }
          getOptionLabel={label}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          renderInput={(p) => (
            <TextField
              {...p}
              label={L("బుకింగ్ ఎంచుకోండి (ఐచ్ఛికం)", "Pick a booking (optional)")}
              helperText={isStaff && loaded && options.length === 0 ? L("మీకు కేటాయించిన events లేవు", "No events assigned to you") : undefined}
            />
          )}
        />
      )}
      {canPick && sessions.length > 0 && value.booking && (
        <TextField
          select
          label={L("భోజనం (session)", "Meal session")}
          value={value.sessionId}
          onChange={(e) => {
            const b = value.booking as Booking;
            const s = b.sessions.find((x) => x.id === e.target.value);
            onChange({ ...value, sessionId: s?.id ?? "", guests: String(s ? guestsOfSession(s) : guestsOfBooking(b)) });
          }}
        >
          <MenuItem value="">{L("మొత్తం event", "Whole event")}</MenuItem>
          {sessions.map((s) => (
            <MenuItem key={s.id} value={s.id}>
              {sessionName(s, lang)} · {L(`${guestsOfSession(s)} మంది`, `${guestsOfSession(s)} guests`)}
            </MenuItem>
          ))}
        </TextField>
      )}
      <TextField
        label={L("అతిథులు", "Guests")}
        value={value.guests}
        inputMode="numeric"
        onChange={(e) => onChange({ ...value, booking: null, sessionId: "", guests: e.target.value.replace(/\D/g, "").slice(0, 6) })}
      />
      <TextField
        select
        label={L("Event రకం", "Event type")}
        value={value.eventTypeCode}
        onChange={(e) => onChange({ ...value, booking: null, sessionId: "", eventTypeCode: e.target.value as EventTypeCode })}
      >
        {EVENT_TYPE_CODES.map((c) => (
          <MenuItem key={c} value={c}>
            {T(EVENT_TYPE_LABEL[c])}
          </MenuItem>
        ))}
      </TextField>
    </Paper>
  );
}
