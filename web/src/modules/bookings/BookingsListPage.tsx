import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Typography, Button, Paper, List, ListItemButton, ListItemText, Chip } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useBranch } from "../../session/BranchContext";
import { RefreshButton } from "../../components/RefreshButton";
import { refreshFromServer } from "../../data/refresh";
import { bookingsQuery, subscribeBookings, type Booking } from "../../data/bookingRepository";
import { useSession } from "../../auth/AuthProvider";
import { bookingStatusLabel, statusColor } from "./statusColor";
import { dateLocale, hiIfOn, useLang } from "../../i18n/LanguageContext";
import { liveRows, visibleRows } from "../../data/cancel";
import { formatMoney } from "../../util/format";
import { reasonLabel } from "./bookingCancelHelpers";
import { ShowCancelledSwitch } from "../../components/CancelControls";

function formatDate(date: Date | null, lang: "te" | "en"): string {
  if (!date) return lang === "te" ? "తేదీ లేదు" : hiIfOn("No date");
  return date.toLocaleDateString(dateLocale(lang), { day: "numeric", month: "short", year: "numeric" });
}

export function BookingsListPage() {
  const navigate = useNavigate();
  const { L, lang } = useLang();
  const { currentBranchId } = useBranch();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [showCancelled, setShowCancelled] = useState(false);
  /** Round 9 "రద్దైనవి" filter: with the switch on, optionally only the cancelled ones. */
  const [onlyCancelled, setOnlyCancelled] = useState(false);
  const cancelledCount = bookings.length - liveRows(bookings).length;
  const rows = showCancelled && onlyCancelled ? bookings.filter((b) => b.cancelled) : visibleRows(bookings, showCancelled);

  // Staff: only the events assigned to them (staffId from the user doc); re-subscribe when it is linked.
  const session = useSession();
  const isStaff = session.status === "loggedIn" && session.profile.role === "staff";
  const staffKey = isStaff && session.status === "loggedIn" ? session.profile.staffId : "";
  useEffect(() => subscribeBookings(currentBranchId, setBookings, () => setBookings([])), [currentBranchId, staffKey]);

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          {isStaff ? L("నా events", "My events") : L("బుకింగ్‌లు", "Bookings")}
        </Typography>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          <RefreshButton onRefresh={() => refreshFromServer(bookingsQuery(currentBranchId))} />
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate("/bookings/new")}>
            {L("కొత్త బుకింగ్", "New booking")}
          </Button>
        </Box>
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 1 }}>
        <ShowCancelledSwitch
          checked={showCancelled}
          onChange={(v) => {
            setShowCancelled(v);
            if (!v) setOnlyCancelled(false);
          }}
          count={cancelledCount}
        />
        {showCancelled && (
          <Chip
            clickable
            label={L("రద్దైనవి మాత్రమే", "Cancelled only")}
            color={onlyCancelled ? "error" : "default"}
            variant={onlyCancelled ? "filled" : "outlined"}
            onClick={() => setOnlyCancelled((v) => !v)}
            aria-pressed={onlyCancelled}
          />
        )}
      </Box>
      <Paper>
        {bookings.length === 0 ? (
          <Typography color="text.secondary" sx={{ p: 3 }}>
            {isStaff ? L("మీకు కేటాయించిన events లేవు", "No events assigned to you") : L("ఇంకా బుకింగ్‌లు లేవు.", "No bookings yet.")}
          </Typography>
        ) : (
          <List disablePadding>
            {rows.length === 0 && (
              <Typography color="text.secondary" sx={{ p: 3 }}>
                {L("ఈ ఫిల్టర్‌లో బుకింగ్‌లు లేవు.", "No bookings for this filter.")}
              </Typography>
            )}
            {rows.map((b) => (
              <ListItemButton
                key={b.id}
                divider
                onClick={() => navigate(`/bookings/${b.id}`)}
                sx={{ display: "flex", justifyContent: "space-between" }}
              >
                <ListItemText
                  primary={`${b.customerNameSnapshot || L("పేరు లేదు", "Unnamed")} — ${b.eventType || L("కార్యక్రమం", "Event")}`}
                  secondary={`${formatDate(b.eventDate, lang)} · ${b.venue} · ${L(`${b.guestCount} మంది`, `${b.guestCount} guests`)}${
                    b.sessions.length ? ` · ${L(`${b.sessions.length} భోజనాలు`, `${b.sessions.length} meals`)}` : ""
                  }${
                    b.cancelled
                      ? b.cancelDetail
                        ? ` · ${reasonLabel(b.cancelDetail.reasonCode, b.cancelDetail.reasonTe, L)}${b.cancelDetail.reason ? ` — ${b.cancelDetail.reason}` : ""}${
                            b.cancelDetail.refund > 0 ? ` · ${L("తిరిగి", "refunded")} ${formatMoney(b.cancelDetail.refund)}` : ""
                          }${b.cancelDetail.charge > 0 ? ` · ${L("ఉంచుకున్నది", "kept")} ${formatMoney(b.cancelDetail.charge)}` : ""}`
                        : b.cancelReason
                          ? ` · ${b.cancelReason}`
                          : ""
                      : ""
                  }`}
                />
                <Chip label={bookingStatusLabel(b.status, lang)} size="small" color={statusColor(b.status)} />
              </ListItemButton>
            ))}
          </List>
        )}
      </Paper>
    </Box>
  );
}
