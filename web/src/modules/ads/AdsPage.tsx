import { useEffect, useMemo, useState } from "react";
import { Box, Button, Chip, MenuItem, Paper, TextField, Typography } from "@mui/material";
import { useSession } from "../../auth/AuthProvider";
import { useBranch } from "../../session/BranchContext";
import { useLang } from "../../i18n/LanguageContext";
import { AD_PLATFORMS, addAdSpend, adsResult, subscribeAdSpend, type AdSpend } from "../../data/adSpendRepository";
import { DataTable } from "../../components/DataTable";
import { BandChip, ErrorBox, parseMoney, parseWhole, rupees, rupees2, ScreenTitle } from "../../components/ui";
import { formatDay, istDay, istMonth } from "../../util/dates";
import { allOf, refreshFromServer } from "../../data/refresh";

type Range = "month" | "3m" | "all";

function monthsBack(n: number): string {
  const [y, m] = istMonth().split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - n, 1));
  return d.toISOString().slice(0, 7);
}

interface Group {
  key: string;
  label: string;
  spend: number;
  leads: number;
  bookings: number;
  revenue: number;
}

function groupBy(rows: AdSpend[], keyOf: (r: AdSpend) => string, labelOf: (k: string) => string): Group[] {
  const map = new Map<string, Group>();
  for (const r of rows) {
    const k = keyOf(r);
    const g = map.get(k) ?? { key: k, label: labelOf(k), spend: 0, leads: 0, bookings: 0, revenue: 0 };
    g.spend += r.amount;
    g.leads += r.leads;
    g.bookings += r.bookings;
    g.revenue += r.revenue;
    map.set(k, g);
  }
  return [...map.values()].sort((a, b) => b.spend - a.spend);
}

export function AdsPage() {
  const { L, lang } = useLang();
  const session = useSession();
  const { currentBranchId } = useBranch();
  const uid = session.status === "loggedIn" ? session.profile.uid : "";
  const [rows, setRows] = useState<AdSpend[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("month");

  const [date, setDate] = useState(istDay());
  const [platform, setPlatform] = useState<string>("instagram");
  const [campaign, setCampaign] = useState("");
  const [amount, setAmount] = useState("");
  const [leads, setLeads] = useState("");
  const [bookings, setBookings] = useState("");
  const [revenue, setRevenue] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => subscribeAdSpend(setRows, (e) => setError(e.message)), []);

  const inRange = useMemo(() => {
    if (range === "all") return rows;
    const from = range === "month" ? istMonth() : monthsBack(2);
    return rows.filter((r) => r.date.slice(0, 7) >= from);
  }, [rows, range]);

  const platformLabel = (k: string) => (k === "other" ? L("ఇతర", "Other") : k.charAt(0).toUpperCase() + k.slice(1));
  const byPlatform = groupBy(inRange, (r) => r.platform, platformLabel);
  const byCampaign = groupBy(inRange, (r) => `${r.platform}|${r.campaign || "—"}`, (k) => {
    const [p, c] = k.split("|");
    return `${platformLabel(p)} · ${c}`;
  });

  async function add() {
    setFormError(null);
    const amt = parseMoney(amount);
    const nLeads = parseWhole(leads) ?? 0;
    const nBookings = parseWhole(bookings) ?? 0;
    const rev = parseMoney(revenue) ?? 0;
    if (amt === null || Number.isNaN(amt) || amt <= 0) {
      setFormError(L("ఖర్చు మొత్తం సరిగా ఇవ్వండి.", "Enter the amount spent."));
      return;
    }
    if (Number.isNaN(nLeads) || Number.isNaN(nBookings) || nLeads < 0 || nBookings < 0) {
      setFormError(L("Leads, bookings పూర్ణ సంఖ్యలు.", "Leads and bookings must be whole numbers."));
      return;
    }
    if (Number.isNaN(rev)) {
      setFormError(L("ఆదాయం సరిగా లేదు.", "Revenue is not valid."));
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setFormError(L("తేదీ ఇవ్వండి.", "Choose a date."));
      return;
    }
    setSaving(true);
    try {
      await addAdSpend({ date, platform, campaign, amount: amt, leads: nLeads, bookings: nBookings, revenue: rev }, uid, currentBranchId);
      setAmount("");
      setLeads("");
      setBookings("");
      setRevenue("");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const groupColumns = (first: string) => [
    { label: first, render: (g: Group) => g.label },
    { label: L("ఖర్చు", "Spend"), align: "right" as const, render: (g: Group) => rupees(g.spend) },
    { label: "Leads", align: "right" as const, hideOnMobile: true, render: (g: Group) => g.leads },
    { label: L("బుకింగ్‌లు", "Bookings"), align: "right" as const, render: (g: Group) => g.bookings },
    { label: L("ఆదాయం", "Revenue"), align: "right" as const, hideOnMobile: true, render: (g: Group) => rupees(g.revenue) },
    {
      label: "ROAS",
      align: "right" as const,
      render: (g: Group) => {
        const r = adsResult(g.spend, g.revenue, g.bookings);
        return r.roas === null ? "—" : `${r.roas}×`;
      },
    },
    {
      label: L("ఒక బుకింగ్‌కి ఖర్చు", "Cost / booking"),
      align: "right" as const,
      render: (g: Group) => {
        const r = adsResult(g.spend, g.revenue, g.bookings);
        return r.costPerBooking === null ? "—" : rupees2(r.costPerBooking);
      },
    },
    { label: L("ఫలితం", "Result"), render: (g: Group) => <BandChip band={adsResult(g.spend, g.revenue, g.bookings).band} /> },
  ];

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <ScreenTitle
        title={L("ప్రకటనల ఖర్చు", "Ads spend")}
        subtitle={L(
          "ROAS = ఆదాయం ÷ ఖర్చు. 3× పైన బాగుంది, 1× లోపు నష్టం.",
          "ROAS = revenue ÷ spend. Above 3× is good; below 1× loses money.",
        )}
        onRefresh={() => refreshFromServer(allOf("adSpend"))}
      />
      <ErrorBox message={error} />

      <Paper sx={{ p: 2.5, mb: 3 }}>
        <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
          {L("ఖర్చు నమోదు", "Add spend")}
        </Typography>
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" } }}>
          <TextField type="date" label={L("తేదీ", "Date")} value={date} onChange={(e) => setDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField select label={L("ఎక్కడ", "Platform")} value={platform} onChange={(e) => setPlatform(e.target.value)}>
            {AD_PLATFORMS.map((p) => (
              <MenuItem key={p} value={p}>
                {platformLabel(p)}
              </MenuItem>
            ))}
          </TextField>
          <TextField label={L("Campaign పేరు", "Campaign")} value={campaign} onChange={(e) => setCampaign(e.target.value)} />
          <TextField label={L("ఖర్చు (₹)", "Spend (₹)")} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" required />
          <TextField label="Leads" value={leads} onChange={(e) => setLeads(e.target.value)} inputMode="numeric" />
          <TextField label={L("బుకింగ్‌లు", "Bookings")} value={bookings} onChange={(e) => setBookings(e.target.value)} inputMode="numeric" />
          <TextField label={L("వాటి నుండి ఆదాయం (₹)", "Revenue from them (₹)")} value={revenue} onChange={(e) => setRevenue(e.target.value)} inputMode="decimal" />
          <Button variant="contained" onClick={add} disabled={saving} sx={{ alignSelf: "center" }}>
            {saving ? L("Save…", "Saving…") : L("చేర్చు", "Add")}
          </Button>
        </Box>
        <ErrorBox message={formError} />
      </Paper>

      <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
        {(
          [
            ["month", L("ఈ నెల", "This month")],
            ["3m", L("3 నెలలు", "3 months")],
            ["all", L("అన్నీ", "All")],
          ] as const
        ).map(([id, label]) => (
          <Chip
            key={id}
            clickable
            label={label}
            onClick={() => setRange(id)}
            color={range === id ? "primary" : "default"}
            variant={range === id ? "filled" : "outlined"}
            sx={{ minHeight: 44 }}
          />
        ))}
      </Box>

      <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
        {L("Platform వారీగా", "By platform")}
      </Typography>
      <DataTable rows={byPlatform} rowKey={(g) => g.key} columns={groupColumns(L("Platform", "Platform"))} emptyText={L("ఈ కాలంలో ఖర్చు లేదు.", "No spend in this period.")} />

      <Typography variant="h6" component="h2" sx={{ mt: 3, mb: 1 }}>
        {L("Campaign వారీగా", "By campaign")}
      </Typography>
      <DataTable rows={byCampaign} rowKey={(g) => g.key} columns={groupColumns(L("Campaign", "Campaign"))} emptyText={L("ఈ కాలంలో ఖర్చు లేదు.", "No spend in this period.")} />

      <Typography variant="h6" component="h2" sx={{ mt: 3, mb: 1 }}>
        {L("నమోదులు", "Entries")}
      </Typography>
      <DataTable
        rows={inRange}
        rowKey={(r) => r.id}
        emptyText={L("నమోదులు లేవు.", "No entries.")}
        columns={[
          { label: L("తేదీ", "Date"), render: (r) => formatDay(r.date, lang) },
          { label: "Platform", render: (r) => platformLabel(r.platform) },
          { label: "Campaign", render: (r) => r.campaign || "—" },
          { label: L("ఖర్చు", "Spend"), align: "right", render: (r) => rupees2(r.amount) },
          { label: L("బుకింగ్‌లు", "Bookings"), align: "right", hideOnMobile: true, render: (r) => r.bookings },
          { label: L("ఆదాయం", "Revenue"), align: "right", hideOnMobile: true, render: (r) => rupees2(r.revenue) },
          { label: L("ఎలా వచ్చింది", "Source"), hideOnMobile: true, render: (r) => (r.source === "manual" ? L("చేతితో", "Manual") : r.source) },
        ]}
      />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        {L(
          "ఈ పేజీలో ROAS చూపించడానికి మాత్రమే; P&L లో ప్రకటనల ఖర్చు server లెక్కిస్తుంది.",
          "ROAS here is for display; ad costs in P&L are totalled by the server.",
        )}
      </Typography>
    </Box>
  );
}
