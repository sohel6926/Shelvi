import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Box, Button, Chip, Grid, Paper, Typography } from "@mui/material";
import EventIcon from "@mui/icons-material/Event";
import { useSession } from "../../auth/AuthProvider";
import { subscribeUsers } from "../../data/records";
import { useBranch } from "../../session/BranchContext";
import { RefreshButton } from "../../components/RefreshButton";
import { allOf, branchQuery, refreshFromServer } from "../../data/refresh";
import { dateLocale, useLang } from "../../i18n/LanguageContext";
import { bookingStatusLabel, statusColor } from "../bookings/statusColor";
import { subscribeBookings, type Booking } from "../../data/bookingRepository";
import { CancellationsCard } from "../bookings/CancellationsPage";
import { liveRows } from "../../data/cancel";
import { kpiCardSx, tabularNums, tokens } from "../../theme/tokens";

type Lang = "te" | "en";

function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function formatDate(date: Date | null, lang: Lang): string {
  if (!date) return "";
  return date.toLocaleDateString(dateLocale(lang), { weekday: "short", day: "numeric", month: "short" });
}

/** "13:30" -> "1:30 PM" (empty stays empty). */
function serveClock(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  if (!m) return "";
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? "PM" : "AM"}`;
}

const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export function DashboardPage() {
  const { L, lang } = useLang();
  const { currentBranchId } = useBranch();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const navigate = useNavigate();
  const session = useSession();
  const isAdmin = session.status === "loggedIn" && session.profile.role === "admin";
  const isManagerOrAdmin = session.status === "loggedIn" && (session.profile.role === "admin" || session.profile.role === "manager");
  const [pendingUsers, setPendingUsers] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    return subscribeUsers((users) => setPendingUsers(users.filter((u) => !u.active && u.role !== "admin").length));
  }, [isAdmin]);

  useEffect(() => subscribeBookings(currentBranchId, setBookings), [currentBranchId]);

  // Calendar-first: today, tomorrow, the next 5 days, then everything later.
  const groups = useMemo(() => {
    const today = dayStart(new Date());
    const DAY = 86_400_000;
    const live = bookings
      .filter((b) => b.status === "Inquiry" || b.status === "Confirmed" || b.status === "InProgress")
      .filter((b) => b.eventDate && dayStart(b.eventDate) >= today)
      .sort((a, b) => (a.eventDate!.getTime() - b.eventDate!.getTime()) || a.serveTime.localeCompare(b.serveTime));
    const at = (b: Booking) => (dayStart(b.eventDate!) - today) / DAY;
    return [
      { key: "today", title: L("ఈ రోజు", "Today"), rows: live.filter((b) => at(b) === 0) },
      { key: "tomorrow", title: L("రేపు", "Tomorrow"), rows: live.filter((b) => at(b) === 1) },
      { key: "week", title: L("ఈ వారం", "This week"), rows: live.filter((b) => at(b) >= 2 && at(b) <= 6) },
      { key: "later", title: L("తర్వాత", "Later"), rows: live.filter((b) => at(b) > 6).slice(0, 6) },
    ];
  }, [bookings, L]);

  const todayCount = groups[0].rows.length;
  const upcomingCount = groups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3, gap: 2, flexWrap: "wrap" }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          {L("డ్యాష్‌బోర్డ్", "Dashboard")}
        </Typography>
        <RefreshButton
          onRefresh={() =>
            refreshFromServer(branchQuery("bookings", currentBranchId), ...(isAdmin ? [allOf("users")] : []))
          }
        />
      </Box>
      {pendingUsers > 0 && (
        <Alert
          severity="warning"
          sx={{ mb: 3 }}
          action={
            <Button color="inherit" size="small" onClick={() => navigate("/users")}>
              {L("చూడండి", "Review")}
            </Button>
          }
        >
          {L(
            `${pendingUsers} కొత్త వినియోగదారులు మీ అనుమతి కోసం ఎదురుచూస్తున్నారు.`,
            `${pendingUsers} new sign-up${pendingUsers > 1 ? "s are" : " is"} waiting for your approval.`,
          )}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* The one number that matters, then the calendar. */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Paper sx={{ ...kpiCardSx(todayCount > 0 ? "good" : "neutral"), mb: 3 }}>
            <Typography variant="body2" color="text.secondary">
              {L("ఈ రోజు కార్యక్రమాలు", "Events today")}
            </Typography>
            <Typography variant="h3" component="p" sx={{ fontWeight: 700, ...tabularNums }}>
              {todayCount}
            </Typography>
          </Paper>

          {upcomingCount === 0 ? (
            <Paper sx={{ p: 3 }}>
              <Typography color="text.secondary">{L("రాబోయే బుకింగ్‌లు లేవు.", "No upcoming bookings.")}</Typography>
            </Paper>
          ) : (
            groups
              .filter((g) => g.rows.length > 0)
              .map((g) => (
                <Box key={g.key} component="section" sx={{ mb: 3 }}>
                  <Typography variant="h6" component="h2" sx={{ mb: 1, color: tokens.color.goldDeep }}>
                    {g.title}
                  </Typography>
                  <Box sx={{ display: "grid", gap: 1.5 }}>
                    {g.rows.map((b) => {
                      const due = Math.max(0, (b.totalAmount || 0) - (b.advancePaid || 0));
                      const time = serveClock(b.serveTime);
                      return (
                        <Paper
                          key={b.id}
                          component="button"
                          type="button"
                          onClick={() => navigate(`/bookings/${b.id}`)}
                          sx={{
                            p: 2,
                            textAlign: "left",
                            cursor: "pointer",
                            border: `1px solid ${tokens.color.border}`,
                            font: "inherit",
                            color: "inherit",
                            display: "flex",
                            gap: 2,
                            alignItems: "center",
                            "&:hover": { backgroundColor: tokens.color.greenTint },
                          }}
                        >
                          <Box sx={{ minWidth: 76, textAlign: "center", ...tabularNums }}>
                            <EventIcon fontSize="small" color="primary" />
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {time || formatDate(b.eventDate, lang)}
                            </Typography>
                            {time && g.key !== "today" && g.key !== "tomorrow" && (
                              <Typography variant="caption" color="text.secondary">
                                {formatDate(b.eventDate, lang)}
                              </Typography>
                            )}
                          </Box>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography sx={{ fontWeight: 600 }} noWrap title={b.customerNameSnapshot}>
                              {b.customerNameSnapshot || L("పేరు లేదు", "Unnamed")} — {b.eventType || L("కార్యక్రమం", "Event")}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" noWrap title={b.venue}>
                              {b.venue ? `${b.venue} · ` : ""}{L(`${b.guestCount} మంది`, `${b.guestCount} guests`)}
                            </Typography>
                          </Box>
                          <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                            <Chip label={bookingStatusLabel(b.status, lang)} size="small" color={statusColor(b.status)} />
                            {due > 0 && (
                              <Typography variant="body2" sx={{ mt: 0.5, color: tokens.color.bad, fontWeight: 600, ...tabularNums }}>
                                {rupees(due)} {L("బాకీ", "due")}
                              </Typography>
                            )}
                          </Box>
                        </Paper>
                      );
                    })}
                  </Box>
                </Box>
              ))
          )}
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Box sx={{ display: "grid", gap: 2 }}>
            <Paper sx={kpiCardSx("info")}>
              <Typography variant="body2" color="text.secondary">
                {L("రాబోయే బుకింగ్‌లు", "Upcoming bookings")}
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 600, ...tabularNums }}>
                {bookings.filter((b) => (b.status === "Inquiry" || b.status === "Confirmed") && (!b.eventDate || b.eventDate >= new Date())).length}
              </Typography>
            </Paper>
            <Paper sx={kpiCardSx("brand")}>
              <Typography variant="body2" color="text.secondary">
                {L("మొత్తం బుకింగ్‌లు", "Total bookings")} (
                {currentBranchId ? L("ఈ శాఖ", "this branch") : L("అన్ని శాఖలు", "all branches")})
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 600, ...tabularNums }}>
                {/* Round 9: cancelled orders are not counted here — see the cancellations card. */}
                {liveRows(bookings).length}
              </Typography>
            </Paper>
            {isManagerOrAdmin && <CancellationsCard />}
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
}
