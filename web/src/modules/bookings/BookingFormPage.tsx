import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Autocomplete,
  MenuItem as SelectMenuItem,
  Checkbox,
  FormControlLabel,
} from "@mui/material";
import { useSession } from "../../auth/AuthProvider";
import { useVegOnlyBrand } from "./useVegOnlyBrand";
import { useBranch } from "../../session/BranchContext";
import { SERVICE_STYLES, STYLE_LABEL, type ServiceStyle } from "../../data/dishRepository";
import { SessionsEditor, earliestSessionDate, sessionGuests, sessionProblems } from "./SessionsEditor";
import { KidsSpecialEditor } from "./KidsSpecialEditor";
import { useLang } from "../../i18n/LanguageContext";
import { bookingStatusLabel } from "./statusColor";
import { subscribeCustomers, type Customer } from "../../data/customerRepository";
import { subscribeActiveMenuItems, type MenuItem } from "../../data/menuRepository";
import {
  BOOKING_STATUSES,
  EVENT_TYPE_CODES,
  getBooking,
  MEAL_TYPES,
  saveBooking,
  toMealType,
  type Booking,
  type BookingStatus,
  type MealSession,
  type SpecialMeal,
  isClosed,
  type EventTypeCode,
  type MealType,
} from "../../data/bookingRepository";
import { subscribeMenuPackages, type MenuPackage } from "../../data/menuPackageRepository";
import { defaultServeTime } from "../../util/timeline";
import { ServiceTimelineCard } from "./BookingDetailCards";

const MEAL_LABEL: Record<MealType, { te: string; en: string }> = {
  tiffin: { te: "టిఫిన్", en: "Tiffin" },
  lunch: { te: "భోజనం", en: "Lunch" },
  dinner: { te: "రాత్రి భోజనం", en: "Dinner" },
  "lunch-dinner": { te: "భోజనం + రాత్రి", en: "Lunch + dinner" },
  other: { te: "ఇతర", en: "Other" },
};

const EVENT_TYPE_LABEL: Record<EventTypeCode, { te: string; en: string }> = {
  wedding: { te: "పెళ్ళి", en: "Wedding" },
  annadanam: { te: "అన్నదానం", en: "Annadanam" },
  housewarming: { te: "గృహప్రవేశం", en: "Housewarming" },
  office: { te: "ఆఫీస్ కార్యక్రమం", en: "Office event" },
  other: { te: "ఇతర", en: "Other" },
};

function toDateInputValue(date: Date | null): string {
  if (!date) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

export function BookingFormPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const session = useSession();
  const { L, lang } = useLang();
  const { currentBranchId } = useBranch();
  const isEdit = !!id;
  const [editBranchId, setEditBranchId] = useState("");
  const vegOnlyBrand = useVegOnlyBrand(isEdit ? editBranchId || null : currentBranchId, id);

  const [loading, setLoading] = useState(isEdit);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [eventDate, setEventDate] = useState("");
  const [eventType, setEventType] = useState("");
  const [eventTypeCode, setEventTypeCode] = useState<EventTypeCode>("wedding");
  const [venue, setVenue] = useState("");
  const [guestCount, setGuestCount] = useState("");
  const [selectedMenuItems, setSelectedMenuItems] = useState<MenuItem[]>([]);
  const [status, setStatus] = useState<BookingStatus>("Inquiry");
  const [totalAmount, setTotalAmount] = useState("");
  const [autoTotal, setAutoTotal] = useState(true);
  const [advancePaid, setAdvancePaid] = useState("");
  const [notes, setNotes] = useState("");
  const [assignedStaffIds, setAssignedStaffIds] = useState<string[]>([]);
  const [packages, setPackages] = useState<MenuPackage[]>([]);
  const [packageId, setPackageId] = useState("");
  const [mealType, setMealType] = useState<MealType>("lunch");
  const [serveTime, setServeTime] = useState(defaultServeTime(undefined, "lunch"));
  const [serveTouched, setServeTouched] = useState(false);
  const [travelMinutes, setTravelMinutes] = useState("45");
  const [showPreview, setShowPreview] = useState(false);
  const [sessions, setSessions] = useState<MealSession[]>([]);
  const [serviceStyle, setServiceStyle] = useState<ServiceStyle | "">("");
  /** R10-11 (one-meal bookings; sessions carry their own). */
  const [kidsCount, setKidsCount] = useState(0);
  const [specialMeals, setSpecialMeals] = useState<SpecialMeal[]>([]);
  const [savedSessionIds, setSavedSessionIds] = useState<ReadonlySet<string>>(new Set());
  const [locked, setLocked] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => subscribeCustomers((c) => setCustomers(c.filter((x) => !x.cancelled))), []);
  useEffect(() => subscribeActiveMenuItems((m) => setMenuItems(m.filter((x) => !x.cancelled))), []);
  useEffect(() => subscribeMenuPackages((p) => setPackages(p.filter((x) => !x.cancelled))), []);

  /** Package → meal type; serve time follows the package window / meal until the user types one. */
  function choosePackage(pid: string) {
    setPackageId(pid);
    const pkg = packages.find((p) => p.id === pid);
    if (!pkg) return;
    const meal = toMealType(pkg.mealType);
    setMealType(meal);
    if (!serveTouched) setServeTime(defaultServeTime(pkg.deliveryWindow, meal));
  }

  function chooseMeal(meal: MealType) {
    setMealType(meal);
    if (!serveTouched) setServeTime(defaultServeTime(packages.find((p) => p.id === packageId)?.deliveryWindow, meal));
  }

  // Estimate = guests × (menu package plate price + any extra menu items). The real price comes
  // from the quotation (server); this is only the booking's rough estimate.
  const computedTotal = useMemo(() => {
    if (sessions.length) {
      const itemsPrice = selectedMenuItems.reduce((sum, item) => sum + item.pricePerPlate, 0);
      return sessions
        .filter((s) => s.status !== "cancelled")
        .reduce((sum, s) => sum + s.guests * ((packages.find((p) => p.id === s.packageId)?.pricePerPlate ?? 0) + itemsPrice), 0);
    }
    const guests = parseInt(guestCount, 10) || 0;
    const packagePrice = packages.find((p) => p.id === packageId)?.pricePerPlate ?? 0;
    const itemsPrice = selectedMenuItems.reduce((sum, item) => sum + item.pricePerPlate, 0);
    return guests * (packagePrice + itemsPrice);
  }, [guestCount, selectedMenuItems, packages, packageId, sessions]);

  useEffect(() => {
    if (autoTotal) setTotalAmount(computedTotal ? String(computedTotal) : "");
  }, [computedTotal, autoTotal]);

  useEffect(() => {
    if (!id) return;
    getBooking(id).then((b: Booking | null) => {
      if (b) {
        setEventDate(toDateInputValue(b.eventDate));
        setEventType(b.eventType);
        setEventTypeCode(b.eventTypeCode);
        setVenue(b.venue);
        // With sessions the stored guestCount is their sum, not a number the user typed (QA fix 6).
        setGuestCount(b.sessions.length ? "" : String(b.guestCount));
        setStatus(b.status);
        setSessions(b.sessions);
        setServiceStyle(b.serviceStyle);
        setKidsCount(b.kidsCount);
        setSpecialMeals(b.specialMeals);
        setSavedSessionIds(new Set(b.sessions.map((s) => s.id)));
        if (b.cancelled) setLocked(L("ఈ బుకింగ్ రద్దు అయింది — మార్చలేము.", "This booking is cancelled — it can't be changed."));
        else if (isClosed(b)) setLocked(L("ఈ Event ముగించారు (lock) — మార్చాలంటే ముందు మళ్ళీ తెరవాలి.", "This event is closed — reopen it before changing it."));
        setTotalAmount(String(b.totalAmount));
        setAdvancePaid(String(b.advancePaid));
        setNotes(b.notes);
        setAssignedStaffIds(b.assignedStaffIds);
        setAutoTotal(false);
        setPackageId(b.packageId);
        setMealType(b.mealType);
        if (b.serveTime) {
          setServeTime(b.serveTime);
          setServeTouched(true);
        } else {
          setServeTime(defaultServeTime(undefined, b.mealType));
        }
        setTravelMinutes(String(b.travelMinutes));
      }
      setLoading(false);
    });
  }, [id]);

  useEffect(() => {
    if (!id || customers.length === 0) return;
    getBooking(id).then((b) => {
      if (b) {
        setCustomer(customers.find((c) => c.id === b.customerId) ?? null);
        setEditBranchId(b.branchId);
      }
    });
  }, [id, customers]);

  useEffect(() => {
    if (!id || menuItems.length === 0) return;
    getBooking(id).then((b) => {
      if (b) setSelectedMenuItems(menuItems.filter((m) => b.menuItemIds.includes(m.id)));
    });
  }, [id, menuItems]);

  // QA fix 6: with meal sessions the booking's guests = Σ session guests; say so when that differs from the typed number.
  const typedGuests = parseInt(guestCount, 10) || 0;
  const sessionTotal = sessions.length ? sessionGuests(sessions) : 0;
  const guestMismatch =
    sessions.length > 0 && typedGuests > 0 && sessionTotal !== typedGuests
      ? L(`భోజనాల మొత్తం: ${sessionTotal} మంది (మీరు ${typedGuests} రాశారు)`, `Meals total: ${sessionTotal} guests (you typed ${typedGuests})`)
      : null;

  async function handleSave() {
    if (locked) return;
    if (!serviceStyle) {
      setError(L("బంతి భోజనమా / బఫేనా ఎంచుకోండి — వంట plan కి కావాలి.", "Choose banthi or buffet — the cooking plan needs it."));
      return;
    }
    if (!sessions.length && specialMeals.some((m) => m.count < 1)) {
      setError(L("ప్రత్యేక భోజనానికి సంఖ్య ఇవ్వండి (లేదా తీసేయండి).", "Give a count for each special meal (or remove it)."));
      return;
    }
    const sessionErrors = sessionProblems(sessions, L);
    if (sessionErrors.length) {
      setError(sessionErrors.join(" "));
      return;
    }
    // With meal sessions, guests = Σ session guests and the date = earliest session (the server keeps them in sync too).
    const guests = sessions.length ? sessionGuests(sessions) : parseInt(guestCount, 10);
    const firstDate = sessions.length ? earliestSessionDate(sessions) : null;
    // The estimate is optional: empty means 0 (the quotation sets the real price).
    const total = totalAmount.trim() === "" ? 0 : parseFloat(totalAmount);
    if (Number.isNaN(total) || total < 0) {
      setError(L("అంచనా మొత్తం సరిగా లేదు (0 లేదా ఎక్కువ)", "The estimated total must be 0 or more"));
      return;
    }
    if (!customer || !guests || guests <= 0 || (!eventDate && !firstDate)) {
      setError(L("కస్టమర్, event తేదీ, సరైన అతిథుల సంఖ్య ఇవ్వండి", "Select a customer, event date, and valid guest count"));
      return;
    }
    // Module 6a: a veg-only brand does not sell a non-veg dish
    const nonVeg = vegOnlyBrand ? selectedMenuItems.filter((m) => !m.isVeg) : [];
    if (nonVeg.length > 0) {
      setError(L(`"${vegOnlyBrand}" శాకాహార బ్రాండ్ — ఈ మాంసాహార వంటకాలు తీసేయండి: ${nonVeg.map((m) => m.name).join(", ")}`, `"${vegOnlyBrand}" is a veg-only brand — remove these non-veg dishes: ${nonVeg.map((m) => m.name).join(", ")}`));
      return;
    }
    const travel = Number(travelMinutes);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(serveTime)) {
      setError(L("వడ్డించే సమయం HH:MM గా ఇవ్వండి (ఉదా: 12:30).", "Enter the serving time as HH:MM (e.g. 12:30)."));
      return;
    }
    if (!Number.isInteger(travel) || travel < 0 || travel > 300) {
      setError(L("ప్రయాణ సమయం 0–300 నిమిషాలు.", "Travel time must be 0–300 minutes."));
      return;
    }
    if (!isEdit && !currentBranchId) {
      setError(L("బుకింగ్ చేసే ముందు శాఖ (branch) ఎంచుకోండి", "Select a branch before creating a booking"));
      return;
    }
    if (session.status !== "loggedIn") return;
    setSaving(true);
    setError(null);
    try {
      const savedId = await saveBooking(
        {
          id,
          customerId: customer.id,
          customerNameSnapshot: customer.name,
          eventDate: firstDate ?? new Date(eventDate),
          eventType: eventType.trim(),
          eventTypeCode,
          venue: venue.trim(),
          guestCount: guests,
          menuItemIds: selectedMenuItems.map((m) => m.id),
          menuSnapshot: selectedMenuItems.map((m) => ({ itemId: m.id, name: m.name, pricePerPlate: m.pricePerPlate })),
          status,
          assignedStaffIds,
          totalAmount: total,
          notes: notes.trim(),
          packageId,
          mealType,
          serveTime,
          travelMinutes: travel,
          sessions,
          serviceStyle,
          kidsCount: sessions.length ? 0 : kidsCount,
          specialMeals: sessions.length ? [] : specialMeals,
        },
        session.profile.uid,
        currentBranchId
      );
      // Open the booking detail (timeline, stock and history cards live there).
      navigate(`/bookings/${savedId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : L("బుకింగ్ save కాలేదు", "Failed to save booking"));
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
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 760 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2, mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          {isEdit ? L("బుకింగ్ మార్చు", "Edit booking") : L("కొత్త బుకింగ్", "New booking")}
        </Typography>
      </Box>
      <Paper sx={{ p: 3 }}>
        <Autocomplete
          options={customers}
          getOptionLabel={(c) => `${c.name}${c.phone ? " · " + c.phone : ""}`}
          value={customer}
          onChange={(_, value) => setCustomer(value)}
          renderInput={(params) => <TextField {...params} label={L("కస్టమర్", "Customer")} margin="normal" fullWidth />}
        />

        <TextField
          label={L("Event తేదీ", "Event date")}
          type="date"
          fullWidth
          margin="normal"
          value={eventDate}
          onChange={(e) => setEventDate(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          select
          label={L("Event రకం", "Event type")}
          fullWidth
          margin="normal"
          value={eventTypeCode}
          onChange={(e) => setEventTypeCode(e.target.value as EventTypeCode)}
          helperText={L("వంట పరిమాణాల లెక్కకి వాడతాం", "Used for cooking quantities")}
        >
          {EVENT_TYPE_CODES.map((c) => (
            <SelectMenuItem key={c} value={c}>
              {L(EVENT_TYPE_LABEL[c].te, EVENT_TYPE_LABEL[c].en)}
            </SelectMenuItem>
          ))}
        </TextField>
        <TextField
          label={L("Event పేరు / వివరం", "Event name / details")}
          fullWidth
          margin="normal"
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
        />
        <TextField label={L("వేదిక", "Venue")} fullWidth margin="normal" value={venue} onChange={(e) => setVenue(e.target.value)} />
        <TextField
          select
          required
          label={L("వడ్డన రకం", "Service style")}
          fullWidth
          margin="normal"
          value={serviceStyle}
          error={!!error && !serviceStyle}
          onChange={(e) => setServiceStyle(e.target.value as ServiceStyle)}
          helperText={L("బంతి భోజనంలో, బఫేలో తినే పరిమాణం వేరు — వంట plan దీన్ని వాడుతుంది", "People eat different amounts at banthi and buffet — the cooking plan uses this")}
        >
          {SERVICE_STYLES.map((st) => (
            <SelectMenuItem key={st} value={st}>
              {L(STYLE_LABEL[st].te, STYLE_LABEL[st].en)}
            </SelectMenuItem>
          ))}
        </TextField>
        <TextField
          label={L("అతిథుల సంఖ్య", "Guest count")}
          disabled={sessions.length > 0}
          helperText={sessions.length ? L("భోజనాల అతిథుల మొత్తం", "Sum of the meal sessions") : undefined}
          type="number"
          fullWidth
          margin="normal"
          value={sessions.length ? String(sessionGuests(sessions)) : guestCount}
          onChange={(e) => setGuestCount(e.target.value)}
        />
        {guestMismatch && (
          <Alert severity="warning" sx={{ mt: 1 }}>
            {guestMismatch}
          </Alert>
        )}
        {sessions.length === 0 && (
          <KidsSpecialEditor
            kidsCount={kidsCount}
            specialMeals={specialMeals}
            onChange={(k, m) => {
              setKidsCount(k);
              setSpecialMeals(m);
            }}
          />
        )}

        <TextField
          select
          label={L("మెనూ ప్యాకేజీ", "Menu package")}
          fullWidth
          margin="normal"
          value={packageId}
          onChange={(e) => choosePackage(e.target.value)}
        >
          <SelectMenuItem value="">{L("ఏదీ లేదు", "None")}</SelectMenuItem>
          {packages.map((p) => (
            <SelectMenuItem key={p.id} value={p.id}>
              {L(p.nameTe || p.nameEn, p.nameEn || p.nameTe)}
            </SelectMenuItem>
          ))}
        </TextField>
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr 1fr" } }}>
          <TextField
            select
            label={L("భోజనం రకం", "Meal")}
            margin="normal"
            value={mealType}
            onChange={(e) => chooseMeal(e.target.value as MealType)}
          >
            {MEAL_TYPES.map((m) => (
              <SelectMenuItem key={m} value={m}>
                {L(MEAL_LABEL[m].te, MEAL_LABEL[m].en)}
              </SelectMenuItem>
            ))}
          </TextField>
          <TextField
            type="time"
            label={L("వడ్డించే సమయం", "Serving time")}
            margin="normal"
            value={serveTime}
            onChange={(e) => {
              setServeTime(e.target.value);
              setServeTouched(true);
            }}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label={L("ప్రయాణం (నిమిషాలు)", "Travel (minutes)")}
            margin="normal"
            value={travelMinutes}
            onChange={(e) => setTravelMinutes(e.target.value.replace(/\D/g, "").slice(0, 3))}
            inputMode="numeric"
          />
        </Box>

        <Button size="small" onClick={() => setShowPreview((v) => !v)} sx={{ mt: 0.5 }}>
          {showPreview ? L("Timeline ముందుచూపు మూసేయి", "Hide timeline preview") : L("ఈ వివరాలతో timeline చూడండి", "Preview the timeline with these details")}
        </Button>
        {showPreview &&
          (/^\d{4}-\d{2}-\d{2}$/.test(eventDate) && /^([01]\d|2[0-3]):[0-5]\d$/.test(serveTime) && (sessions.length ? sessionTotal : typedGuests) > 0 ? (
            <ServiceTimelineCard
              title={L("Timeline ముందుచూపు (save చేయలేదు)", "Timeline preview (not saved)")}
              request={{
                eventDay: eventDate,
                serveTime,
                guests: sessions.length ? sessionTotal : typedGuests,
                mealType,
                travelMinutes: Math.min(300, Number(travelMinutes) || 0),
              }}
            />
          ) : (
            <Alert severity="info" sx={{ mt: 1 }}>
              {L("ముందుచూపుకి event తేదీ, అతిథులు, వడ్డించే సమయం ఇవ్వండి.", "Enter the event date, guests and serving time to preview.")}
            </Alert>
          ))}

        <Autocomplete
          multiple
          options={menuItems}
          getOptionLabel={(m) => m.name}
          value={selectedMenuItems}
          onChange={(_, value) => setSelectedMenuItems(value)}
          renderInput={(params) => <TextField {...params} label={L("మెనూ ఐటమ్స్", "Menu items")} margin="normal" fullWidth />}
        />

        <TextField
          select
          label={L("స్థితి", "Status")}
          fullWidth
          margin="normal"
          value={status}
          onChange={(e) => setStatus(e.target.value as BookingStatus)}
        >
          {(BOOKING_STATUSES.includes(status) ? BOOKING_STATUSES : [...BOOKING_STATUSES, status]).map((s) => (
            <SelectMenuItem key={s} value={s}>
              {bookingStatusLabel(s, lang)}
            </SelectMenuItem>
          ))}
        </TextField>

        <SessionsEditor
          sessions={sessions}
          onChange={(next) => {
            // QA fix 6: keep the typed guest count, so a different session total is shown as a notice.
            setSessions(next);
          }}
          packages={packages}
          eventDate={eventDate}
          savedIds={savedSessionIds}
          disabled={!!locked}
          defaultStyle={serviceStyle}
        />

        <TextField
          label={L("అంచనా మొత్తం (₹)", "Estimated total (₹)")}
          type="number"
          fullWidth
          margin="normal"
          value={totalAmount}
          onChange={(e) => {
            setTotalAmount(e.target.value);
            setAutoTotal(false);
          }}
        />
        <FormControlLabel
          control={<Checkbox checked={autoTotal} onChange={(e) => setAutoTotal(e.target.checked)} />}
          label={L("అతిథులు × మెనూ ధర తో అంచనా", "Estimate from guest count × menu price")}
        />

        <TextField
          label={L("అడ్వాన్స్ (చెల్లించింది)", "Advance paid")}
          type="number"
          fullWidth
          margin="normal"
          value={advancePaid || "0"}
          disabled
          helperText={L("అడ్వాన్స్ invoice లో 'చెల్లింపు నమోదు' ద్వారా వేయండి", "Record advances as payments on the invoice")}
        />
        <TextField
          label={L("గమనికలు", "Notes")}
          fullWidth
          margin="normal"
          multiline
          minRows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
        {locked && (
          <Alert severity="info" sx={{ mt: 2 }}>
            {locked}
          </Alert>
        )}
        {guestMismatch && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {guestMismatch}
          </Alert>
        )}
        <Box sx={{ display: "flex", gap: 2, mt: 3 }}>
          <Button variant="contained" onClick={handleSave} disabled={saving || !!locked}>
            {saving ? L("Save అవుతోంది…", "Saving…") : L("Save చేయి", "Save")}
          </Button>
          <Button onClick={() => navigate(id ? `/bookings/${id}` : "/bookings")}>{L("వద్దు", "Cancel")}</Button>
        </Box>
      </Paper>
    </Box>
  );
}
