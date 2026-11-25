import { useEffect, useMemo, useState } from "react";
import { Box, MenuItem, TextField, Typography } from "@mui/material";
import { useSession } from "../../auth/AuthProvider";
import { useBranch } from "../../session/BranchContext";
import { useLang } from "../../i18n/LanguageContext";
import { bookingStatusLabel } from "../bookings/statusColor";
import { subscribeBookings, type Booking, type BookingStatus } from "../../data/bookingRepository";
import {
  expenseDate,
  subscribeExpenses,
  subscribeInvoices,
  subscribePurchases,
  type Expense,
  type Invoice,
  type Purchase,
} from "../../data/records";
import { DataTable, PageHeader, StatCard, StatRow } from "../../components/DataTable";
import { branchQuery, refreshFromServer } from "../../data/refresh";
import { formatINR, monthKey, monthLabel, sum } from "../../util/format";

/** Month summary: bookings, billing, spending. Figures are added up from saved records only. */
export function ReportsPage() {
  const session = useSession();
  const { L, lang } = useLang();
  const isAdmin = session.status === "loggedIn" && session.profile.role === "admin";
  const { currentBranchId } = useBranch();
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);

  useEffect(() => subscribeBookings(currentBranchId, setBookings), [currentBranchId]);
  useEffect(() => subscribeExpenses(currentBranchId, setExpenses), [currentBranchId]);
  useEffect(() => subscribePurchases(currentBranchId, setPurchases), [currentBranchId]);
  useEffect(() => {
    if (!isAdmin) return;
    return subscribeInvoices(currentBranchId, setInvoices);
  }, [currentBranchId, isAdmin]);

  const months = useMemo(() => {
    const keys = new Set<string>([monthKey(new Date())]);
    bookings.forEach((b) => keys.add(monthKey(b.eventDate)));
    expenses.forEach((e) => keys.add(monthKey(expenseDate(e))));
    purchases.forEach((p) => keys.add(monthKey(p.purchaseDate)));
    keys.delete("");
    return [...keys].sort().reverse();
  }, [bookings, expenses, purchases]);

  const m = {
    bookings: bookings.filter((b) => monthKey(b.eventDate) === month && !b.cancelled),
    invoices: invoices.filter((i) => monthKey(i.issueDate) === month),
    expenses: expenses.filter((e) => monthKey(expenseDate(e)) === month && !e.cancelled),
    purchases: purchases.filter((p) => monthKey(p.purchaseDate) === month && !p.cancelled),
  };

  const billed = sum(m.invoices, (i) => i.totalAmount);
  const received = sum(m.invoices, (i) => i.amountPaid);
  const spentExpenses = sum(m.expenses, (e) => e.totalAmount);
  const spentPurchases = sum(m.purchases, (p) => p.totalAmount);

  const statusRows = (["Inquiry", "Confirmed", "InProgress", "Completed", "Closed"] as BookingStatus[]).map((s) => {
    const list = m.bookings.filter((b) => b.status === s);
    return { status: s, count: list.length, guests: sum(list, (b) => b.guestCount), value: sum(list, (b) => b.totalAmount) };
  });

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <PageHeader
        title={L("రిపోర్టులు", "Reports")}
        onRefresh={() =>
          refreshFromServer(
            branchQuery("bookings", currentBranchId),
            branchQuery("expenses", currentBranchId),
            branchQuery("purchases", currentBranchId),
            ...(isAdmin ? [branchQuery("invoices", currentBranchId)] : []),
          )
        }
        action={
          <TextField select size="small" label={L("నెల", "Month")} value={month} onChange={(e) => setMonth(e.target.value)} sx={{ minWidth: 200 }}>
            {months.map((k) => (
              <MenuItem key={k} value={k}>
                {monthLabel(k, lang)}
              </MenuItem>
            ))}
          </TextField>
        }
      />
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
        {L(`${monthLabel(month, lang)} లో events`, `Events in ${monthLabel(month, lang)}`)}
      </Typography>
      <StatRow>
        <StatCard label={L("Events", "Events")} value={m.bookings.length} />
        <StatCard label={L("అతిథులు", "Guests")} value={sum(m.bookings, (b) => b.guestCount).toLocaleString("en-IN")} />
        <StatCard label={L("బుకింగ్ విలువ (అంచనా)", "Booking value (estimate)")} value={formatINR(sum(m.bookings, (b) => b.totalAmount))} />
        <StatCard label={L("అడ్వాన్స్ వచ్చింది", "Advance collected")} value={formatINR(sum(m.bookings, (b) => b.advancePaid))} tone="good" />
      </StatRow>
      <Box sx={{ mb: 3 }}>
        <DataTable
          rows={statusRows}
          rowKey={(r) => r.status}
          columns={[
            { label: L("స్థితి", "Status"), render: (r) => bookingStatusLabel(r.status, lang) },
            { label: L("Events", "Events"), align: "right", render: (r) => r.count },
            { label: L("అతిథులు", "Guests"), align: "right", render: (r) => r.guests.toLocaleString("en-IN") },
            { label: L("విలువ", "Value"), align: "right", render: (r) => formatINR(r.value) },
          ]}
        />
      </Box>

      {isAdmin && (
        <>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
            {L("బిల్లింగ్ (ఈ నెల ఇచ్చిన invoices)", "Billing (invoices issued this month)")}
          </Typography>
          <StatRow>
            <StatCard label={L("బిల్ చేసింది", "Billed")} value={formatINR(billed)} />
            <StatCard label={L("వచ్చింది", "Received")} value={formatINR(received)} tone="good" />
            <StatCard label={L("బాకీ", "Balance due")} value={formatINR(sum(m.invoices, (i) => i.balanceDue))} tone="warn" />
          </StatRow>
        </>
      )}

      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
        {L("ఖర్చులు", "Spending")}
      </Typography>
      <StatRow>
        <StatCard label={L("ఖర్చులు", "Expenses")} value={formatINR(spentExpenses)} />
        <StatCard label={L("కొనుగోళ్లు", "Purchases")} value={formatINR(spentPurchases)} />
        <StatCard label={L("మొత్తం ఖర్చు", "Total spent")} value={formatINR(spentExpenses + spentPurchases)} tone="warn" />
        {isAdmin && (
          <StatCard
            label={L("వచ్చింది − ఖర్చు", "Received − spent")}
            value={formatINR(received - spentExpenses - spentPurchases)}
            tone={received - spentExpenses - spentPurchases >= 0 ? "good" : "warn"}
          />
        )}
      </StatRow>
      <Typography variant="caption" color="text.secondary">
        {L(
          "“వచ్చింది − ఖర్చు” ఈ నెల నగదు చూపు మాత్రమే, లాభం కాదు. అసలు లాభం కోసం 'లాభ నష్టాలు' పేజీ చూడండి.",
          "“Received − spent” is a quick cash view for the month, not a profit statement — see Profit & loss for that.",
        )}
      </Typography>
    </Box>
  );
}
