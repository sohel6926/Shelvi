import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Box, Button, Chip, CircularProgress, FormControlLabel, Paper, Switch, Typography } from "@mui/material";
import TvIcon from "@mui/icons-material/Tv";
import CloseIcon from "@mui/icons-material/Close";
import RefreshIcon from "@mui/icons-material/Refresh";
import DashboardIcon from "@mui/icons-material/Dashboard";
import FlagIcon from "@mui/icons-material/Flag";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import { useSession } from "../../auth/AuthProvider";
import { can } from "../../auth/roles";
import { dateLocale, useLang, monthName } from "../../i18n/LanguageContext";
import { errorText, getTargetBoard, type TargetBoard } from "../../data/functions";
import { AnimatedProgress, Celebrate, CountUp, formatIndian } from "../../theme/motion";
import { kpiCardSx, tokens } from "../../theme/tokens";
import { istMonth } from "../../util/dates";
import { CalcModeChip } from "../../components/CalcModeChip";
import { AUTO_META } from "../../data/calcMode";

/**
 * Round 11 — the Target Board is the first screen for everyone (admin, manager, staff).
 * All numbers come from getTargetBoard, already filtered by role on the server: profit only for the owner,
 * ₹ sales for managers / staff only when the owner turned on "అందరికీ ₹ చూపించు". This page never computes a target.
 */
const REFRESH_MS = 60_000;

function pct(actual: number | null | undefined, target: number | null | undefined): number | null {
  if (typeof actual !== "number" || typeof target !== "number" || target <= 0) return null;
  return (actual / target) * 100;
}

interface MetricProps {
  label: string;
  actual: number | null;
  target: number | null;
  percent: number | null;
  money: boolean;
  percentOnly: boolean;
  tv: boolean;
  lead?: boolean;
  /** e.g. the manual / automatic chip of this month's target. */
  badge?: ReactNode;
  emptyText?: string;
}

/** One board card: big number (or %), "of target", and an animated bar with its % as text. */
function Metric({ label, actual, target, percent, money, percentOnly, tv, lead, badge, emptyText }: MetricProps) {
  const { L } = useLang();
  const showPct = percent ?? null;
  const reached = showPct !== null && showPct >= 100;
  const big = tv ? (lead ? "6rem" : "4rem") : lead ? "3.5rem" : "2.4rem";
  const fmt = (n: number) => (money ? `₹${formatIndian(n)}` : formatIndian(n));
  const hideNumbers = money && (percentOnly || actual === null);
  return (
    <Paper sx={{ ...kpiCardSx(reached ? "good" : "brand"), position: "relative", p: tv ? 4 : 2.5, height: "100%" }}>
      <Typography variant="section" component="h2" sx={{ fontSize: tv ? "1.7rem" : "1.1rem", color: tokens.color.goldDeep }}>
        {label}
      </Typography>
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1.5, flexWrap: "wrap", my: 1 }}>
        <Typography variant="kpi" component="p" sx={{ fontFamily: tokens.font.heading, fontSize: big, lineHeight: 1.15 }}>
          {hideNumbers || actual === null ? (
            showPct !== null ? <CountUp value={Math.round(showPct)} format={(n) => `${formatIndian(n)}%`} /> : "—"
          ) : (
            <CountUp value={actual} format={fmt} />
          )}
        </Typography>
        {!hideNumbers && target !== null && (
          <Typography color="text.secondary" sx={{ fontSize: tv ? "1.7rem" : "1.05rem" }}>
            {L(`లక్ష్యం ${fmt(target)}`, `of ${fmt(target)}`)}
          </Typography>
        )}
      </Box>
      {showPct !== null ? (
        <AnimatedProgress value={showPct} label={label} height={tv ? 20 : lead ? 14 : 10} tone={reached ? "good" : "brand"} celebrateOnComplete />
      ) : (
        <Typography variant="body2" color="text.secondary">
          {emptyText ?? L("లక్ష్యం పెట్టలేదు", "No target set")}
        </Typography>
      )}
      {badge && <Box sx={{ mt: 1 }}>{badge}</Box>}
      {reached && (
        <Typography sx={{ mt: 1, fontWeight: 600, color: tokens.color.good, fontSize: tv ? "1.5rem" : undefined }}>
          <EmojiEventsIcon fontSize="inherit" sx={{ mr: 0.75, verticalAlign: "-0.15em" }} />{L("లక్ష్యం పూర్తి!", "Target reached!")}
        </Typography>
      )}
    </Paper>
  );
}

export function TargetBoardPage() {
  const { L, lang } = useLang();
  const navigate = useNavigate();
  const session = useSession();
  const role = session.status === "loggedIn" ? session.profile.role : "staff";
  const [month] = useState(istMonth());
  const [data, setData] = useState<TargetBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tv, setTv] = useState(false);
  const [pctOnlyChoice, setPctOnlyChoice] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const tvRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    getTargetBoard({ month })
      .then((d) => {
        setData(d);
        setError(null);
        setUpdatedAt(d.generatedAt ? new Date(d.generatedAt) : new Date());
      })
      .catch((e) => setError(errorText(e, lang)))
      .finally(() => setLoading(false));
  }, [month, lang]);

  useEffect(() => {
    load();
  }, [load]);

  // TV mode: refresh every 60 s; elsewhere every 5 min so an open tab doesn't go stale.
  useEffect(() => {
    const id = window.setInterval(load, tv ? REFRESH_MS : 5 * REFRESH_MS);
    return () => window.clearInterval(id);
  }, [tv, load]);

  // Leave TV mode when the browser leaves full screen (Esc).
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setTv(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function enterTv() {
    setTv(true);
    window.setTimeout(() => {
      tvRef.current?.requestFullscreen?.().catch(() => {
        /* the overlay alone still fills the window */
      });
    }, 0);
  }

  function exitTv() {
    setTv(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  // The server decides what this role may see; the owner's "% only" switch hides more (e.g. for a shop TV).
  const percentOnly = data?.percentOnly === true || pctOnlyChoice;
  const showProfit = data?.showProfit === true && !pctOnlyChoice;
  const [y, m] = month.split("-").map(Number);
  const monthTitle = `${monthName(m - 1, lang)} ${y}`;

  const monthPct = data?.incomePct ?? null;
  const yearPct = data?.yearPct ?? pct(data?.yearActual, data?.yearTarget);
  const todayPct = data?.todayPct ?? null;
  const events = data?.events ?? { actual: 0, target: null };
  const bookings = data?.bookings ?? { actual: 0, target: null };
  const hit = data?.hitTarget === true || (monthPct !== null && monthPct >= 100);
  const kpiSize = tv ? "5rem" : "3rem";

  const aheadChip = data?.aheadStatus && (
    <Chip
      sx={{
        fontSize: tv ? "1.3rem" : "1rem",
        height: "auto",
        py: 0.75,
        fontWeight: 600,
        bgcolor: data.aheadStatus === "behind" ? tokens.color.warningTint : tokens.color.goodTint,
        color: data.aheadStatus === "behind" ? tokens.color.warning : tokens.color.good,
        "& .MuiChip-label": { whiteSpace: "normal" },
      }}
      label={
        data.aheadStatus === "ahead"
          ? L("సంవత్సర plan కంటే ముందున్నాం", "Ahead of the year plan") +
            (!percentOnly && typeof data.aheadOrBehind === "number" ? ` · +₹${formatIndian(data.aheadOrBehind)}` : "")
          : data.aheadStatus === "behind"
            ? L("సంవత్సర plan కంటే వెనకబడ్డాం", "Behind the year plan") +
              (!percentOnly && typeof data.aheadOrBehind === "number" ? ` · ₹${formatIndian(Math.abs(data.aheadOrBehind))}` : "")
            : L("సంవత్సర plan ప్రకారమే ఉన్నాం", "On the year plan")
      }
    />
  );

  const board = data && (
    <Box sx={{ display: "grid", gap: tv ? 3 : 2 }}>
      <Box sx={{ position: "relative" }}>
        <Metric
          lead
          tv={tv}
          label={L(`${monthTitle} అమ్మకాలు`, `${monthTitle} sales`)}
          actual={data.monthActual}
          target={data.monthTarget}
          percent={monthPct}
          money
          percentOnly={percentOnly}
          emptyText={L("ఈ నెలకి లక్ష్యం పెట్టలేదు", "No target set for this month")}
          badge={
            data.monthCalcMode ? (
              <CalcModeChip
                meta={{ ...AUTO_META, calcMode: data.monthCalcMode, autoValue: data.monthAutoValue ?? null }}
                value={data.monthTarget ?? 0}
                format={(n) => (percentOnly || data.monthTarget === null ? "—" : `₹${formatIndian(n)}`)}
              />
            ) : undefined
          }
        />
        <Celebrate active={hit} size={tv ? 280 : 200} />
      </Box>

      <Paper sx={{ ...kpiCardSx(hit ? "good" : "warning"), p: tv ? 4 : 2.5 }}>
        {hit ? (
          <Typography variant="h4" component="p" sx={{ fontSize: tv ? "3.2rem" : "2rem", color: tokens.color.good }}>
            <EmojiEventsIcon fontSize="inherit" sx={{ mr: 0.75, verticalAlign: "-0.15em" }} />{L("ఈ నెల లక్ష్యం పూర్తి! అభినందనలు", "This month's target is done! Well done")}
          </Typography>
        ) : (
          <Box sx={{ display: "flex", gap: tv ? 6 : 4, flexWrap: "wrap", alignItems: "baseline" }}>
            {!percentOnly && typeof data.dailyNeeded === "number" && data.daysLeft > 0 && (
              <Box>
                <Typography variant="section" component="h2" sx={{ fontSize: tv ? "1.7rem" : "1.1rem" }}>
                  {L("లక్ష్యం చేరాలంటే", "To reach the target")}
                </Typography>
                <Typography variant="kpi" component="p" sx={{ fontFamily: tokens.font.heading, fontSize: kpiSize }}>
                  {L("రోజుకి ఇంకా ", "")}
                  <CountUp value={data.dailyNeeded} format={(n) => `₹${formatIndian(n)}`} />
                  {L(" కావాలి", " more per day")}
                </Typography>
              </Box>
            )}
            <Box>
              <Typography variant="section" component="h2" sx={{ fontSize: tv ? "1.7rem" : "1.1rem" }}>
                {L("మిగిలిన రోజులు", "Days left")}
              </Typography>
              <Typography variant="kpi" component="p" sx={{ fontFamily: tokens.font.heading, fontSize: kpiSize }}>
                <CountUp value={data.daysLeft} />{" "}
                <Box component="span" sx={{ fontSize: "0.45em" }}>
                  {L("రోజులు", "days")}
                </Box>
              </Typography>
            </Box>
          </Box>
        )}
        {aheadChip && <Box sx={{ mt: 2 }}>{aheadChip}</Box>}
      </Paper>

      <Box sx={{ display: "grid", gap: tv ? 3 : 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
        {(todayPct !== null || typeof data.todayTarget === "number") && (
          <Metric
            tv={tv}
            label={L("ఈరోజు అమ్మకాలు", "Today's sales")}
            actual={data.todayActual ?? null}
            target={data.todayTarget ?? null}
            percent={todayPct}
            money
            percentOnly={percentOnly}
          />
        )}
        <Metric
          tv={tv}
          label={L(`${y} సంవత్సర అమ్మకాలు`, `${y} year sales`)}
          actual={data.yearActual}
          target={data.yearTarget}
          percent={yearPct}
          money
          percentOnly={percentOnly}
        />
        <Metric
          tv={tv}
          label={L("Events (ఈ నెల)", "Events (this month)")}
          actual={events.actual}
          target={events.target}
          percent={pct(events.actual, events.target)}
          money={false}
          percentOnly={percentOnly}
          emptyText={L(`ఈ నెల ${events.actual} events`, `${events.actual} events this month`)}
        />
        <Metric
          tv={tv}
          label={L("కొత్త బుకింగ్‌లు (ఈ నెల)", "New bookings (this month)")}
          actual={bookings.actual}
          target={bookings.target}
          percent={pct(bookings.actual, bookings.target)}
          money={false}
          percentOnly={percentOnly}
          emptyText={L(`ఈ నెల ${bookings.actual} బుకింగ్‌లు`, `${bookings.actual} bookings this month`)}
        />
        {showProfit && (
          <Metric
            tv={tv}
            label={L("లాభం (ఈ నెల) — మీకు మాత్రమే", "Profit (this month) — only you see this")}
            actual={data.profitActual}
            target={data.profitTarget}
            percent={data.profitPct ?? null}
            money
            percentOnly={false}
          />
        )}
      </Box>
    </Box>
  );

  const controls = (
    <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
      {role === "admin" && (
        <FormControlLabel
          sx={{ color: "inherit" }}
          control={<Switch checked={pctOnlyChoice} onChange={(e) => setPctOnlyChoice(e.target.checked)} color="warning" />}
          label={L("% మాత్రమే చూపించు", "% only")}
        />
      )}
      <Button variant="contained" color="inherit" sx={{ color: tokens.color.text }} startIcon={<RefreshIcon />} onClick={load} disabled={loading}>
        {L("Refresh", "Refresh")}
      </Button>
      {tv ? (
        <Button variant="contained" color="inherit" sx={{ color: tokens.color.text }} startIcon={<CloseIcon />} onClick={exitTv}>
          {L("TV mode ఆపు", "Exit TV mode")}
        </Button>
      ) : (
        <Button variant="contained" color="inherit" sx={{ color: tokens.color.text }} startIcon={<TvIcon />} onClick={enterTv}>
          {L("TV mode", "TV mode")}
        </Button>
      )}
      {!tv && can.dashboardShortcut(role) && (
        <Button variant="outlined" sx={{ color: "inherit", borderColor: "currentColor" }} startIcon={<DashboardIcon />} onClick={() => navigate("/dashboard")}>
          {L("డ్యాష్‌బోర్డ్", "Dashboard")}
        </Button>
      )}
    </Box>
  );

  // Festive header in the logo colours (green → gold).
  const header = (
    <Paper
      sx={{
        p: tv ? 4 : { xs: 2, md: 3 },
        mb: tv ? 3 : 2,
        color: "#FFFFFF",
        borderRadius: `${tokens.radius.lg}px`,
        background: `linear-gradient(120deg, ${tokens.color.greenDark} 0%, ${tokens.color.green} 55%, ${tokens.color.gold} 130%)`,
        borderBottom: `4px solid ${tokens.color.gold}`,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 2,
        flexWrap: "wrap",
      }}
    >
      <Box>
        <Typography variant="h3" component="h1" sx={{ fontFamily: tokens.font.heading, color: "inherit", fontSize: tv ? { xs: "2.2rem", md: "3.4rem" } : { xs: "1.9rem", md: "2.4rem" } }}>
          {L("లక్ష్య బోర్డు", "Target board")}
        </Typography>
        <Typography sx={{ color: "inherit", opacity: 0.92, fontSize: tv ? "1.5rem" : "1.05rem" }}>
          {L(`${monthTitle} — మనం ఎంత దగ్గరలో ఉన్నాం`, `${monthTitle} — how close we are`)}
        </Typography>
      </Box>
      {controls}
    </Paper>
  );

  const footer = (
    <Typography variant="body2" color="text.secondary" sx={{ mt: 2, fontSize: tv ? "1.15rem" : undefined }}>
      {updatedAt &&
        L(
          `చివరి update: ${updatedAt.toLocaleTimeString("te-IN", { hour: "2-digit", minute: "2-digit" })}`,
          `Last update: ${updatedAt.toLocaleTimeString(dateLocale(lang), { hour: "2-digit", minute: "2-digit" })}`,
        )}
      {tv && L(" · ప్రతి నిమిషం దానంతట అదే తాజా అవుతుంది", " · refreshes every minute")}
      {data?.percentOnly && role !== "admin" && L(" · ₹ అంకెలు యజమాని మాత్రమే చూస్తారు; మీకు % కనిపిస్తుంది", " · ₹ figures are for the owner; you see percentages")}
    </Typography>
  );

  const body = (
    <>
      {error && (
        <Alert
          severity="info"
          sx={{ mb: 2 }}
          action={
            role === "admin" ? (
              <Button color="inherit" size="small" startIcon={<FlagIcon />} onClick={() => navigate("/targets")}>
                {L("సంవత్సర లక్ష్యం పెట్టు", "Set year target")}
              </Button>
            ) : undefined
          }
        >
          {error}
        </Alert>
      )}
      {!data && loading && (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 6 }}>
          <CircularProgress />
        </Box>
      )}
      {board}
      {footer}
    </>
  );

  if (tv) {
    return (
      <Box ref={tvRef} sx={{ position: "fixed", inset: 0, zIndex: 1400, bgcolor: tokens.color.canvas, overflow: "auto", p: { xs: 2, md: 5 } }}>
        {header}
        {body}
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200 }}>
      {header}
      {body}
    </Box>
  );
}
