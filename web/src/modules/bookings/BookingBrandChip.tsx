import { useEffect, useState } from "react";
import { Chip, MenuItem, TextField } from "@mui/material";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { useLang } from "../../i18n/LanguageContext";
import { errorText, setBookingBrand } from "../../data/functions";

/**
 * Module 5b — the brand a booking is sold under. Shown only when the booking's branch serves more than one brand
 * (with one brand there is nothing to choose). Owner / manager can change it until the booking is invoiced or
 * closed (the server checks — setBookingBrand). An old booking with no brand shows its branch's first brand.
 */
export function BookingBrandChip({ bookingId, branchId, canChange }: { bookingId: string; branchId: string; canChange: boolean }) {
  const { L, lang } = useLang();
  const [brandId, setBrandId] = useState("");
  const [served, setServed] = useState<string[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => onSnapshot(doc(db, "bookings", bookingId), (s) => setBrandId(typeof s.data()?.brandId === "string" ? (s.data()?.brandId as string) : ""), () => undefined), [bookingId]);
  useEffect(() => {
    if (!branchId) return;
    return onSnapshot(doc(db, "branches", branchId), (s) => setServed(Array.isArray(s.data()?.brandIds) ? (s.data()?.brandIds as string[]) : []), () => undefined);
  }, [branchId]);
  useEffect(
    () =>
      onSnapshot(
        collection(db, "brands"),
        (snap) => setNames(Object.fromEntries(snap.docs.filter((d) => d.data().status !== "archived").map((d) => [d.id, typeof d.data().name === "string" ? (d.data().name as string) : d.id]))),
        () => undefined,
      ),
    [],
  );

  const options = served.filter((id) => names[id]);
  if (options.length < 2) return null;
  const current = brandId || options[0];

  if (!canChange) return <Chip variant="outlined" label={names[current] ?? ""} />;
  return (
    <TextField
      select
      size="small"
      label={L("బ్రాండ్", "Brand")}
      value={current}
      disabled={busy}
      onChange={(e) => {
        const next = e.target.value;
        if (next === current) return;
        setBusy(true);
        setBookingBrand({ bookingId, brandId: next })
          .catch((err) => window.alert(errorText(err, lang)))
          .finally(() => setBusy(false));
      }}
      sx={{ minWidth: 170 }}
    >
      {options.map((id) => (
        <MenuItem key={id} value={id}>
          {names[id]}
        </MenuItem>
      ))}
    </TextField>
  );
}
