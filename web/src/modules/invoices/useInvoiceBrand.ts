import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";

/**
 * Module 6a — the brand an invoice is printed under: the booking's own brand, else the branch's first brand (the same
 * rule as the allergen sheet). Returns the brand's invoice name and logo (either may be empty), or null when no brand
 * is found — the document then uses the business settings as before.
 */
export function useInvoiceBrand(bookingId: string, branchId: string): { name: string; logoUrl: string } | null {
  const [bookingBrand, setBookingBrand] = useState("");
  const [firstBrand, setFirstBrand] = useState("");
  const [brand, setBrand] = useState<{ name: string; logoUrl: string } | null>(null);
  useEffect(() => {
    setBookingBrand("");
    if (!bookingId) return;
    return onSnapshot(doc(db, "bookings", bookingId), (s) => setBookingBrand(typeof s.data()?.brandId === "string" ? (s.data()?.brandId as string) : ""), () => undefined);
  }, [bookingId]);
  useEffect(() => {
    setFirstBrand("");
    if (!branchId) return;
    return onSnapshot(doc(db, "branches", branchId), (s) => setFirstBrand(Array.isArray(s.data()?.brandIds) ? String((s.data()?.brandIds as unknown[])[0] ?? "") : ""), () => undefined);
  }, [branchId]);
  const brandId = bookingBrand || firstBrand;
  useEffect(() => {
    setBrand(null);
    if (!brandId) return;
    return onSnapshot(
      doc(db, "brands", brandId),
      (s) => {
        const d = s.data();
        if (!d) return;
        const name = String(d.invoiceDisplayName ?? d.name ?? "").trim();
        setBrand({ name, logoUrl: typeof d.logoUrl === "string" ? d.logoUrl : "" });
      },
      () => undefined,
    );
  }, [brandId]);
  return brand;
}
