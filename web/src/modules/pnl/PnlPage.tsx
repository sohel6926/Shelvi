import { useEffect, useState } from "react";
import { Box, Chip, CircularProgress, Paper, Typography } from "@mui/material";
import { OverheadSharePanel } from "./OverheadSharePanel";
import { BrandReportPanel } from "./BrandReportPanel";
import { useLang } from "../../i18n/LanguageContext";
import { errorText, getPnl, type Pnl, type PnlPeriod } from "../../data/functions";
import { CountUp, formatIndian } from "../../theme/motion";
import { kpiCardSx, tabularNums, tokens } from "../../theme/tokens";
import { BandChip, ErrorBox, rupees, ScreenTitle, type Band } from "../../components/ui";
import { formatMoney as rupees2 } from "../../util/format";
import { formatDay, istDay } from "../../util/dates";

const PERIODS: { id: PnlPeriod; te: string; en: string }[] = [
  { id: "day", te: "ఈరోజు", en: "Today" },
  { id: "week", te: "ఈ వారం", en: "This week" },
  { id: "month", te: "ఈ నెల", en: "This month" },
  { id: "3m", te: "3 నెలలు", en: "3 months" },
  { id: "6m", te: "6 నెలలు", en: "6 months" },
  { id: "12m", te: "12 నెలలు", en: "12 months" },
];


function marginBand(m: number | null): Band {
  if (m === null) return "none";
  return m >= 25 ? "good" : m >= 10 ? "warn" : "bad";
}

/** `range` is ISO instants for India-time boundaries, `end` exclusive (calc §9): show IST days. */
function rangeText(range: Pnl["range"], lang: "te" | "en"): string {
  const start = Date.parse(range?.start ?? "");
  const end = Date.parse(range?.end ?? "");
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "";
  const first = istDay(new Date(start));
  const last = istDay(new Date(end - 1));
  return first === last ? formatDay(first, lang) : `${formatDay(first, lang)} – ${formatDay(last, lang)}`;
}

/** Simple CSS bar chart: income and profit per label (no chart library). */
function Bars({ series }: { series: Pnl["series"] }) {
  const { L } = useLang();
  if (!series || series.length === 0) return null;
  const max = Math.max(1, ...series.map((s) => Math.max(Math.abs(s.income), Math.abs(s.profit))));
  const h = 160;
  return (
    <Paper sx={{ p: 2.5 }}>
      <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
        {L("ఆదాయం, లాభం — కాలం వారీగా", "Income and profit over time")}
      </Typography>
      <Box sx={{ display: "flex", gap: 2, mb: 1.5, fontSize: "0.875rem" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <Box sx={{ width: 12, height: 12, bgcolor: tokens.color.green, borderRadius: 0.5 }} /> {L("ఆదాయం", "Income")}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <Box sx={{ width: 12, height: 12, bgcolor: tokens.color.info, borderRadius: 0.5 }} /> {L("లాభం", "Profit")}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <Box sx={{ width: 12, height: 12, bgcolor: tokens.color.bad, borderRadius: 0.5 }} /> {L("నష్టం", "Loss")}
        </Box>
      </Box>
      <Box sx={{ overflowX: "auto" }}>
        <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1.5, minWidth: series.length * 56, height: h + 48 }}>
          {series.map((s) => {
            const ih = (Math.abs(s.income) / max) * h;
            const ph = (Math.abs(s.profit) / max) * h;
            return (
              <Box key={s.label} sx={{ flex: 1, minWidth: 44, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <Box sx={{ display: "flex", alignItems: "flex-end", gap: 0.5, height: h }}>
                  <Box
                    role="img"
                    aria-label={`${s.label}: ${L("ఆదాయం", "income")} ${rupees(s.income)}`}
                    title={rupees(s.income)}
                    sx={{ width: 16, height: Math.max(2, ih), bgcolor: tokens.color.green, borderRadius: "4px 4px 0 0" }}
                  />
                  <Box
                    role="img"
                    aria-label={`${s.label}: ${s.profit < 0 ? L("నష్టం", "loss") : L("లాభం", "profit")} ${rupees(Math.abs(s.profit))}`}
                    title={rupees(s.profit)}
                    sx={{
                      width: 16,
                      height: Math.max(2, ph),
                      bgcolor: s.profit < 0 ? tokens.color.bad : tokens.color.info,
                      borderRadius: "4px 4px 0 0",
                    }}
                  />
                </Box>
                <Typography variant="caption" sx={{ mt: 0.5, textAlign: "center", lineHeight: 1.3 }}>
                  {s.label}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </Box>
    </Paper>
  );
}

export function PnlPage() {
  const { L, lang } = useLang();
  const [period, setPeriod] = useState<PnlPeriod>("month");
  const [data, setData] = useState<Pnl | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    getPnl({ period })
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(errorText(e, lang)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [period, lang]);

  /** Header refresh: re-call getPnl for the chosen period. */
  async function refresh() {
    const d = await getPnl({ period });
    setData(d);
    setError(null);
  }

  const prime: { pct: number; band: Band } | null = data?.primeCost ?? null;
  const costs = data
    ? [
        { te: "ఆహారం / సరుకులు", en: "Food & groceries", amount: data.food },
        { te: "కూలీ / జీతాలు", en: "Labour & wages", amount: data.labour },
        { te: "ఇతర ఖర్చులు", en: "Other costs", amount: data.other },
        { te: "ప్రకటనలు", en: "Ads", amount: data.ads },
      ]
    : [];
  const totalCost = costs.reduce((a, c) => a + c.amount, 0);
  const loss = data ? data.profit < 0 : false;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100 }}>
      <ScreenTitle
        title={L("లాభ నష్టాలు", "Profit & loss")}
        subtitle={data ? rangeText(data.range, lang) : L("లెక్కలు server నుండి వస్తాయి", "Figures come from the server")}
        onRefresh={refresh}
      />

      <Box role="tablist" aria-label={L("కాలం", "Period")} sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 3 }}>
        {PERIODS.map((p) => (
          <Chip
            key={p.id}
            role="tab"
            aria-selected={period === p.id}
            clickable
            label={L(p.te, p.en)}
            color={period === p.id ? "primary" : "default"}
            variant={period === p.id ? "filled" : "outlined"}
            onClick={() => setPeriod(p.id)}
            sx={{ minHeight: 44, px: 1, fontSize: "1rem" }}
          />
        ))}
      </Box>

      <ErrorBox message={error} />
      {loading && !data && (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 6 }}>
          <CircularProgress />
        </Box>
      )}

      {data && (
        <Box sx={{ display: "grid", gap: 2, opacity: loading ? 0.6 : 1, transition: "opacity 150ms" }}>
          <Paper sx={kpiCardSx(loss ? "bad" : "good")}>
            <Typography variant="section" component="h2">
              {loss ? L("నష్టం", "Loss") : L("లాభం", "Profit")}
            </Typography>
            <Typography variant="kpi" component="p" sx={{ fontSize: "3rem", color: loss ? tokens.color.bad : tokens.color.good }}>
              {loss && "−"}
              <CountUp value={Math.abs(data.profit)} format={(n) => `₹${formatIndian(n)}`} />
            </Typography>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
              <Typography>
                {L("లాభ శాతం", "Margin")}: {data.marginPct === null ? "—" : `${data.marginPct}%`}
              </Typography>
              <BandChip band={marginBand(data.marginPct)} />
            </Box>
          </Paper>

          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
            <Paper sx={{ p: 2.5 }}>
              <Typography variant="h6" component="h2" sx={{ mb: 1.5 }}>
                {L("ఆదాయం vs ఖర్చులు", "Income vs costs")}
              </Typography>
              <Row label={L("ఆదాయం", "Income")} value={rupees2(data.income)} strong />
              {typeof data.eventRevenue === "number" && (
                <Box sx={{ pl: 2, mb: 1 }}>
                  <Row label={L("ఈవెంట్ల ఆదాయం", "Event revenue")} value={rupees2(data.eventRevenue)} />
                  {typeof data.cancellationCharges === "number" && (
                    <Row label={L("రద్దు చార్జీ (ఉంచుకున్నది)", "Cancellation charges (kept)")} value={rupees2(data.cancellationCharges)} />
                  )}
                </Box>
              )}
              {costs.map((c) => (
                <Box key={c.en} sx={{ mb: 1 }}>
                  <Row label={L(c.te, c.en)} value={rupees(c.amount)} />
                  <Box sx={{ height: 6, borderRadius: 3, bgcolor: tokens.color.track, overflow: "hidden" }} aria-hidden>
                    <Box
                      sx={{
                        height: "100%",
                        width: `${data.income > 0 ? Math.min(100, (c.amount / data.income) * 100) : 0}%`,
                        bgcolor: tokens.color.warning,
                      }}
                    />
                  </Box>
                </Box>
              ))}
              <Row label={L("మొత్తం ఖర్చులు", "Total costs")} value={rupees(totalCost)} strong />
            </Paper>

            <Paper sx={{ p: 2.5, display: "grid", gap: 2, alignContent: "start" }}>
              <Box>
                <Typography variant="section" component="h2">
                  {L("Prime cost (ఆహారం + కూలీ)", "Prime cost (food + labour)")}
                </Typography>
                <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                  <Typography variant="kpi" component="p" sx={{ fontSize: "2rem" }}>
                    {prime ? `${prime.pct}%` : "—"}
                  </Typography>
                  {prime && <BandChip band={prime.band} />}
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {L("ఆదాయంలో 60% లోపు ఉంటే బాగుంది, 65% దాటితే నష్టం దిశ.", "Under 60% of income is healthy; above 65% is a warning.")}
                </Typography>
              </Box>
              <Box>
                <Typography variant="section" component="h2">
                  {L("Break-even (నష్టం లేకుండా ఉండాలంటే కనీస ఆదాయం)", "Break-even (income needed to cover costs)")}
                </Typography>
                <Typography variant="kpi" component="p" sx={{ fontSize: "2rem" }}>
                  {data.breakEven === null ? "—" : rupees(data.breakEven)}
                </Typography>
                {data.breakEven === null ? (
                  <Typography variant="body2" sx={{ color: tokens.color.bad }}>
                    {L("ఇప్పటి ఖర్చులతో break-even కుదరదు — ఖర్చులు ఆదాయం కంటే ఎక్కువ.", "Can't break even at current costs — variable costs exceed income.")}
                  </Typography>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    {data.income >= data.breakEven
                      ? L("ఈ కాలంలో break-even దాటాం.", "Above break-even for this period.")
                      : L(`ఇంకా ${rupees(data.breakEven - data.income)} ఆదాయం కావాలి.`, `${rupees(data.breakEven - data.income)} more income needed.`)}
                  </Typography>
                )}
              </Box>
            </Paper>
          </Box>

          {(data.cancellations || typeof data.cancelLoss === "number") && (
            <Paper sx={{ p: 2.5 }}>
              <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
                {L("రద్దులు", "Cancellations")}
              </Typography>
              {data.cancellations && (
                <>
                  <Row label={L("రద్దైన ఆర్డర్లు", "Cancelled orders")} value={String(data.cancellations.count)} />
                  <Row label={L("తిరిగి ఇచ్చింది", "Refunded")} value={rupees2(data.cancellations.refunded)} />
                  <Row label={L("ఉంచుకున్నది (ఆదాయంలో కలిసింది)", "Kept (counted in income)")} value={rupees2(data.cancellations.kept)} />
                </>
              )}
              {typeof data.cancelLoss === "number" && (
                <Row label={L("రద్దైన event ఖర్చు (నష్టం)", "Cost of cancelled events (loss)")} value={rupees2(data.cancelLoss)} />
              )}
            </Paper>
          )}

          <Paper sx={{ p: 2.5 }}>
            <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
              {L("డబ్బు ఎక్కడ పోతోంది", "Where money leaks")}
            </Typography>
            {data.leaks.length === 0 ? (
              <Typography color="text.secondary">{L("ఈ కాలంలో పెద్ద నష్టాలు కనిపించలేదు.", "No major leaks found for this period.")}</Typography>
            ) : (
              <Box component="ol" sx={{ m: 0, pl: 3 }}>
                {[...data.leaks]
                  .sort((a, b) => b.amount - a.amount)
                  .map((leak, i) => (
                    <Box component="li" key={i} sx={{ py: 0.75 }}>
                      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
                        <span>{L(leak.te || leak.en, leak.en || leak.te)}</span>
                        <Box component="span" sx={{ ...tabularNums, fontWeight: 600, color: tokens.color.bad }}>
                          {rupees(leak.amount)}
                        </Box>
                      </Box>
                    </Box>
                  ))}
              </Box>
            )}
          </Paper>

          <Bars series={data.series} />
        </Box>
      )}
      <OverheadSharePanel />
      <BrandReportPanel />
    </Box>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", py: 0.5, gap: 2 }}>
      <Typography sx={{ fontWeight: strong ? 600 : 400 }}>{label}</Typography>
      <Typography sx={{ ...tabularNums, fontWeight: strong ? 600 : 400 }}>{value}</Typography>
    </Box>
  );
}
