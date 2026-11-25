import { useEffect, useState } from "react";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import type { Role } from "../../auth/roles";
import type { Booking } from "../../data/bookingRepository";
import { cancelInfo } from "../../data/cancel";
import { CANCEL_REASON_LABEL, type CancelReasonCode, type PaymentMethod } from "../../data/functions";
import { istDay } from "../../util/dates";

/** Round 9 helpers shared by BookingCancel, the bookings list and the cancellations page (no components here). */

export const METHOD_LABEL: Record<PaymentMethod, { te: string; en: string }> = {
  Cash: { te: "నగదు", en: "Cash" },
  UPI: { te: "UPI", en: "UPI" },
  BankTransfer: { te: "బ్యాంక్ ట్రాన్స్‌ఫర్", en: "Bank transfer" },
  Card: { te: "కార్డ్", en: "Card" },
  Other: { te: "ఇతర", en: "Other" },
};

/** Reason chip text for a stored code (falls back to the server's Telugu label). */
export function reasonLabel(code: string, reasonTe: string, L: (te: string, en: string) => string): string {
  const l = CANCEL_REASON_LABEL[code as CancelReasonCode];
  return l ? L(l.te, l.en) : reasonTe || code || L("ఇతర", "Other");
}

export function methodLabel(m: string, L: (te: string, en: string) => string): string {
  const l = METHOD_LABEL[m as PaymentMethod];
  return l ? L(l.te, l.en) : m;
}

export function waLink(phone: string, text: string): string {
  const digits = phone.replace(/\D/g, "");
  const to = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

export async function customerPhone(customerId: string): Promise<string> {
  if (!customerId) return "";
  try {
    const snap = await getDoc(doc(db, "customers", customerId));
    const p = snap.data()?.phone;
    return typeof p === "string" ? p : "";
  } catch {
    return "";
  }
}

const VOID = new Set(["Cancelled", "Void"]);

/**
 * What the customer has paid on this booking's live invoices (display only — the server re-reads it inside
 * the cancel transaction). Managers query with their branch so the rules can allow the read.
 */
export function useBookingPaid(booking: Booking, role: Role, enabled: boolean): { paid: number | null; failed: boolean } {
  const [state, setState] = useState<{ paid: number | null; failed: boolean }>({ paid: null, failed: false });
  useEffect(() => {
    if (!enabled) return undefined;
    const filters =
      role === "admin" || !booking.branchId
        ? [where("bookingId", "==", booking.id)]
        : [where("branchId", "==", booking.branchId), where("bookingId", "==", booking.id)];
    return onSnapshot(
      query(collection(db, "invoices"), ...filters),
      (snap) => {
        let paise = 0;
        for (const d of snap.docs) {
          const x = d.data();
          if (VOID.has(String(x.status ?? ""))) continue;
          const p = typeof x.amountPaid === "number" && Number.isFinite(x.amountPaid) ? x.amountPaid : 0;
          paise += Math.round(Math.max(0, p) * 100);
        }
        setState({ paid: paise / 100, failed: false });
      },
      () => setState({ paid: null, failed: true }),
    );
  }, [enabled, booking.id, booking.branchId, role]);
  return state;
}

/**
 * Booking detail "అడ్వాన్స్": Σ non-cancelled payments on the booking's invoices (refunds are stored negative),
 * as recorded by the server. Old records with no invoice fall back to the legacy `advancePaid` field; staff (who
 * cannot read money documents) also see the legacy field. null = still loading.
 */
export function useBookingAdvance(booking: Booking, role: Role): number | null {
  const staff = role === "staff";
  const [invoiceIds, setInvoiceIds] = useState<string[] | null>(null);
  const [byInvoice, setByInvoice] = useState<Record<string, number>>({});
  const byBranch = role !== "admin" && !!booking.branchId;

  useEffect(() => {
    if (staff) return undefined;
    const filters = byBranch
      ? [where("branchId", "==", booking.branchId), where("bookingId", "==", booking.id)]
      : [where("bookingId", "==", booking.id)];
    return onSnapshot(
      query(collection(db, "invoices"), ...filters),
      (snap) => setInvoiceIds(snap.docs.map((d) => d.id).sort()),
      () => setInvoiceIds([]),
    );
  }, [staff, byBranch, booking.id, booking.branchId]);

  const key = invoiceIds ? invoiceIds.join(",") : "";
  useEffect(() => {
    if (staff || !key) return undefined;
    const unsubs = key.split(",").map((id) =>
      onSnapshot(
        query(collection(db, "invoices", id, "payments"), ...(byBranch ? [where("branchId", "==", booking.branchId)] : [])),
        (snap) => {
          let paise = 0;
          for (const d of snap.docs) {
            const x = d.data();
            if (cancelInfo(x).cancelled) continue;
            const a = typeof x.amount === "number" && Number.isFinite(x.amount) ? x.amount : 0;
            paise += Math.round(a * 100);
          }
          setByInvoice((prev) => ({ ...prev, [id]: paise }));
        },
        () => setByInvoice((prev) => ({ ...prev, [id]: 0 })),
      ),
    );
    return () => unsubs.forEach((u) => u());
  }, [staff, key, byBranch, booking.branchId]);

  if (staff) return booking.advancePaid;
  if (invoiceIds === null) return null;
  if (invoiceIds.length === 0) return booking.advancePaid;
  if (!invoiceIds.every((id) => id in byInvoice)) return null;
  return invoiceIds.reduce((a, id) => a + byInvoice[id], 0) / 100;
}

/** Can the owner reopen it? (server: event day today or later) */
export function canRestore(booking: Booking): boolean {
  if (booking.status !== "Cancelled" || !booking.eventDate) return false;
  return istDay(booking.eventDate) >= istDay();
}

