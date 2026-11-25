/**
 * Module 4d — the 17 business roles on the web. GENERATED from functions/src/roles/permRules.ts (ROLES and
 * modulesOf); when that file changes, change this one the same way. This file only decides which menu items a
 * person sees — it hides, it never grants: the security level (admin / manager / staff) and the server still decide
 * what a person can actually do.
 */
export type Level = "admin" | "manager" | "staff";
export interface BusinessRole {
  code: string;
  level: Level;
  te: string;
  en: string;
}

export const BUSINESS_ROLES: BusinessRole[] = [
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
];

/** Modules each role may open (the "View" column of the spec's permission matrix). */
export const ROLE_MODULES: Record<string, string[]> = {
  owner: ["leads", "customers", "quotations", "bookings", "events", "invoices", "receipts", "vendors", "purchaseRequests", "purchaseOrders", "goodsReceipts", "vendorBills", "expenses", "vendorPayments", "inventory", "recipes", "production", "staff", "attendance", "payroll", "vehicles", "equipment", "marketing", "ledger", "reports", "settings", "users", "audit"],
  coo: ["leads", "customers", "quotations", "bookings", "events", "vendors", "purchaseRequests", "purchaseOrders", "goodsReceipts", "expenses", "inventory", "recipes", "production", "staff", "attendance", "vehicles", "equipment", "reports"],
  financeHead: ["customers", "bookings", "invoices", "receipts", "vendors", "purchaseOrders", "goodsReceipts", "vendorBills", "expenses", "vendorPayments", "payroll", "ledger", "reports", "audit"],
  accountant: ["customers", "bookings", "invoices", "receipts", "vendors", "purchaseOrders", "goodsReceipts", "vendorBills", "expenses", "vendorPayments", "ledger", "reports"],
  salesManager: ["leads", "customers", "quotations", "bookings", "events", "invoices", "receipts", "marketing", "reports"],
  salesExecutive: ["leads", "customers", "quotations", "bookings", "events", "receipts"],
  purchaseManager: ["vendors", "purchaseRequests", "purchaseOrders", "goodsReceipts", "vendorBills", "inventory", "recipes", "reports"],
  storeManager: ["vendors", "purchaseRequests", "purchaseOrders", "goodsReceipts", "inventory", "equipment", "reports"],
  kitchenHead: ["bookings", "events", "purchaseRequests", "inventory", "recipes", "production", "attendance"],
  eventManager: ["customers", "bookings", "events", "purchaseRequests", "production", "attendance", "vehicles", "equipment"],
  hrManager: ["staff", "attendance", "payroll"],
  logisticsManager: ["bookings", "events", "vehicles", "equipment"],
  worker: ["events", "attendance"],
  driver: ["events", "vehicles"],
  marketing: ["leads", "customers", "marketing", "reports"],
  systemAdmin: ["settings", "users", "audit"],
  auditor: ["leads", "customers", "quotations", "bookings", "events", "invoices", "receipts", "vendors", "purchaseRequests", "purchaseOrders", "goodsReceipts", "vendorBills", "expenses", "vendorPayments", "inventory", "recipes", "production", "staff", "attendance", "payroll", "vehicles", "equipment", "marketing", "ledger", "reports", "settings", "users", "audit"],
};

/** Roles that can be given to a login of this security level (the owner role is not handed out). */
export const rolesForLevel = (level: Level): BusinessRole[] => BUSINESS_ROLES.filter((r) => r.level === level && r.code !== "owner");

/** Menu path → module of the permission matrix. A path that is not listed is shown to everyone who passes the level check. */
const NAV_MODULE: Record<string, string> = {
  "/dashboard": "reports", "/leads": "leads", "/customers": "customers", "/complaints": "events", "/bookings": "bookings", "/menus/packages": "recipes", "/menu": "recipes",
  "/gallery": "marketing", "/lunch-boxes": "bookings", "/quotes/new": "quotations", "/quotations": "quotations", "/invoices": "invoices", "/expenses": "expenses",
  "/purchases": "vendorBills", "/outside-orders": "purchaseOrders", "/vendor-dues": "vendorPayments", "/vendor-prices": "vendors", "/reports": "reports", "/cancellations": "bookings",
  "/targets": "ledger", "/pnl": "ledger", "/books": "ledger", "/ads": "marketing", "/content-plan": "marketing", "/day-plan": "production", "/dishes": "recipes",
  "/cooking": "production", "/grocery": "production", "/inventory": "inventory", "/packed": "inventory", "/procurement": "purchaseRequests", "/equipment": "equipment",
  "/vehicles": "vehicles", "/grocery-items": "recipes", "/staff": "staff", "/payroll": "payroll", "/vendors": "vendors", "/agents": "settings", "/settings": "settings",
  "/settings/import": "settings", "/users": "users", "/history": "audit",
};

/**
 * Owner-only pages that a finance role may also open (the server allows the matching callables for these roles:
 * functions/src/roles/callablePerms.ts, the entries marked `widen`). Keep the two in step.
 */
const ROLE_EXTRA_PATHS: Record<string, string[]> = {
  financeHead: ["/books", "/vendor-dues", "/pnl", "/payroll"],
  hrManager: ["/payroll"],
  accountant: ["/books", "/vendor-dues"],
};

/** B4 — sensitive figures and the roles that may see them (copy of SENSITIVE in permRules.ts). */
const SENSITIVE: Record<string, string[]> = {
  salary: ["owner", "financeHead", "hrManager"],
  foodCost: ["owner", "financeHead", "accountant", "purchaseManager", "kitchenHead", "coo"],
  profit: ["owner", "financeHead"],
};

/** May this person see the figure? Narrows only: with no business role the level decides, as before. */
export function roleSees(kind: "salary" | "foodCost" | "profit", level: Level, jobRole: string): boolean {
  if (level === "admin") return true;
  const role = BUSINESS_ROLES.find((r) => r.code === jobRole);
  if (!role || role.level !== level || (level === "staff" && jobRole !== "auditor")) return true;
  return SENSITIVE[kind].includes(jobRole);
}

/** Does this person's business role open a page that their level alone would not? (manager level only) */
export function roleOpensPath(path: string, level: Level, jobRole: string): boolean {
  return level === "manager" && BUSINESS_ROLES.some((r) => r.code === jobRole && r.level === "manager") && (ROLE_EXTRA_PATHS[jobRole] ?? []).includes(path);
}

/**
 * Should this menu item be shown to a person with this business role? Only narrows: with no role given (or a role of
 * another level, or the owner) everything the level allows is shown, exactly as before.
 */
export function navAllowedForRole(path: string, level: Level, jobRole: string): boolean {
  // staff logins (worker / driver / auditor) keep the menu of their level: their everyday work is not narrowed
  if (level !== "manager") return true;
  const role = BUSINESS_ROLES.find((r) => r.code === jobRole);
  if (!role || role.level !== level) return true;
  const mod = NAV_MODULE[path];
  return !mod || (ROLE_MODULES[jobRole] ?? []).includes(mod);
}
