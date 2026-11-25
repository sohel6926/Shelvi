import type { BookingStatus } from "../../data/bookingRepository";
import { hiIfOn, type Lang } from "../../i18n/LanguageContext";

const BOOKING_STATUS_LABEL: Record<BookingStatus, { te: string; en: string }> = {
  Inquiry: { te: "విచారణ", en: "Inquiry" },
  Confirmed: { te: "ఖరారు", en: "Confirmed" },
  InProgress: { te: "జరుగుతోంది", en: "In progress" },
  Completed: { te: "పూర్తి", en: "Completed" },
  Cancelled: { te: "రద్దు", en: "Cancelled" },
  Closed: { te: "ముగించాం (lock)", en: "Closed" },
};

/** Booking status in the UI language (Firestore stores the English label). */
export function bookingStatusLabel(status: BookingStatus, lang: Lang): string {
  const l = BOOKING_STATUS_LABEL[status];
  return l ? (lang === "te" ? l.te : hiIfOn(l.en)) : status;
}

/** Loosely mirrors ui/components/StatusColors.kt's meaning-driven palette (MUI's fixed chip color set, not exact hexes). */
export function statusColor(status: BookingStatus): "default" | "info" | "success" | "warning" | "error" {
  switch (status) {
    case "Inquiry":
      return "default";
    case "Confirmed":
      return "info";
    case "InProgress":
      return "warning";
    case "Completed":
      return "success";
    case "Cancelled":
      return "error";
    case "Closed":
      return "success";
    default:
      return "default";
  }
}
