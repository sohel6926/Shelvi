/**
 * Module 4d (19 Nov 2026) — the 17 business roles of the spec (Implementation Freeze Pack, Part B "PRF", pages 11–13;
 * the text is kept in docs/spec/IMP-Part-B-roles-p11-13.txt). Pure rules, tested in test/module4d.test.ts.
 *
 * Two layers, on purpose:
 *  - `level` (admin / manager / staff) is the security level the Firestore rules and callables already enforce.
 *    Every business role sits on one level, so nothing that is protected today becomes weaker.
 *  - the business role then narrows what a person may do inside that level: which modules, which of the ten
 *    actions (B1), which sensitive figures they may see (B4), and the separation of duties (B5).
 * A hidden menu is not security (B1): the server checks `allowed()` too.
 */

export type Level = "admin" | "manager" | "staff";

/** B1 — permission actions. */
export const ACTIONS = { V: "View", C: "Create", E: "Edit", S: "Submit", X: "Verify", A: "Approve/Reject", P: "Pay/Post", R: "Reopen/Reverse", D: "Archive", O: "Export" } as const;
export type Action = keyof typeof ACTIONS;

/** B2 — the 17 frozen business roles. */
export const ROLES = [
  { code: "owner", level: "admin", te: "యజమాని / CEO", en: "Owner / CEO" },
  { code: "coo", level: "manager", te: "ఆపరేషన్స్ హెడ్ (COO)", en: "COO / Operations Head" },
  { code: "financeHead", level: "manager", te: "ఫైనాన్స్ హెడ్", en: "Finance Head" },
  { code: "accountant", level: "manager", te: "అకౌంటెంట్", en: "Accountant" },
  { code: "salesManager", level: "manager", te: "సేల్స్ మేనేజర్", en: "Sales Manager" },
  { code: "salesExecutive", level: "manager", te: "సేల్స్ ఎగ్జిక్యూటివ్", en: "Sales Executive" },
  { code: "purchaseManager", level: "manager", te: "కొనుగోలు మేనేజర్", en: "Purchase Manager" },
  { code: "storeManager", level: "manager", te: "స్టోర్ మేనేజర్", en: "Store Manager" },
  { code: "kitchenHead", level: "manager", te: "కిచెన్ హెడ్ / చెఫ్", en: "Kitchen Head / Chef" },
  { code: "eventManager", level: "manager", te: "ఈవెంట్ మేనేజర్", en: "Event Manager" },
  { code: "hrManager", level: "manager", te: "HR మేనేజర్", en: "HR Manager" },
  { code: "logisticsManager", level: "manager", te: "లాజిస్టిక్స్ మేనేజర్", en: "Logistics Manager" },
  { code: "worker", level: "staff", te: "సిబ్బంది", en: "Worker / Staff" },
  { code: "driver", level: "staff", te: "డ్రైవర్", en: "Driver" },
  { code: "marketing", level: "manager", te: "మార్కెటింగ్ / CRM", en: "Marketing / CRM" },
  { code: "systemAdmin", level: "manager", te: "సిస్టమ్ అడ్మిన్", en: "System Admin" },
  { code: "auditor", level: "staff", te: "ఆడిటర్ / చూసేవారు", en: "Auditor / Viewer" },
] as const;
export type RoleCode = (typeof ROLES)[number]["code"];

const BY_CODE = new Map<string, (typeof ROLES)[number]>(ROLES.map((r) => [r.code, r]));
export const isRoleCode = (v: unknown): v is RoleCode => typeof v === "string" && BY_CODE.has(v);
export const levelOf = (role: RoleCode): Level => BY_CODE.get(role)!.level;

/**
 * The business role a person works in. Until the owner gives someone a role, the old three levels keep working
 * exactly as before: admin = owner, manager = COO (all operations), staff = worker.
 */
export function effectiveRole(level: string, jobRole: unknown): RoleCode {
  if (level === "admin") return "owner"; // the owner's level is never narrowed by a job role
  if (isRoleCode(jobRole) && levelOf(jobRole) === level) return jobRole;
  return level === "manager" ? "coo" : "worker";
}

/** A role may be given only to a person whose security level matches (the level itself is changed elsewhere). */
export function canHoldRole(level: string, role: unknown): boolean {
  return isRoleCode(role) && role !== "owner" && levelOf(role) === level;
}

export const MODULES = [
  "leads", "customers", "quotations", "bookings", "events", "invoices", "receipts", "vendors", "purchaseRequests", "purchaseOrders", "goodsReceipts", "vendorBills",
  "expenses", "vendorPayments", "inventory", "recipes", "production", "staff", "attendance", "payroll", "vehicles", "equipment", "marketing", "ledger", "reports", "settings", "users", "audit",
] as const;
export type Module = (typeof MODULES)[number];

const ALL = "VCESXAPRDO";
/**
 * B3 — module permission matrix. Each entry: the actions a role has on a module (letters of B1). A module that is
 * not listed for a role is not available to it. The owner has everything.
 */
const MATRIX: Record<Exclude<RoleCode, "owner">, Partial<Record<Module, string>>> = {
  // Events, Kitchen, Store, Logistics, Closing: create / edit / verify operational; approve operational exceptions
  coo: {
    leads: "V", customers: "V", quotations: "V", bookings: "VCESX", events: "VCESXAR", purchaseRequests: "VCESA", purchaseOrders: "V", goodsReceipts: "VCESX", inventory: "VCESXA",
    recipes: "VCESX", production: "VCESXA", staff: "V", attendance: "VCEX", vehicles: "VCESXA", equipment: "VCESXA", expenses: "VCES", vendors: "V", reports: "V",
  },
  // Finance, customer credit, vendor payable, payroll totals: verify / approve / post within configured limits
  financeHead: {
    customers: "V", bookings: "V", invoices: "VCESXAPRO", receipts: "VCESXAPRO", vendors: "VE", purchaseOrders: "V", goodsReceipts: "V", vendorBills: "VXAR", expenses: "VXA",
    vendorPayments: "VCXAPR", payroll: "VXA", ledger: "VCEXAPRO", reports: "VO", audit: "V",
  },
  // Invoice, receipt, vendor bill, expense, reconciliation: create / edit / submit / verify; payment approval restricted
  accountant: {
    customers: "V", bookings: "V", invoices: "VCESX", receipts: "VCESX", vendors: "V", purchaseOrders: "V", goodsReceipts: "V", vendorBills: "VCESX", expenses: "VCESX",
    vendorPayments: "VCS", ledger: "VCES", reports: "V",
  },
  // Lead, customer, quote, booking: create / edit / approve normal commercial actions within limit
  salesManager: { leads: "VCESXADO", customers: "VCESDO", quotations: "VCESXA", bookings: "VCESXA", events: "V", invoices: "V", receipts: "VC", marketing: "V", reports: "V" },
  // Assigned lead / customer / quote / booking: create / edit / submit; no high discount approval; no detailed food cost
  salesExecutive: { leads: "VCES", customers: "VCES", quotations: "VCES", bookings: "VCES", events: "V", receipts: "VC" },
  // Demand view, vendor, RFQ, PO: create / edit / submit / approve within purchase limit; no payment
  purchaseManager: { purchaseRequests: "VCESXA", vendors: "VCESD", purchaseOrders: "VCESA", goodsReceipts: "V", vendorBills: "V", inventory: "V", recipes: "V", reports: "V" },
  // GRN, inventory, count, wastage: receive / issue / return / count / submit adjustments; approval by configured role
  storeManager: { purchaseRequests: "VCES", purchaseOrders: "V", goodsReceipts: "VCES", inventory: "VCES", vendors: "V", equipment: "V", reports: "V" },
  // Menu / recipe, demand, production: create / edit per scope; no customer finance
  kitchenHead: { recipes: "VCESX", production: "VCESX", purchaseRequests: "VCES", inventory: "V", events: "V", bookings: "V", attendance: "V" },
  // Assigned event / session, live ops: edit operations, submit extras / close; no unrelated events
  eventManager: { events: "VCES", bookings: "V", production: "V", equipment: "VCES", vehicles: "V", attendance: "VCE", purchaseRequests: "VCS", customers: "V" },
  // People, roster, attendance, payroll preparation: create / edit / verify HR; no business bank / P&L detail
  hrManager: { staff: "VCESXD", attendance: "VCESX", payroll: "VCES" },
  // Vehicle, trip, equipment: assign / verify / reconcile logistics
  logisticsManager: { vehicles: "VCESX", equipment: "VCESX", events: "V", bookings: "V" },
  // Own assignments: view own, update allowed task / attendance only
  worker: { attendance: "VC", events: "V" },
  // Own trip: view / update trip status / proof only
  driver: { vehicles: "VE", events: "V" },
  // Segments, consent, source, follow-up: no finance posting, stock adjustment or payroll
  marketing: { leads: "VCES", customers: "VO", marketing: "VCESO", reports: "V" },
  // Technical control: no implicit business approve / pay permission
  systemAdmin: { users: "VCED", settings: "VCE", audit: "VO" },
  // Read-only configured scope: no create / edit / approve / pay
  auditor: Object.fromEntries(MODULES.map((m) => [m, m === "audit" || m === "reports" || m === "ledger" ? "VO" : "V"])) as Partial<Record<Module, string>>,
};

/** May this role do this action on this module? (Data scope — own branch, own assignments — is checked separately.) */
export function allowed(role: RoleCode, module: Module, action: Action): boolean {
  if (role === "owner") return ALL.includes(action);
  return (MATRIX[role][module] ?? "").includes(action);
}

/** The modules a role can open at all (drives which screens are shown). */
export const modulesOf = (role: RoleCode): Module[] => MODULES.filter((m) => allowed(role, m, "V"));

/** B4 — sensitive figures and who may see them. */
export const SENSITIVE = {
  salary: ["owner", "financeHead", "hrManager"],
  foodCost: ["owner", "financeHead", "accountant", "purchaseManager", "kitchenHead", "coo"],
  profit: ["owner", "financeHead"],
  customerRisk: ["owner", "financeHead", "salesManager"],
  contactExport: ["owner", "marketing", "salesManager"],
  vendorBank: ["owner", "financeHead", "accountant", "purchaseManager"],
  auditLog: ["owner", "systemAdmin", "auditor"],
} as const satisfies Record<string, readonly RoleCode[]>;
export type SensitiveKind = keyof typeof SENSITIVE;
export const canSee = (role: RoleCode, kind: SensitiveKind): boolean => (SENSITIVE[kind] as readonly string[]).includes(role);

// ---- B5: separation of duties ---------------------------------------------------------------------------------------

export interface SodConfig {
  /** off = no separation is enforced (a very small team) */
  on: boolean;
  /** the purchase separation applies from this order value (₹) upwards */
  minAmount: number;
  /** the owner may do every step alone (each time it is recorded as an owner override) */
  ownerExempt: boolean;
}
export const DEFAULT_SOD: SodConfig = { on: true, minAmount: 10000, ownerExempt: true };

export function normalizeSod(raw: unknown): SodConfig {
  const o = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const min = o.minAmount;
  return {
    on: o.on === undefined ? DEFAULT_SOD.on : o.on === true,
    minAmount: typeof min === "number" && Number.isFinite(min) && min >= 0 && min <= 10000000 ? Math.round(min * 100) / 100 : DEFAULT_SOD.minAmount,
    ownerExempt: o.ownerExempt === undefined ? DEFAULT_SOD.ownerExempt : o.ownerExempt === true,
  };
}
export function parseSodPatch(v: unknown): { ok: true; value: SodConfig } | { ok: false; error: string } {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return { ok: false, error: "sod must be an object." };
  const o = v as Record<string, unknown>;
  if (typeof o.on !== "boolean" || typeof o.ownerExempt !== "boolean") return { ok: false, error: "sod.on and sod.ownerExempt must be true or false." };
  if (typeof o.minAmount !== "number" || !Number.isFinite(o.minAmount) || o.minAmount < 0 || o.minAmount > 10000000) return { ok: false, error: "sod.minAmount must be a number from 0 to 10000000." };
  return { ok: true, value: normalizeSod(o) };
}

export type PurchaseStep = "request" | "receive" | "verifyBill" | "pay";
export interface PurchaseActors {
  requestedBy?: string;
  receivedBy?: string[];
  billVerifiedBy?: string;
}

/**
 * B5 Purchase: "Requester != receiver != bill verifier != payer for sensitive / high-value flow".
 * Returns the earlier step that the same person already did ("" = allowed). `overridden` is true when the owner is
 * let through although the rule would stop anyone else — the caller records it.
 */
export function purchaseSodClash(step: PurchaseStep, actor: { uid: string; role: RoleCode }, done: PurchaseActors, amount: number, cfg: SodConfig): { clash: "" | PurchaseStep; overridden: boolean } {
  if (!cfg.on || amount < cfg.minAmount) return { clash: "", overridden: false };
  const earlier: [PurchaseStep, boolean][] = [
    ["request", !!done.requestedBy && done.requestedBy === actor.uid],
    ["receive", (done.receivedBy ?? []).includes(actor.uid)],
    ["verifyBill", !!done.billVerifiedBy && done.billVerifiedBy === actor.uid],
  ];
  const order: PurchaseStep[] = ["request", "receive", "verifyBill", "pay"];
  const hit = earlier.find(([s, same]) => same && order.indexOf(s) < order.indexOf(step));
  if (!hit) return { clash: "", overridden: false };
  if (actor.role === "owner" && cfg.ownerExempt) return { clash: "", overridden: true };
  return { clash: hit[0], overridden: false };
}

const STEP_TEXT: Record<PurchaseStep, { te: string; en: string }> = {
  request: { te: "అభ్యర్థన రాసిన", en: "asked for the goods" },
  receive: { te: "సరుకు తీసుకున్న", en: "received the goods" },
  verifyBill: { te: "బిల్ నమోదు చేసిన", en: "entered the bill" },
  pay: { te: "చెల్లించిన", en: "paid" },
};
export function sodMessage(clash: PurchaseStep): { te: string; en: string } {
  return {
    te: `బాధ్యతల విభజన: ఈ కొనుగోలులో ${STEP_TEXT[clash].te} వ్యక్తే ఈ దశ చేయకూడదు. వేరే వ్యక్తి చేయాలి (లేదా యజమాని).`,
    en: `Separation of duties: the person who ${STEP_TEXT[clash].en} for this purchase can't also do this step. Someone else must do it (or the owner).`,
  };
}
