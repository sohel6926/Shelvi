import { useEffect, useState } from "react";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";
import { Alert, Box, Button, Chip, CircularProgress, Paper, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import EditIcon from "@mui/icons-material/Edit";
import NoteAddIcon from "@mui/icons-material/NoteAdd";
import BlockIcon from "@mui/icons-material/Block";
import EventRepeatIcon from "@mui/icons-material/EventRepeat";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import { doc } from "firebase/firestore";
import { db } from "../../firebase";
import { dateLocale, useLang } from "../../i18n/LanguageContext";
import { useSession } from "../../auth/AuthProvider";
import { BookingBrandChip } from "./BookingBrandChip";
import { can, type Role } from "../../auth/roles";
import { isClosed, subscribeBooking, type Booking, type EventTypeCode, type MealType } from "../../data/bookingRepository";
import { subscribeMenuPackages, type MenuPackage } from "../../data/menuPackageRepository";
import { refreshFromServer } from "../../data/refresh";
import { RefreshButton } from "../../components/RefreshButton";
import { HistorySection } from "../../components/HistoryList";
import { formatINR, formatMoney } from "../../util/format";
import { bookingStatusLabel, statusColor } from "./statusColor";
import { EventStockCard, ServiceTimelineCard } from "./BookingDetailCards";
import { ClosedBanner, CloseEventCard, EventCostsCard, ExtrasCard, GuestCountCard, SessionsCard } from "./EventLiveCards";
import { CancelledBand, OrderCancelDialog, PostponeDialog, RestoreDialog, Round9Notes } from "./BookingCancel";
import { useBookingAdvance } from "./bookingCancelHelpers";
import { KidsSpecialChips } from "./KidsSpecialEditor";
import { ShiftsCard } from "./ShiftsCard";
import { CookLogCard, EventPlanCard } from "./KitchenPlanCards";
import { CostCompareCard } from "./CostCompareCard";
import { STYLE_LABEL } from "../../data/dishRepository";
import { subscribeBookingMoneyDocs, type Invoice, type Quotation } from "../../data/records";
import { errorText, generateInvoiceFromBooking } from "../../data/functions";

const EVENT_TYPE_TE: Record<EventTypeCode, { te: string; en: string }> = {
  wedding: { te: "పెళ్ళి", en: "Wedding" },
  annadanam: { te: "అన్నదానం", en: "Annadanam" },
  housewarming: { te: "గృహప్రవేశం", en: "Housewarming" },
  office: { te: "ఆఫీస్ కార్యక్రమం", en: "Office event" },
  other: { te: "ఇతర", en: "Other" },
};

const MEAL_TE: Record<MealType, { te: string; en: string }> = {
  tiffin: { te: "టిఫిన్", en: "Tiffin" },
  lunch: { te: "భోజనం", en: "Lunch" },
  dinner: { te: "రాత్రి భోజనం", en: "Dinner" },
  "lunch-dinner": { te: "భోజనం + రాత్రి", en: "Lunch + dinner" },
  other: { te: "ఇతర", en: "Other" },
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography>{value || "—"}</Typography>
    </Box>
  );
}

/** "అడ్వాన్స్" = Σ non-cancelled payments on the booking's invoices (legacy field only for old records / staff). */
function AdvanceField({ booking, role }: { booking: Booking; role: Role }) {
  const { L } = useLang();
  const advance = useBookingAdvance(booking, role);
  return <Field label={L("అడ్వాన్స్ (చెల్లించింది)", "Advance (paid)")} value={advance === null ? "…" : formatMoney(advance)} />;
}

/**
 * QA fix 4: "బిల్ తయారు చేయి" — generateInvoiceFromBooking when the booking has an accepted (or latest
 * live) quotation and no live invoice; once there is one, open it to record the advance.
 */
function BillButton({ booking, role }: { booking: Booking; role: Role }) {
  const { L, lang } = useLang();
  const navigate = useNavigate();
  const [docs, setDocs] = useState<{ quotations: Quotation[]; invoices: Invoice[]; loaded: boolean }>({ quotations: [], invoices: [], loaded: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const branch = role === "admin" ? null : booking.branchId || null;
  useEffect(
    () => subscribeBookingMoneyDocs(booking.id, branch, setDocs, (e) => setError(errorText(e, lang))),
    [booking.id, branch, lang],
  );
  if (!docs.loaded) return null;
  const liveInvoice = docs.invoices.find((i) => !i.cancelled && !["Cancelled", "Void"].includes(i.status));
  const quote = docs.quotations.find((q) => !q.cancelled && !["Rejected", "Cancelled"].includes(q.status));

  if (liveInvoice) {
    return (
      <Button variant="outlined" startIcon={<ReceiptLongIcon />} onClick={() => navigate(`/invoices/${liveInvoice.id}`)}>
        {L(`బిల్ ${liveInvoice.invoiceNumber} — అడ్వాన్స్ నమోదు`, `Bill ${liveInvoice.invoiceNumber} — record advance`)}
      </Button>
    );
  }
  if (!quote) return null;
  return (
    <>
      <Button
        variant="contained"
        color="secondary"
        startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <ReceiptLongIcon />}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const res = await generateInvoiceFromBooking({ bookingId: booking.id });
            navigate(`/invoices/${res.invoiceId}`);
          } catch (e) {
            setError(errorText(e, lang));
          } finally {
            setBusy(false);
          }
        }}
      >
        {L("బిల్ తయారు చేయి", "Make bill")}
      </Button>
      {error && (
        <Alert severity="error" sx={{ width: "100%" }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
    </>
  );
}

/** Booking detail: summary + service timeline + event stock + history (admin). Edit opens the form. */
export function BookingDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { L, T, lang } = useLang();
  const session = useSession();
  const role = session.status === "loggedIn" ? session.profile.role : "staff";
  const [booking, setBooking] = useState<Booking | null | undefined>(undefined);
  const [packages, setPackages] = useState<MenuPackage[]>([]);
  /** Round 9 dialogs (kept at page level so the result stays visible after the booking re-renders). */
  const [dialog, setDialog] = useState<"cancel" | "restore" | "postpone" | null>(null);

  useEffect(() => (id ? subscribeBooking(id, setBooking) : undefined), [id]);
  useEffect(() => subscribeMenuPackages(setPackages), []);

  if (booking === undefined) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  const pkg = booking ? packages.find((p) => p.id === booking.packageId) : undefined;
  const date = booking?.eventDate?.toLocaleDateString(dateLocale(lang), {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 900 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 2 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate("/bookings")}>
          {L("బుకింగ్‌లు", "Bookings")}
        </Button>
        {booking && (
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
            <RefreshButton onRefresh={() => refreshFromServer(doc(db, "bookings", booking.id))} />
            {can.quote(role) && !booking.cancelled && !isClosed(booking) && (
              <Button variant="outlined" startIcon={<NoteAddIcon />} onClick={() => navigate(`/quotes/new?booking=${booking.id}`)}>
                {L("కొటేషన్", "Quote")}
              </Button>
            )}
            {can.recordPayment(role) && !booking.cancelled && !isClosed(booking) && <BillButton booking={booking} role={role} />}
            {can.cancel(role, "bookings") && !booking.cancelled && !isClosed(booking) && booking.status !== "Completed" && (
              <Button variant="outlined" startIcon={<EventRepeatIcon />} onClick={() => setDialog("postpone")}>
                {L("తేదీ మార్చు", "Change date")}
              </Button>
            )}
            {can.cancel(role, "bookings") && !booking.cancelled && !isClosed(booking) && (
              <Button color="error" variant="outlined" startIcon={<BlockIcon />} onClick={() => setDialog("cancel")}>
                {L("ఆర్డర్ రద్దు", "Cancel order")}
              </Button>
            )}
            <Button
              variant="contained"
              startIcon={<EditIcon />}
              disabled={booking.cancelled || isClosed(booking)}
              onClick={() => navigate(`/bookings/${booking.id}/edit`)}
            >
              {L("మార్చు", "Edit")}
            </Button>
          </Box>
        )}
      </Box>

      {!booking ? (
        <Alert severity="warning">{L("బుకింగ్ దొరకలేదు.", "Booking not found.")}</Alert>
      ) : (
        <>
          {booking.cancelled && <CancelledBand booking={booking} role={role} onRestore={() => setDialog("restore")} />}
          <Round9Notes booking={booking} />
          <Paper sx={{ p: 2.5 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 1, flexWrap: "wrap" }}>
              <Box>
                <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
                  {booking.customerNameSnapshot || L("పేరు లేదు", "Unnamed")}
                </Typography>
                <Typography color="text.secondary">
                  {T(EVENT_TYPE_TE[booking.eventTypeCode])}
                  {booking.eventType && ` · ${booking.eventType}`}
                </Typography>
              </Box>
              <Chip label={bookingStatusLabel(booking.status, lang)} color={statusColor(booking.status)} />
              {role !== "staff" && !booking.cancelled && !isClosed(booking) && (
                <Button size="small" variant="outlined" component={RouterLink} to={`/dispatch?bookingId=${booking.id}`}>
                  {L("పంపిణీ", "Dispatch")}
                </Button>
              )}
              <BookingBrandChip bookingId={booking.id} branchId={booking.branchId} canChange={role !== "staff" && !booking.cancelled && !isClosed(booking)} />
            </Box>
            <Box sx={{ display: "grid", gap: 2, mt: 2, gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)" } }}>
              <Field label={L("తేదీ", "Date")} value={date ?? ""} />
              <Field label={L("వేదిక", "Venue")} value={booking.venue} />
              <Field
                label={L("అతిథులు", "Guests")}
                value={[
                  String(booking.guestCount),
                  booking.guestCountConfirmed ? L(`ఖరారు ${booking.guestCountConfirmed}`, `confirmed ${booking.guestCountConfirmed}`) : "",
                  booking.guestCountActual ? L(`వచ్చినవారు ${booking.guestCountActual}`, `actual ${booking.guestCountActual}`) : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
              <Field label={L("మెనూ ప్యాకేజీ", "Menu package")} value={pkg ? L(pkg.nameTe || pkg.nameEn, pkg.nameEn || pkg.nameTe) : ""} />
              <Field label={L("భోజనం", "Meal")} value={T(MEAL_TE[booking.mealType])} />
              <Field label={L("వడ్డన రకం", "Service style")} value={booking.serviceStyle ? T(STYLE_LABEL[booking.serviceStyle]) : L("ఇంకా ఎంచుకోలేదు", "Not chosen yet")} />
              <Field label={L("వడ్డించే సమయం", "Serving time")} value={booking.serveTime} />
              <Field label={L("ప్రయాణం", "Travel")} value={L(`${booking.travelMinutes} నిమిషాలు`, `${booking.travelMinutes} min`)} />
              <Field label={L("అంచనా మొత్తం", "Estimated total")} value={formatINR(booking.totalAmount)} />
              <AdvanceField booking={booking} role={role} />
            </Box>
            <KidsSpecialChips kidsCount={booking.kidsCount} specialMeals={booking.specialMeals} />
            {booking.menuSnapshot.length > 0 && (
              <Typography variant="body2" sx={{ mt: 2 }}>
                {L("అదనపు ఐటమ్స్", "Extra items")}: {booking.menuSnapshot.map((m) => m.name).join(", ")}
              </Typography>
            )}
            {booking.notes && (
              <Typography variant="body2" sx={{ mt: 1, whiteSpace: "pre-line" }}>
                {booking.notes}
              </Typography>
            )}
          </Paper>
          {booking.cancelled ? (
            // Round 9: a cancelled order is read-only — only its costs (loss), stock and history are shown.
            <>
              {role !== "staff" && <EventCostsCard booking={booking} />}
          {role === "admin" && <CostCompareCard bookingId={booking.id} reloadKey={`${booking.status}|${booking.guestCount}`} />}
              <EventStockCard booking={booking} />
            </>
          ) : (
          <>
          <ClosedBanner booking={booking} role={role} />
          <SessionsCard booking={booking} packages={packages} role={role} />
          {booking.sessions.length === 0 && (
          <ServiceTimelineCard
            request={{ bookingId: booking.id }}
            reloadKey={[
              booking.serveTime,
              booking.travelMinutes,
              booking.mealType,
              booking.guestCount,
              booking.guestCountConfirmed,
              booking.guestCountActual,
              booking.eventDate?.getTime(),
            ].join("|")}
          />
          )}
          {role !== "staff" && <EventPlanCard booking={booking} />}
          {role !== "staff" && <ShiftsCard booking={booking} />}
          <GuestCountCard booking={booking} />
          <ExtrasCard booking={booking} role={role} />
          {role !== "staff" && <EventCostsCard booking={booking} />}
          {role === "admin" && <CostCompareCard bookingId={booking.id} reloadKey={`${booking.status}|${booking.guestCount}`} />}
          <CookLogCard booking={booking} role={role} />
          <EventStockCard booking={booking} />
          <CloseEventCard booking={booking} role={role} />
          </>
          )}
          <HistorySection collection="bookings" docId={booking.id} />
          <OrderCancelDialog open={dialog === "cancel"} booking={booking} role={role} onClose={() => setDialog(null)} />
          <RestoreDialog open={dialog === "restore"} booking={booking} onClose={() => setDialog(null)} />
          <PostponeDialog open={dialog === "postpone"} booking={booking} onClose={() => setDialog(null)} />
        </>
      )}
    </Box>
  );
}
