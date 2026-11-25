import { useEffect, useState } from "react";
import { Chip } from "@mui/material";
import { subscribeCustomers } from "../data/customerRepository";
import { hiIfOn, useLang } from "../i18n/LanguageContext";

type ChipColor = "default" | "info" | "success" | "warning" | "error";

/** One colour map for every status word used by quotations, invoices, expenses and purchases. */
const STATUS_COLORS: Record<string, ChipColor> = {
  Draft: "default",
  Sent: "info",
  Accepted: "success",
  Rejected: "error",
  Expired: "warning",
  PartiallyPaid: "warning",
  "Partially Paid": "warning",
  Paid: "success",
  "Fully Paid": "success",
  Settled: "success",
  Overdue: "error",
  Unpaid: "error",
  "Advance Paid": "info",
  Cancelled: "default",
  Credit: "warning",
  // Round 7 (lower-case words used by outside orders, extras, complaints, sessions)
  ordered: "info",
  delivered: "warning",
  settled: "success",
  cancelled: "default",
  pending: "warning",
  approved: "success",
  rejected: "error",
  open: "error",
  "in-progress": "warning",
  resolved: "success",
  planned: "info",
  done: "success",
};

/** Telugu labels for the stored status words (Firestore keeps the English word). */
const STATUS_TE: Record<string, string> = {
  Draft: "చిత్తు",
  Sent: "పంపాం",
  Accepted: "ఒప్పుకున్నారు",
  Rejected: "తిరస్కరించారు",
  Expired: "గడువు ముగిసింది",
  PartiallyPaid: "కొంత చెల్లించారు",
  "Partially Paid": "కొంత చెల్లించారు",
  Paid: "చెల్లించారు",
  "Fully Paid": "పూర్తిగా చెల్లించారు",
  Settled: "సెటిల్ అయింది",
  Overdue: "గడువు దాటింది",
  Unpaid: "చెల్లించలేదు",
  "Advance Paid": "అడ్వాన్స్ ఇచ్చారు",
  Cancelled: "రద్దు",
  Credit: "అప్పు",
  ordered: "ఆర్డర్ ఇచ్చాం",
  delivered: "వచ్చింది",
  settled: "లెక్క తేలింది",
  cancelled: "రద్దు",
  pending: "ఆమోదం కావాలి",
  approved: "ఆమోదించారు",
  rejected: "తిరస్కరించారు",
  open: "తెరిచి ఉంది",
  "in-progress": "చూస్తున్నాం",
  resolved: "పరిష్కరించాం",
  planned: "ప్లాన్",
  done: "అయిపోయింది",
};

/** "PartiallyPaid" -> "Partially Paid" for display. */
function prettify(status: string): string {
  const s = status.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Status word in a given language (non-hook form, e.g. for history sentences). */
export function docStatusLabel(status: string, lang: "te" | "en"): string {
  return lang === "te" && STATUS_TE[status] ? STATUS_TE[status] : hiIfOn(prettify(status));
}

/** Status word in the UI language. */
export function useStatusLabel(): (status: string) => string {
  const { lang } = useLang();
  return (status) => (lang === "te" && STATUS_TE[status] ? STATUS_TE[status] : hiIfOn(prettify(status)));
}

export function StatusChip({ status }: { status: string }) {
  const label = useStatusLabel();
  if (!status) return null;
  return <Chip size="small" label={label(status)} color={STATUS_COLORS[status] ?? "default"} />;
}

/** Live id -> customer name map, for records that store only customerId (quotations, invoices). */
export function useCustomerNames(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(
    () =>
      subscribeCustomers((customers) => {
        const map: Record<string, string> = {};
        for (const c of customers) map[c.id] = c.name;
        setNames(map);
      }),
    [],
  );
  return names;
}
