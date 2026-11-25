import { addDoc, collection, onSnapshot, query, type DocumentData } from "firebase/firestore";
import { db } from "../firebase";
import { createStamp } from "./audit";

/** `adSpend/{id}` (docs/data-model.md). Admin enters spend by hand; an API agent may import later. */
export const AD_PLATFORMS = ["instagram", "facebook", "google", "youtube", "justdial", "other"] as const;
export type AdPlatform = (typeof AD_PLATFORMS)[number];

export interface AdSpend {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  platform: string;
  campaign: string;
  amount: number;
  leads: number;
  bookings: number;
  revenue: number;
  source: string;
}

export type AdSpendInput = Omit<AdSpend, "id" | "source">;

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function toAdSpend(id: string, d: DocumentData): AdSpend {
  return {
    id,
    date: str(d.date),
    platform: str(d.platform) || "other",
    campaign: str(d.campaign),
    amount: num(d.amount),
    leads: num(d.leads),
    bookings: num(d.bookings),
    revenue: num(d.revenue),
    source: str(d.source) || "manual",
  };
}

export function subscribeAdSpend(onData: (rows: AdSpend[]) => void, onError?: (e: Error) => void): () => void {
  return onSnapshot(
    query(collection(db, "adSpend")),
    (snap) => onData(snap.docs.map((d) => toAdSpend(d.id, d.data())).sort((a, b) => b.date.localeCompare(a.date))),
    (e) => onError?.(e),
  );
}

export async function addAdSpend(input: AdSpendInput, uid: string, branchId: string | null): Promise<void> {
  await addDoc(collection(db, "adSpend"), {
    ...input,
    campaign: input.campaign.trim(),
    source: "manual",
    branchId: branchId ?? "",
    ...createStamp(),
    createdBy: uid,
  });
}

export type Band = "good" | "warn" | "bad" | "none";

/**
 * Display-only copy of calc-spec §8 `adsResult` so the ads table can show ROAS and cost per
 * booking for any grouping. Nothing computed here is saved; dailyStats/monthlyStats on the server
 * remain the source of truth for ad spend in P&L.
 */
export function adsResult(spend: number, revenue: number, bookings: number): {
  roas: number | null;
  costPerBooking: number | null;
  band: Band;
} {
  if (spend <= 0) return { roas: null, costPerBooking: null, band: "none" };
  const round2 = (x: number) => Math.sign(x) * Math.round(Math.abs(x) * 100 + Number.EPSILON) / 100;
  const roas = round2(revenue / spend);
  return {
    roas,
    costPerBooking: bookings === 0 ? null : round2(spend / bookings),
    band: roas >= 3 ? "good" : roas >= 1 ? "warn" : "bad",
  };
}
