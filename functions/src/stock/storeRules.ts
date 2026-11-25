/**
 * Module 5c (19 Nov 2026) — stock by store (Master Data Freeze 01 §10–§14, F-05, F-09). Pure rules; tested in
 * test/module5c.test.ts.
 *
 * How it fits the stock the CRM already keeps: an inventory item still has ONE total (quantityInStock) that
 * purchases, events, packing and hand adjustments move exactly as before. Every item has a HOME store; the item
 * document also carries `storeQty` — what sits in each OTHER store. The home store holds whatever is not in another
 * store:  home = total − Σ storeQty.  So stock is always in some store (rule 1), a store balance is never typed
 * (rule 2 — it only changes through a movement), and nothing that already works had to change: a flow that does not
 * name a store moves the home store.
 * A transfer moves quantity between two stores of the same branch; the total does not change (rule 4: one Out and
 * one In movement are written).
 */
type AnyDoc = Record<string, unknown>;
const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export type StoreQty = Record<string, number>;

/** The map as stored: positive quantities only, never the home store. */
export function cleanStoreQty(raw: unknown, homeStoreId: string): StoreQty {
  const out: StoreQty = {};
  if (typeof raw !== "object" || raw === null) return out;
  for (const [k, v] of Object.entries(raw as AnyDoc)) {
    const q = r3(num(v));
    if (k && k !== homeStoreId && q > 0) out[k] = q;
  }
  return out;
}

/** Balance of every store that holds this item, the home store included (its balance can be 0 or, wrongly, negative). */
export function storeBalances(total: number, storeQty: StoreQty, homeStoreId: string): StoreQty {
  const others = cleanStoreQty(storeQty, homeStoreId);
  const elsewhere = Object.values(others).reduce((a, b) => a + b, 0);
  return homeStoreId ? { [homeStoreId]: r3(total - elsewhere), ...others } : others;
}
export const balanceIn = (total: number, storeQty: StoreQty, homeStoreId: string, storeId: string): number => storeBalances(total, storeQty, homeStoreId)[storeId] ?? 0;

/** The home store of an item: the one set on it, else the branch's main store, else the branch's first store. */
export function homeStoreOf(item: AnyDoc, branchStores: { id: string; data: AnyDoc }[]): string {
  const live = branchStores.filter((s) => s.data.status !== "archived");
  const set = typeof item.homeStoreId === "string" ? item.homeStoreId : "";
  if (set && live.some((s) => s.id === set)) return set;
  return (live.find((s) => s.data.storeType === "main" && s.data.status !== "inactive") ?? live.find((s) => s.data.status !== "inactive") ?? live[0])?.id ?? "";
}

export interface TransferInput {
  total: number;
  storeQty: StoreQty;
  homeStoreId: string;
  fromStoreId: string;
  toStoreId: string;
  quantity: number;
  itemBranchId: string;
  from?: AnyDoc;
  to?: AnyDoc;
  /** the owner may take stock out of a quarantine / scrap store (rules 7 and 9: an approved reversal) */
  isOwner: boolean;
}
export type TransferProblem = "" | "bad-quantity" | "same-store" | "no-store" | "other-branch" | "not-in-use" | "blocked" | "not-enough";

export function transferProblem(x: TransferInput): TransferProblem {
  if (!(x.quantity > 0) || !Number.isFinite(x.quantity)) return "bad-quantity";
  if (x.fromStoreId === x.toStoreId) return "same-store";
  if (!x.from || !x.to) return "no-store";
  if (x.from.branchId !== x.itemBranchId || x.to.branchId !== x.itemBranchId) return "other-branch";
  if (x.to.status === "archived" || x.to.status === "inactive" || x.from.status === "archived") return "not-in-use";
  if (x.from.issueBlocked === true && !x.isOwner) return "blocked";
  if (balanceIn(x.total, x.storeQty, x.homeStoreId, x.fromStoreId) + 1e-9 < x.quantity) return "not-enough";
  return "";
}

/** storeQty after `delta` is added to one store (negative = taken out). The home store is not in the map. */
export function afterStoreChange(storeQty: StoreQty, homeStoreId: string, storeId: string, delta: number): StoreQty {
  const out = cleanStoreQty(storeQty, homeStoreId);
  if (storeId === homeStoreId || !storeId) return out;
  const q = r3((out[storeId] ?? 0) + delta);
  if (q > 0) out[storeId] = q;
  else delete out[storeId];
  return out;
}

/** storeQty after a transfer; the total is untouched. */
export function afterTransfer(storeQty: StoreQty, homeStoreId: string, fromStoreId: string, toStoreId: string, quantity: number): StoreQty {
  return afterStoreChange(afterStoreChange(storeQty, homeStoreId, fromStoreId, -quantity), homeStoreId, toStoreId, quantity);
}

/**
 * Naming another store as home without moving anything: every store keeps the balance it had. The old home's
 * balance is written into the map and the new home's entry leaves it.
 */
export function rehome(total: number, storeQty: StoreQty, oldHome: string, newHome: string): StoreQty {
  const all = storeBalances(total, storeQty, oldHome);
  const out: StoreQty = {};
  for (const [k, v] of Object.entries(all)) if (k !== newHome && v > 0) out[k] = r3(v);
  return out;
}

export type ReceiveStoreProblem = "" | "no-store" | "other-branch" | "not-in-use" | "blocked";
/** Goods may be received into a store of the order's own branch that is in use and is not a quarantine / scrap (issue-blocked) store. */
export function receiveStoreProblem(store: AnyDoc | undefined, poBranchId: string): ReceiveStoreProblem {
  if (!store) return "no-store";
  if (store.branchId !== poBranchId) return "other-branch";
  if (store.status === "archived" || store.status === "inactive") return "not-in-use";
  if (store.issueBlocked === true) return "blocked";
  return "";
}
