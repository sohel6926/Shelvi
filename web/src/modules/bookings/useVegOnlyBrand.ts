import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";

/**
 * Module 6a — is the brand this booking is sold under veg only? The booking's own brand when it has one, else the
 * branch's first brand (the same rule the allergen sheet uses). Returns the brand's name, or "" when it is not veg only.
 */
export function useVegOnlyBrand(branchId: string | null, bookingId?: string): string {
  const [bookingBrand, setBookingBrand] = useState("");
  const [firstBrand, setFirstBrand] = useState("");
  const [vegOnlyName, setVegOnlyName] = useState("");
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
    setVegOnlyName("");
    if (!brandId) return;
    return onSnapshot(doc(db, "brands", brandId), (s) => setVegOnlyName(s.data()?.vegOnly === true ? String(s.data()?.name ?? "—") : ""), () => undefined);
  }, [brandId]);
  return vegOnlyName;
}
