/**
 * Module 6a (20 Nov 2026) — moving stock from one branch to another. Pure rules; tested in test/module6a.test.ts.
 * Stock items belong to ONE branch, so a transfer takes quantity out of the item in the sending branch and puts it
 * into the SAME item (same name and unit) of the receiving branch. Nothing is invented: if the receiving branch does
 * not have that item yet, the transfer is refused and the owner adds the item there first.
 */
type AnyDoc = Record<string, unknown>;

const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase().replace(/\s+/g, " ") : "");

/** The receiving branch's item that is the same as `source`: same name and same unit, not archived. */
export function matchItem(source: AnyDoc, candidates: { id: string; data: AnyDoc }[]): { id: string } | "none" | "many" {
  const hits = candidates.filter((c) => c.data.status !== "archived" && norm(c.data.name) === norm(source.name) && norm(c.data.unit) === norm(source.unit));
  return hits.length === 1 ? { id: hits[0].id } : hits.length === 0 ? "none" : "many";
}

export type BranchTransferProblem = "" | "bad-quantity" | "same-branch" | "tracks-expiry" | "no-match" | "many-match" | "not-enough";

export function branchTransferProblem(x: { quantity: number; fromBranchId: string; toBranchId: string; source: AnyDoc; match: ReturnType<typeof matchItem>; balance: number }): BranchTransferProblem {
  if (!(x.quantity > 0) || !Number.isFinite(x.quantity)) return "bad-quantity";
  if (!x.toBranchId || x.fromBranchId === x.toBranchId) return "same-branch";
  if (x.source.trackExpiry === true) return "tracks-expiry";
  if (x.match === "none") return "no-match";
  if (x.match === "many") return "many-match";
  if (x.balance + 1e-9 < x.quantity) return "not-enough";
  return "";
}

export const BRANCH_TRANSFER_TEXT: Record<Exclude<BranchTransferProblem, "">, { te: string; en: string }> = {
  "bad-quantity": { te: "పరిమాణం 0 కంటే ఎక్కువ ఉండాలి.", en: "The quantity must be more than 0." },
  "same-branch": { te: "వేరే శాఖను ఎంచుకోండి.", en: "Choose a different branch." },
  "tracks-expiry": { te: "గడువు తేదీ లెక్కించే వస్తువును శాఖల మధ్య బదిలీ చేయడం ఇంకా లేదు — చేతితో తీసి, అక్కడ గడువు తేదీతో చేర్చండి.", en: "Items that track expiry cannot be moved between branches yet — take it out here and add it there with its expiry date." },
  "no-match": { te: "ఆ శాఖలో ఇదే పేరు, ఇదే యూనిట్‌తో వస్తువు లేదు. ముందు అక్కడ ఆ వస్తువును చేర్చండి.", en: "The other branch has no item with this name and unit. Add the item there first." },
  "many-match": { te: "ఆ శాఖలో ఇదే పేరుతో ఒకటి కంటే ఎక్కువ వస్తువులు ఉన్నాయి. ఒక్కటే ఉంచండి.", en: "The other branch has more than one item with this name. Keep just one." },
  "not-enough": { te: "ఈ స్టోర్‌లో అంత నిల్వ లేదు.", en: "This store does not hold that much." },
};
