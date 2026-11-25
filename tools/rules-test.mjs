// Firestore rules tests (Security agent, Rounds 1–10c + final QA). Run with the Firestore emulator — see
// docs/security-review.md "Emulator test status". Expected: RESULT: 233 passed, 0 failed.
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where, getDocs,
         collectionGroup, arrayUnion, serverTimestamp } from "firebase/firestore";
import fs from "fs";

const env = await initializeTestEnvironment({
  projectId: "demo-suseela-rules",
  firestore: { rules: fs.readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
});
await env.clearFirestore();

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const put = (p, d) => setDoc(doc(db, p), d);
  await put("users/admin", { role: "admin", active: true });
  await put("users/mgr", { role: "manager", active: true, branchId: "b1" });
  await put("users/mgr2", { role: "manager", active: true, branchId: "b2" });
  await put("users/st1", { role: "staff", active: true, branchId: "b1", staffId: "s1" });
  await put("users/st2", { role: "staff", active: true, branchId: "b1", staffId: "s2" });
  await put("users/pend", { role: "staff", active: false });
  await put("menuItems/m1", { name: "Pulihora", pricePerPlate: 100 });
  await put("bookings/bk1", { branchId: "b1", assignedStaffIds: ["s1"], guestCount: 100, status: "Confirmed", createdBy: "admin", eventDate: "2026-11-10" });
  await put("bookings/bk2", { branchId: "b1", assignedStaffIds: ["s2"], guestCount: 50, status: "Confirmed", createdBy: "admin" });
  await put("bookings/bkC", { branchId: "b1", assignedStaffIds: ["s1"], guestCount: 80, status: "Closed", createdBy: "admin", closed: { at: 1 } });
  await put("bookings/bk1/cookLog/d1", { dishId: "d1", band: "100-200", serviceStyle: "banthi", comboKey: "x" });
  await put("bookings/bk1/guestLog/g1", { count: 90 });
  await put("quotations/q1", { branchId: "b1", status: "Sent", totalAmount: 1000, version: 2 });
  await put("quotations/q1/versions/1", { totalAmount: 900 });
  await put("invoices/i1", { branchId: "b1", status: "Sent", totalAmount: 1000 });
  await put("invoices/i1/payments/p1", { branchId: "b1", amount: 100 });
  // Module 4c: October 2026 is locked (lockedUntil = 1 Nov 2026 00:00 IST)
  await put("settings/periodLock", { lockedThrough: "2026-10", lockedUntil: new Date("2026-10-31T18:30:00Z") });
  await put("purchases/puOld", { branchId: "b1", createdBy: "st1", isDeleted: false, totalAmount: 10, costTarget: { type: "booking", bookingId: "bk1" }, purchaseDate: new Date("2026-10-15T06:30:00Z") });
  await put("purchases/pu1", { branchId: "b1", createdBy: "st1", isDeleted: false, totalAmount: 10, costTarget: { type: "booking", bookingId: "bk1" } });
  await put("purchases/puC", { branchId: "b1", createdBy: "st1", isDeleted: false, totalAmount: 10, costTarget: { type: "booking", bookingId: "bkC" } });
  await put("expenses/exL", { branchId: "b1", createdBy: "st1", isDeleted: false, totalAmount: 10, bookingId: "bkC" });
  await put("inventory/inv1", { branchId: "b1", name: "Rice", quantityInStock: 5, reorderLevel: 1 });
  await put("dishes/d1", { nameTe: "పులిహోర", unit: "kg", role: "flavoured-rice", learned: { per100: 10 } });
  await put("notifications/n1", { kind: "plan-ready", audienceRoles: ["admin", "manager"], readBy: [], title: { te: "x", en: "x" } });
  await put("outsideOrders/o1", { branchId: "b1", bookingId: "bk1", amountDue: 10 });
  await put("vendorPayments/v1", { branchId: "b1", amount: 10 });
  await put("equipmentMoves/em1", { branchId: "b1", bookingId: "bk1", assignedStaffIds: ["s1"], type: "issue", qty: 2, createdBy: "mgr" });
  await put("settings/business", { name: "Suseela", calcModes: {} });
  await put("auditLog/a1", { kind: "change" });
  await put("attendance/s1_2026-11-05", { staffId: "s1", branchId: "b1", pay: 500 });
  await put("customers/c1", { name: "Ravi", phone: "9", createdBy: "mgr" });
  // Round 9 seeds: things already cancelled by the server (cancelBooking / cancelRecord).
  await put("bookings/bkX", { branchId: "b1", assignedStaffIds: [], guestCount: 100, status: "Cancelled", previousStatus: "Confirmed", cancel: { reasonCode: "price", refund: 500, charge: 2000 }, createdBy: "admin", updatedBy: "admin" });
  await put("invoices/iX", { branchId: "b1", status: "Cancelled", totalAmount: 2000, amountPaid: 2000, cancellationCharge: 2000, beforeCancel: { totalAmount: 10000 } });
  await put("quotations/qX", { branchId: "b1", status: "Cancelled", previousStatus: "Accepted", totalAmount: 10000 });
  await put("vehicleTrips/tX", { branchId: "b1", bookingId: "bk1", createdBy: "mgr", status: "Cancelled", previousStatus: "planned" });
  await put("equipmentMoves/emX", { branchId: "b1", bookingId: "bk1", assignedStaffIds: ["s1"], type: "issue", qty: 1, createdBy: "mgr", status: "Cancelled" });
  await put("messagesOutbox/mo1", { status: "queued", relatedType: "booking", relatedId: "bk1" });
  // Round 10 seeds
  await put("messagesOutbox/mo2", { status: "needs-approval", holdReason: "template-missing", sendAs: "template" });
  await put("staff/s1", { branchId: "b1", linkedUserId: "st1", name: "Ramu", ratings: { "2026-11": { avg: 4, count: 1 } } });
  await put("staffAdvances/adv1", { staffId: "s1", branchId: "b1", amount: 1000, status: "Open", recovered: 0 });
  await put("staffAdvances/adv2", { staffId: "s2", branchId: "b1", amount: 500, status: "Open", recovered: 0 });
  await put("shifts/sh1", { staffId: "s1", branchId: "b1", bookingId: "bk1", role: "cook", status: "Planned" });
  await put("shifts/sh2", { staffId: "s2", branchId: "b1", bookingId: "bk2", role: "helper", status: "Planned" });
  await put("tasks/tk1", { branchId: "b1", title: "Vessels", assigneeStaffId: "s1", status: "Open", createdBy: "mgr" });
  await put("tasks/tk2", { branchId: "b1", title: "Gas", assigneeStaffId: "s2", status: "Open", createdBy: "mgr" });
  await put("staffRatings/bk1_s1", { staffId: "s1", branchId: "b1", bookingId: "bk1", stars: 4, by: "mgr" });
  await put("staffRatings/bk2_s2", { staffId: "s2", branchId: "b1", bookingId: "bk2", stars: 3, by: "mgr" });
  await put("lunchBoxOrders/lb1", { branchId: "b1", customerId: "c1", count: 10, pricePerBox: 170, status: "active", deliveries: {}, createdBy: "mgr" });
  await put("contentPlan/cp1", { platform: "Instagram", status: "Idea", idea: "Pulihora reel", createdBy: "mgr" });
  await put("menuPackages/pk1", { nameEn: "Lunch A", pricePerPlate: 300 });
  await put("leads/l1", { name: "Kiran", phone: "9", status: "new", createdBy: "mgr" });
  // Round 10c seeds: a manager without a branch and legacy docs without branchId.
  await put("users/mgrNB", { role: "manager", active: true });
  await put("bookings/bkNB", { assignedStaffIds: [], guestCount: 40, status: "Confirmed", createdBy: "admin" });
  await put("expenses/exNB", { createdBy: "mgrNB", isDeleted: false, totalAmount: 5 });
  // Final QA seeds: bills entered by someone else in the same branch.
  await put("purchases/puM", { branchId: "b1", createdBy: "mgr", isDeleted: false, totalAmount: 9000, vendorNameSnapshot: "Sri Ram Traders", costTarget: { type: "overhead", centre: "general" } });
  await put("expenses/exS2", { branchId: "b1", createdBy: "st2", isDeleted: false, totalAmount: 700, costTarget: { type: "overhead", centre: "general" } });
});

const as = (uid) => env.authenticatedContext(uid).firestore();
const A = as("admin"), M = as("mgr"), M2 = as("mgr2"), S1 = as("st1"), S2 = as("st2"), P = as("pend");
const U = (uid) => ({ updatedBy: uid });
let pass = 0, fail = 0;
async function t(name, expect, fn) {
  try { await (expect ? assertSucceeds(fn()) : assertFails(fn())); pass++; }
  catch (e) { fail++; console.log("FAIL:", name, "-", (e.message || e).toString().split("\n")[0]); }
}
const ok = (n, f) => t(n, true, f), no = (n, f) => t(n, false, f);

// users / pending
await ok("pending reads own user doc", () => getDoc(doc(P, "users/pend")));
await no("pending reads menuItems", () => getDoc(doc(P, "menuItems/m1")));
await ok("self signup staff inactive", () => setDoc(doc(as("new1"), "users/new1"), { name: "N", email: "e", phone: "1", role: "staff", active: false, createdAt: serverTimestamp() }));
await no("self signup as admin", () => setDoc(doc(as("new2"), "users/new2"), { name: "N", role: "admin", active: false }));
await ok("self update name + updatedBy", () => updateDoc(doc(S1, "users/st1"), { name: "Ramu", ...U("st1") }));
await no("self update role", () => updateDoc(doc(S1, "users/st1"), { role: "admin", ...U("st1") }));
await no("staff reads other user", () => getDoc(doc(S1, "users/mgr")));

// bookings read
await ok("manager reads own-branch booking", () => getDoc(doc(M, "bookings/bk1")));
await no("other-branch manager reads booking", () => getDoc(doc(M2, "bookings/bk1")));
await ok("assigned staff reads booking", () => getDoc(doc(S1, "bookings/bk1")));
await no("unassigned staff reads booking", () => getDoc(doc(S2, "bookings/bk1")));
await ok("staff query array-contains own staffId", () => getDocs(query(collection(S1, "bookings"), where("assignedStaffIds", "array-contains", "s1"))));
await no("staff query by branch", () => getDocs(query(collection(S1, "bookings"), where("branchId", "==", "b1"))));
await ok("manager query by own branch", () => getDocs(query(collection(M, "bookings"), where("branchId", "==", "b1"))));

// bookings write
await ok("manager creates booking", () => setDoc(doc(M, "bookings/new1"), { branchId: "b1", createdBy: "mgr", guestCount: 120, status: "Inquiry", serviceStyle: "banthi", serveTime: "12:30", travelMinutes: 45, mealType: "lunch", assignedStaffIds: [] }));
await no("manager creates booking with stockDeduction", () => setDoc(doc(M, "bookings/new2"), { branchId: "b1", createdBy: "mgr", guestCount: 120, stockDeduction: {} }));
await no("manager creates booking in other branch", () => setDoc(doc(M, "bookings/new3"), { branchId: "b2", createdBy: "mgr", guestCount: 120 }));
await ok("manager updates guests with updatedBy", () => updateDoc(doc(M, "bookings/bk1"), { guestCount: 150, ...U("mgr") }));
await no("M5b a manager cannot set a booking's brand from an app", () => updateDoc(doc(M, "bookings/bk1"), { brandId: "x", ...U("mgr") }));
await no("M5b the owner cannot set a booking's company from an app either", () => updateDoc(doc(A, "bookings/bk1"), { companyId: "x", ...U("admin") }));
// Last editor must be someone else, otherwise the stored updatedBy (= caller) already names the right person.
await ok("admin edits booking (sets updatedBy admin)", () => updateDoc(doc(A, "bookings/bk1"), { notes: "admin", ...U("admin") }));
await no("manager update without updatedBy", () => updateDoc(doc(M, "bookings/bk1"), { guestCount: 160 }));
await no("manager update with someone else's updatedBy", () => updateDoc(doc(M, "bookings/bk1"), { guestCount: 160, ...U("admin") }));
await ok("serviceStyle buffet", () => updateDoc(doc(M, "bookings/bk1"), { serviceStyle: "buffet", ...U("mgr") }));
await no("serviceStyle invalid", () => updateDoc(doc(M, "bookings/bk1"), { serviceStyle: "plated", ...U("mgr") }));
await no("comboKey from client", () => updateDoc(doc(M, "bookings/bk1"), { comboKey: "rice+side", ...U("mgr") }));
await no("planSnapshot from client", () => updateDoc(doc(M, "bookings/bk1"), { planSnapshot: {}, ...U("mgr") }));
await ok("sessions written", () => updateDoc(doc(M, "bookings/bk1"), { sessions: [{ id: "s-1", guests: 100, serviceStyle: "banthi" }], ...U("mgr") }));
await no("sessions bad serviceStyle", () => updateDoc(doc(M, "bookings/bk1"), { sessions: [{ id: "s-1", serviceStyle: "x" }], ...U("mgr") }));
await no("serveTime bad", () => updateDoc(doc(M, "bookings/bk1"), { serveTime: "25:00", ...U("mgr") }));
await no("travelMinutes > 300", () => updateDoc(doc(M, "bookings/bk1"), { travelMinutes: 400, ...U("mgr") }));
await no("client sets Cancelled", () => updateDoc(doc(M, "bookings/bk1"), { status: "Cancelled", ...U("mgr") }));
await no("client sets closed", () => updateDoc(doc(A, "bookings/bk1"), { closed: { at: 1 }, ...U("admin") }));
await no("admin updates closed booking", () => updateDoc(doc(A, "bookings/bkC"), { notes: "x", ...U("admin") }));
await ok("assigned staff status update", () => updateDoc(doc(S1, "bookings/bk1"), { status: "InProgress", ...U("st1") }));
await no("assigned staff changes guests", () => updateDoc(doc(S1, "bookings/bk1"), { guestCount: 10, ...U("st1") }));
await no("admin deletes booking", () => deleteDoc(doc(A, "bookings/bk2")));

// booking subcollections
await ok("assigned staff reads cookLog", () => getDoc(doc(S1, "bookings/bk1/cookLog/d1")));
await no("unassigned staff reads cookLog", () => getDoc(doc(S2, "bookings/bk1/cookLog/d1")));
await no("admin writes cookLog", () => setDoc(doc(A, "bookings/bk1/cookLog/d2"), { band: "x" }));
await ok("assigned staff reads guestLog", () => getDoc(doc(S1, "bookings/bk1/guestLog/g1")));
await no("staff writes guestLog", () => setDoc(doc(S1, "bookings/bk1/guestLog/g2"), { count: 1 }));

// quotations / invoices / payments
await ok("manager quotation status", () => updateDoc(doc(M, "quotations/q1"), { status: "Accepted", ...U("mgr") }));
await no("manager quotation total", () => updateDoc(doc(M, "quotations/q1"), { totalAmount: 1, ...U("mgr") }));
await no("client acceptedVersion", () => updateDoc(doc(A, "quotations/q1"), { acceptedVersion: 2, ...U("admin") }));
await no("client creates quotation", () => setDoc(doc(A, "quotations/q2"), { branchId: "b1" }));
await ok("manager reads quotation version", () => getDoc(doc(M, "quotations/q1/versions/1")));
await no("staff reads quotation version", () => getDoc(doc(S1, "quotations/q1/versions/1")));
await no("admin writes quotation version", () => setDoc(doc(A, "quotations/q1/versions/2"), {}));
await ok("invoice Sent -> Overdue", () => updateDoc(doc(M, "invoices/i1"), { status: "Overdue", ...U("mgr") }));
await no("invoice -> Paid", () => updateDoc(doc(A, "invoices/i1"), { status: "Paid", ...U("admin") }));
await ok("manager payments collection-group query", () => getDocs(query(collectionGroup(M, "payments"), where("branchId", "==", "b1"))));
await no("admin creates payment", () => setDoc(doc(A, "invoices/i1/payments/p2"), { amount: 1 }));

// purchases / expenses
const ctB = { type: "booking", bookingId: "bk1" };
await ok("staff creates tagged purchase", () => setDoc(doc(S1, "purchases/new1"), { branchId: "b1", createdBy: "st1", isDeleted: false, totalAmount: 50, costTarget: ctB }));
await ok("staff creates overhead expense", () => setDoc(doc(S1, "expenses/new1"), { branchId: "b1", createdBy: "st1", totalAmount: 50, costTarget: { type: "overhead", centre: "utilities" } }));
await no("purchase without costTarget", () => setDoc(doc(S1, "purchases/new2"), { branchId: "b1", createdBy: "st1", totalAmount: 50 }));
await no("purchase bad overhead centre", () => setDoc(doc(S1, "purchases/new3"), { branchId: "b1", createdBy: "st1", costTarget: { type: "overhead", centre: "party" } }));
await no("purchase with paymentStatus", () => setDoc(doc(S1, "purchases/new4"), { branchId: "b1", createdBy: "st1", costTarget: ctB, paymentStatus: "Paid" }));
await no("purchase tagged to closed booking", () => setDoc(doc(A, "purchases/new5"), { branchId: "b1", createdBy: "admin", costTarget: { type: "booking", bookingId: "bkC" } }));
await no("update purchase of closed booking", () => updateDoc(doc(A, "purchases/puC"), { totalAmount: 20, ...U("admin") }));
await no("update legacy expense of closed booking", () => updateDoc(doc(A, "expenses/exL"), { totalAmount: 20, ...U("admin") }));
await ok("staff edits own purchase", () => updateDoc(doc(S1, "purchases/pu1"), { totalAmount: 12, ...U("st1") }));
await no("other staff edits purchase", () => updateDoc(doc(S2, "purchases/pu1"), { totalAmount: 12, ...U("st2") }));
await no("soft delete via isDeleted", () => updateDoc(doc(A, "purchases/pu1"), { isDeleted: true, ...U("admin") }));
await no("client sets paid", () => updateDoc(doc(A, "purchases/pu1"), { paid: 12, ...U("admin") }));
await no("admin deletes purchase", () => deleteDoc(doc(A, "purchases/pu1")));

// inventory
await no("admin edits quantityInStock", () => updateDoc(doc(A, "inventory/inv1"), { quantityInStock: 9, ...U("admin") }));
await no("M5c nobody types a store balance from an app", () => updateDoc(doc(A, "inventory/inv1"), { storeQty: { s1: 5 }, ...U("admin") }));
await no("M5c the home store is set only through the server", () => updateDoc(doc(A, "inventory/inv1"), { homeStoreId: "s1", ...U("admin") }));
await ok("admin edits item name", () => updateDoc(doc(A, "inventory/inv1"), { name: "Sona rice", ...U("admin") }));
await ok("admin creates item at 0", () => setDoc(doc(A, "inventory/new1"), { branchId: "b1", name: "Oil", quantityInStock: 0 }));
await no("admin creates item at 5", () => setDoc(doc(A, "inventory/new2"), { branchId: "b1", name: "Oil", quantityInStock: 5 }));
await no("client creates movement", () => setDoc(doc(A, "inventory/inv1/movements/mv1"), { type: "IN", quantity: 1, recordedBy: "admin" }));
// Module 2d — batches and expiry
await ok("M2d admin turns on expiry tracking", () => updateDoc(doc(A, "inventory/inv1"), { trackExpiry: true, ...U("admin") }));
await no("M2d trackExpiry must be true/false", () => updateDoc(doc(A, "inventory/inv1"), { trackExpiry: "yes", ...U("admin") }));
await no("M2d client sets nearestExpiry", () => updateDoc(doc(A, "inventory/inv1"), { nearestExpiry: "2030-01-01", ...U("admin") }));
await no("M2d client sets batchQty", () => updateDoc(doc(A, "inventory/inv1"), { batchQty: 3, ...U("admin") }));
await no("M2d client writes a batch", () => setDoc(doc(A, "inventory/inv1/batches/b1"), { qty: 5, expiryDay: "2030-01-01" }));
await ok("M2d staff reads batches", () => getDocs(collection(S1, "inventory/inv1/batches")));
await no("M2d item created with a server expiry field", () => setDoc(doc(A, "inventory/new3"), { branchId: "b1", name: "Ghee", quantityInStock: 0, nearestExpiry: "2030-01-01" }));

// dishes (Round 8)
await ok("manager sets dish role / startRules / typedRecipe", () => updateDoc(doc(M, "dishes/d1"), { role: "rice", startRules: [{ factorPct: 90 }], typedRecipe: [], ...U("mgr") }));
await no("dish role invalid", () => updateDoc(doc(M, "dishes/d1"), { role: "soup", ...U("mgr") }));
await no("client writes learned", () => updateDoc(doc(A, "dishes/d1"), { learned: { per100: 1 }, ...U("admin") }));
await no("client writes learned.byCell", () => updateDoc(doc(A, "dishes/d1"), { "learned.byCell": {}, ...U("admin") }));
await no("client writes recipe", () => updateDoc(doc(M, "dishes/d1"), { recipe: {}, ...U("mgr") }));
// Module 2b: recipe versions are server-written
await no("M2b client writes dish recipeVersion", () => updateDoc(doc(A, "dishes/d1"), { recipeVersion: 9, ...U("admin") }));
await no("M2b client writes a recipe version document", () => setDoc(doc(A, "dishes/d1/recipeVersions/0001"), { version: 1 }));
// X5 — packed sales are server-only, never visible to staff
await no("X5 client writes a packed sale", () => setDoc(doc(A, "packedSales/s1"), { amount: 100, branchId: "b1" }));
await no("X5 staff lists packed sales", () => getDocs(query(collection(S1, "packedSales"), where("branchId", "==", "b1"))));
// Module 3a — purchase requests and orders are server-only; staff never see orders
await no("M3a client writes a purchase request", () => setDoc(doc(S1, "purchaseRequests/pr1"), { status: "approved", branchId: "b1", requestedBy: "x" }));
await no("M3a client writes a purchase order", () => setDoc(doc(A, "purchaseOrders/po1"), { status: "approved", total: 1, branchId: "b1" }));
await no("M3a staff lists purchase orders", () => getDocs(query(collection(S1, "purchaseOrders"), where("branchId", "==", "b1"))));
await ok("M4d owner gives a manager a business role", () => updateDoc(doc(A, "users/mgr"), { jobRole: "storeManager", ...U("admin") }));
await no("M4d a manager-level role cannot go to a staff login", () => updateDoc(doc(A, "users/st1"), { jobRole: "financeHead", ...U("admin") }));
await no("M4d nobody gives themselves a business role", () => updateDoc(doc(S1, "users/st1"), { jobRole: "auditor", ...U("st1") }));
await no("M4f a store manager cannot create a customer", () => setDoc(doc(M, "customers/cR1"), { name: "Role", phone: "97", createdBy: "mgr" }));
await no("M4g a store manager does not read staff advances", () => getDoc(doc(M, "staffAdvances/adv1")));
await ok("M4f owner changes the role to sales executive", () => updateDoc(doc(A, "users/mgr"), { jobRole: "salesExecutive", ...U("admin") }));
await ok("M4f a sales executive creates a customer", () => setDoc(doc(M, "customers/cR1"), { name: "Role", phone: "97", createdBy: "mgr" }));
await ok("M4f owner makes a staff login an auditor", () => updateDoc(doc(A, "users/st1"), { jobRole: "auditor", ...U("admin") }));
await no("M4f the read-only auditor cannot create a purchase", () => setDoc(doc(S1, "purchases/lockA"), { branchId: "b1", createdBy: "st1", isDeleted: false, totalAmount: 50, costTarget: ctB, purchaseDate: new Date("2026-11-05T06:30:00Z") }));
await ok("M4f owner clears the auditor role", () => updateDoc(doc(A, "users/st1"), { jobRole: "", ...U("admin") }));
await ok("M4d owner clears the business role", () => updateDoc(doc(A, "users/mgr"), { jobRole: "", ...U("admin") }));
await ok("M4g a manager with no role reads staff advances as before", () => getDoc(doc(M, "staffAdvances/adv1")));
await ok("M4g owner reads a private pay document", () => getDoc(doc(A, "staff/s1/private/pay")));
await no("M4g a branch manager does not read private pay", () => getDoc(doc(M, "staff/s1/private/pay")));
await no("M4g a staff login does not read private pay", () => getDoc(doc(S1, "staff/s1/private/pay")));
await no("M4g nobody writes private pay from an app", () => setDoc(doc(A, "staff/s1/private/pay"), { dailyWage: 1 }));
await no("M4h client writes a stock adjustment request", () => setDoc(doc(A, "stockAdjustRequests/r1"), { status: "approved", branchId: "b1" }));
await no("M4h staff lists the branch's adjustment requests", () => getDocs(query(collection(S1, "stockAdjustRequests"), where("branchId", "==", "b1"))));
await ok("M4h manager lists the branch's adjustment requests", () => getDocs(query(collection(M, "stockAdjustRequests"), where("branchId", "==", "b1"))));
await no("M4i client writes a salary payment", () => setDoc(doc(A, "salaryPayments/sp1"), { amount: 1 }));
await no("M4i manager reads salary payments", () => getDocs(collection(M, "salaryPayments")));
await ok("M4i owner reads salary payments", () => getDocs(collection(A, "salaryPayments")));
await no("M5a client writes a company", () => setDoc(doc(A, "companies/c1"), { legalName: "X" }));
await no("M5a client writes a store", () => setDoc(doc(A, "stores/s1"), { name: "X", branchId: "b1" }));
await no("M5a staff reads companies", () => getDocs(collection(S1, "companies")));
await ok("M5a manager reads companies", () => getDocs(collection(M, "companies")));
await ok("M5a staff reads kitchens and stores", () => Promise.all([getDocs(collection(S1, "kitchens")), getDocs(collection(S1, "stores")), getDocs(collection(S1, "brands"))]));
await no("M5e client writes a safety check", () => setDoc(doc(A, "safetyChecks/x1"), { result: "pass", branchId: "b1" }));
await no("M5e client writes a safety incident", () => setDoc(doc(S1, "safetyIncidents/x1"), { what: "x", branchId: "b1", byUid: "st1" }));
await ok("M5e manager lists the branch's safety checks", () => getDocs(query(collection(M, "safetyChecks"), where("branchId", "==", "b1"))));
await ok("M5e staff lists own safety checks", () => getDocs(query(collection(S1, "safetyChecks"), where("byUid", "==", "st1"))));
await no("M5e staff lists the whole branch's incidents", () => getDocs(query(collection(S1, "safetyIncidents"), where("branchId", "==", "b1"))));
await no("M5f client writes a dispatch", () => setDoc(doc(A, "dispatches/d1"), { status: "dispatched", branchId: "b1" }));
await ok("M5f manager lists the branch's dispatches", () => getDocs(query(collection(M, "dispatches"), where("branchId", "==", "b1"))));
await no("M5f staff lists every dispatch of the branch", () => getDocs(query(collection(S1, "dispatches"), where("branchId", "==", "b1"))));
await no("M4c purchase dated in a locked month cannot be edited", () => updateDoc(doc(A, "purchases/puOld"), { totalAmount: 12, ...U("admin") }));
await no("M4c purchase cannot be created in a locked month", () => setDoc(doc(S1, "purchases/lock1"), { branchId: "b1", createdBy: "st1", isDeleted: false, totalAmount: 50, costTarget: ctB, purchaseDate: new Date("2026-10-20T06:30:00Z") }));
await ok("M4c purchase dated in the open month is created", () => setDoc(doc(S1, "purchases/lock2"), { branchId: "b1", createdBy: "st1", isDeleted: false, totalAmount: 50, costTarget: ctB, purchaseDate: new Date("2026-11-05T06:30:00Z") }));
await no("M4c purchase cannot be moved into a locked month", () => updateDoc(doc(S1, "purchases/lock2"), { purchaseDate: new Date("2026-10-20T06:30:00Z"), ...U("st1") }));
await no("M4b client writes a journal entry", () => setDoc(doc(A, "journalEntries/j1"), { day: "2026-11-01", lines: [] }));
await no("M4b client changes the period lock", () => setDoc(doc(A, "settings/periodLock"), { lockedThrough: "" }));
await no("M4b manager reads journal entries", () => getDocs(collection(M, "journalEntries")));
await no("M3c client sets paymentHold on a purchase", () => updateDoc(doc(A, "purchases/pu1"), { paymentHold: false, ...U("admin") }));
await no("M3c client links a purchase to an order", () => updateDoc(doc(A, "purchases/pu1"), { purchaseOrderId: "po1", ...U("admin") }));
await no("M3b client writes a goods receipt", () => setDoc(doc(A, "goodsReceipts/g1"), { acceptedValue: 1, branchId: "b1" }));
await no("M3b staff lists goods receipts", () => getDocs(query(collection(S1, "goodsReceipts"), where("branchId", "==", "b1"))));
await no("M3a staff lists all purchase requests of the branch", () => getDocs(query(collection(S1, "purchaseRequests"), where("branchId", "==", "b1"))));
// Pending list X7 / X9 / X10 — server-only fields
await no("X7 client sets expiredQty", () => updateDoc(doc(A, "inventory/inv1"), { expiredQty: 1, ...U("admin") }));
await no("X9 client sets costEstimate on a quotation", () => updateDoc(doc(A, "quotations/q1"), { costEstimate: { total: 1 }, updatedBy: "admin" }));
// Module 2i — standard / estimated cost are server-only
await no("M2i client sets standardCost on a menu", () => updateDoc(doc(A, "menuPackages/pk1"), { standardCost: { perPlate: 1 }, ...U("admin") }));
await no("M2i client writes standard cost history", () => setDoc(doc(A, "menuPackages/pk1/standardCosts/x"), { perPlate: 1 }));
await no("M2i client sets costEstimate on a booking", () => updateDoc(doc(A, "bookings/bk1"), { costEstimate: { total: 1 }, ...U("admin") }));
await no("M2i client writes an estimate version", () => setDoc(doc(A, "bookings/bk1/costEstimates/0001"), { total: 1 }));
await no("M2i manager reads estimate versions", () => getDocs(collection(M, "bookings/bk1/costEstimates")));
// Module 2h — conversion snapshot and pack history are server-only
await no("M2h client sets stockConversions on a purchase", () => updateDoc(doc(A, "purchases/pu1"), { stockConversions: [{ inventoryItemId: "inv1", unit: "Bag", stockUnit: "kg", factor: 999 }], ...U("admin") }));
await no("M2h client writes pack history", () => setDoc(doc(A, "groceryItems/g1/packHistory/h1"), { packs: [] }));
// Module 2g — reservations are server-only
await no("M2g client writes a reservation", () => setDoc(doc(A, "stockReservations/bk1"), { lines: [] }));
await no("M2g client sets reservedQty", () => updateDoc(doc(A, "inventory/inv1"), { reservedQty: 2, ...U("admin") }));
await ok("M2g staff reads reservations", () => getDocs(collection(S1, "stockReservations")));
// Module 2f — packed products are server-only
await no("M2f client writes a packed product", () => setDoc(doc(A, "packedProducts/pp1"), { nameEn: "Pickle", mrp: 100 }));
await no("M2f client writes a packing run", () => setDoc(doc(A, "packedProducts/pp1/runs/r1"), { packs: 5 }));
await ok("M2f staff reads packed products", () => getDocs(collection(S1, "packedProducts")));
// Module 2e — bases (sub-recipes)
await ok("M2e manager marks a dish as a base", () => updateDoc(doc(M, "dishes/d1"), { isSubRecipe: true, subRecipes: [{ dishId: "d2", perUnit: 0.3 }], ...U("mgr") }));
await no("M2e isSubRecipe must be true/false", () => updateDoc(doc(M, "dishes/d1"), { isSubRecipe: "yes", ...U("mgr") }));
await no("M2e subRecipes must be a list", () => updateDoc(doc(M, "dishes/d1"), { subRecipes: "gravy", ...U("mgr") }));
await ok("M2b manager reads recipe versions", () => getDocs(collection(M, "dishes/d1/recipeVersions")));
await no("M2b staff reads recipe versions", () => getDocs(collection(S1, "dishes/d1/recipeVersions")));
// Module 2a: pack sizes and other names on a grocery item are lists
await no("M2a grocery packs must be a list", () => setDoc(doc(A, "groceryItems/gx"), { nameEn: "X", unit: "kg", packs: "Bag=25", ...U("admin") }));
await no("staff edits dish", () => updateDoc(doc(S1, "dishes/d1"), { role: "rice", ...U("st1") }));
await no("M5h client writes dish allergens", () => updateDoc(doc(A, "dishes/d1"), { allergens: ["milk"], ...U("admin") }));
await no("M5h client writes dish foodType", () => updateDoc(doc(M, "dishes/d1"), { foodType: "veg", ...U("mgr") }));
await ok("M5h owner creates a grocery item (control)", () => setDoc(doc(A, "groceryItems/gtag"), { nameEn: "Ghee", unit: "kg", ...U("admin") }));
await no("M5h client creates a grocery item with allergens", () => setDoc(doc(A, "groceryItems/gtag2"), { nameEn: "Milk", unit: "L", allergens: ["milk"], ...U("admin") }));
await no("M5h client writes grocery foodTagged", () => updateDoc(doc(A, "groceryItems/gtag"), { foodTagged: true, ...U("admin") }));
await ok("staff reads dish", () => getDoc(doc(S1, "dishes/d1")));

// notifications
await ok("manager reads notification", () => getDoc(doc(M, "notifications/n1")));
await no("staff reads notification", () => getDoc(doc(S1, "notifications/n1")));
await ok("manager queries own-role notifications", () => getDocs(query(collection(M, "notifications"), where("audienceRoles", "array-contains", "manager"))));
await ok("manager marks read", () => updateDoc(doc(M, "notifications/n1"), { readBy: arrayUnion("mgr") }));
await no("manager marks read for someone else", () => updateDoc(doc(M, "notifications/n1"), { readBy: arrayUnion("admin") }));
await no("manager edits title", () => updateDoc(doc(M, "notifications/n1"), { title: { te: "y", en: "y" } }));
await no("admin creates notification", () => setDoc(doc(A, "notifications/n2"), { audienceRoles: ["admin"] }));

// outside orders, vendor payments, equipment, trips, complaints
await ok("manager reads outside order", () => getDoc(doc(M, "outsideOrders/o1")));
await no("other manager reads outside order", () => getDoc(doc(M2, "outsideOrders/o1")));
await no("staff reads outside order", () => getDoc(doc(S1, "outsideOrders/o1")));
await no("admin writes outside order", () => setDoc(doc(A, "outsideOrders/o2"), { branchId: "b1" }));
await ok("manager reads vendor payment", () => getDoc(doc(M, "vendorPayments/v1")));
await no("admin writes vendor payment", () => setDoc(doc(A, "vendorPayments/v2"), { amount: 1 }));
await ok("staff queries own moves", () => getDocs(query(collection(S1, "equipmentMoves"), where("assignedStaffIds", "array-contains", "s1"))));
await no("unassigned staff reads move", () => getDoc(doc(S2, "equipmentMoves/em1")));
await ok("manager creates move", () => setDoc(doc(M, "equipmentMoves/em2"), { branchId: "b1", bookingId: "bk1", type: "issue", qty: 3, createdBy: "mgr" }));
await no("manager creates move with assignedStaffIds", () => setDoc(doc(M, "equipmentMoves/em3"), { branchId: "b1", bookingId: "bk1", type: "issue", qty: 3, createdBy: "mgr", assignedStaffIds: ["s2"] }));
await no("move for closed booking", () => setDoc(doc(M, "equipmentMoves/em4"), { branchId: "b1", bookingId: "bkC", type: "return", qty: 1, createdBy: "mgr" }));
await ok("staff creates trip for assigned booking", () => setDoc(doc(S1, "vehicleTrips/t1"), { branchId: "b1", bookingId: "bk1", createdBy: "st1", kmStart: 10, kmEnd: 20 }));
await no("staff creates trip for unassigned booking", () => setDoc(doc(S1, "vehicleTrips/t2"), { branchId: "b1", bookingId: "bk2", createdBy: "st1" }));
await ok("staff complaint for assigned booking", () => setDoc(doc(S1, "complaints/c1"), { branchId: "b1", bookingId: "bk1", createdBy: "st1", status: "open", category: "food" }));
await no("staff complaint already resolved", () => setDoc(doc(S1, "complaints/c2"), { branchId: "b1", bookingId: "bk1", createdBy: "st1", status: "resolved" }));

// settings, audit, attendance, customers, stats
await no("admin writes settings/business", () => updateDoc(doc(A, "settings/business"), { calcModes: { quotation: "manual" } }));
await ok("manager reads settings/business", () => getDoc(doc(M, "settings/business")));
await ok("admin reads auditLog", () => getDoc(doc(A, "auditLog/a1")));
await no("manager reads auditLog", () => getDoc(doc(M, "auditLog/a1")));
await no("admin writes auditLog", () => setDoc(doc(A, "auditLog/a2"), {}));
await ok("staff reads own attendance", () => getDoc(doc(S1, "attendance/s1_2026-11-05")));
await no("other staff reads attendance", () => getDoc(doc(S2, "attendance/s1_2026-11-05")));
await ok("manager creates customer", () => setDoc(doc(M, "customers/c2"), { name: "Sita", phone: "98", createdBy: "mgr" }));
await ok("M6a manager saves a customer allergy note", () => setDoc(doc(M, "customers/c2a"), { name: "Sita", phone: "98", allergyNote: "no peanuts", createdBy: "mgr" }));
await no("M6a an allergy note must be text", () => setDoc(doc(M, "customers/c2b"), { name: "Sita", phone: "98", allergyNote: 5, createdBy: "mgr" }));
await no("staff reads customer", () => getDoc(doc(S1, "customers/c1")));
await no("M6a client cannot write a refund request", () => setDoc(doc(M, "refundRequests/rr1"), { invoiceId: "i1", amount: 5, status: "approved" }));
await no("admin deletes customer", () => deleteDoc(doc(A, "customers/c1")));
await no("client archives customer", () => updateDoc(doc(A, "customers/c1"), { archived: true, ...U("admin") }));

// Round 9 — order cancellation (cancelBooking / restoreBooking / postponeBooking are callables)
await no("R9 manager writes booking.cancel", () => updateDoc(doc(M, "bookings/bk1"), { cancel: { reasonCode: "price" }, ...U("mgr") }));
await no("R9 manager writes lastCancel", () => updateDoc(doc(M, "bookings/bk1"), { lastCancel: {}, ...U("mgr") }));
await no("R9 manager writes cancelLoss", () => updateDoc(doc(M, "bookings/bk1"), { cancelLoss: 0, ...U("mgr") }));
await no("R9 manager writes postponements", () => updateDoc(doc(M, "bookings/bk1"), { postponements: [], ...U("mgr") }));
await no("R9 manager writes lastPostponed", () => updateDoc(doc(M, "bookings/bk1"), { lastPostponed: {}, ...U("mgr") }));
await no("R9 manager writes previousStatus", () => updateDoc(doc(M, "bookings/bk1"), { previousStatus: "Confirmed", ...U("mgr") }));
await no("R9 admin sets booking Cancelled", () => updateDoc(doc(A, "bookings/bk1"), { status: "Cancelled", ...U("admin") }));
await no("R9 manager creates booking already Cancelled", () => setDoc(doc(M, "bookings/r9new"), { branchId: "b1", createdBy: "mgr", guestCount: 100, status: "Cancelled" }));
await ok("R9 manager reads cancelled booking", () => getDoc(doc(M, "bookings/bkX")));
await no("R9 admin un-cancels booking", () => updateDoc(doc(A, "bookings/bkX"), { status: "Confirmed", ...U("admin") }));
await no("R9 admin edits notes of cancelled booking", () => updateDoc(doc(A, "bookings/bkX"), { notes: "x", ...U("admin") }));
await ok("R9 manager postpones via eventDate edit", () => updateDoc(doc(M, "bookings/bk1"), { eventDate: "2026-11-20", ...U("mgr") }));
await no("R9 manager sets invoice Cancelled", () => updateDoc(doc(M, "invoices/i1"), { status: "Cancelled", ...U("mgr") }));
await no("R9 admin un-cancels invoice", () => updateDoc(doc(A, "invoices/iX"), { status: "Sent", ...U("admin") }));
await no("R9 client sets cancellationCharge", () => updateDoc(doc(A, "invoices/i1"), { cancellationCharge: 0, ...U("admin") }));
await no("R9 client sets beforeCancel", () => updateDoc(doc(A, "invoices/i1"), { beforeCancel: {}, ...U("admin") }));
await no("R9 client sets invoice restoredAt", () => updateDoc(doc(A, "invoices/iX"), { restoredAt: 1, ...U("admin") }));
await no("R9 admin records refund payment", () => setDoc(doc(A, "invoices/i1/payments/r1"), { branchId: "b1", type: "refund", cancellation: true, amount: -500, bookingId: "bk1" }));
await no("R9 manager sets quotation Cancelled", () => updateDoc(doc(M, "quotations/q1"), { status: "Cancelled", ...U("mgr") }));
await no("R9 manager un-cancels quotation", () => updateDoc(doc(M, "quotations/qX"), { status: "Draft", ...U("mgr") }));
await no("R9 manager cancels trip", () => updateDoc(doc(M, "vehicleTrips/t1"), { status: "Cancelled", ...U("mgr") }));
await no("R9 manager edits cancelled trip", () => updateDoc(doc(M, "vehicleTrips/tX"), { kmEnd: 5, ...U("mgr") }));
await no("R9 manager sets move previousStatus", () => updateDoc(doc(M, "equipmentMoves/em1"), { previousStatus: "planned", ...U("mgr") }));
await no("R9 manager cancels move", () => updateDoc(doc(M, "equipmentMoves/em1"), { status: "Cancelled", ...U("mgr") }));
await no("R9 manager edits cancelled move", () => updateDoc(doc(M, "equipmentMoves/emX"), { qty: 2, ...U("mgr") }));
await ok("R9 manager edits live move qty", () => updateDoc(doc(M, "equipmentMoves/em1"), { qty: 4, ...U("mgr") }));
await no("R9 admin marks outbox message cancelled", () => updateDoc(doc(A, "messagesOutbox/mo1"), { status: "cancelled" }));

// Round 10 — advances, shifts, tasks, ratings, lunch boxes, content plan, kids / special meals, WhatsApp
await ok("R10 staff reads own advance", () => getDoc(doc(S1, "staffAdvances/adv1")));
await no("R10 staff reads other's advance", () => getDoc(doc(S1, "staffAdvances/adv2")));
await ok("R10 staff queries own advances", () => getDocs(query(collection(S1, "staffAdvances"), where("staffId", "==", "s1"))));
await ok("R10 manager reads branch advance", () => getDoc(doc(M, "staffAdvances/adv1")));
await no("R10 other-branch manager reads advance", () => getDoc(doc(M2, "staffAdvances/adv1")));
await no("R10 admin creates advance directly", () => setDoc(doc(A, "staffAdvances/adv3"), { staffId: "s1", branchId: "b1", amount: 100, status: "Open" }));
await no("R10 admin marks advance Recovered", () => updateDoc(doc(A, "staffAdvances/adv1"), { status: "Recovered", recovered: 1000 }));
await ok("R10 staff reads own shift", () => getDoc(doc(S1, "shifts/sh1")));
await no("R10 staff reads other's shift", () => getDoc(doc(S1, "shifts/sh2")));
await ok("R10 staff queries own shifts", () => getDocs(query(collection(S1, "shifts"), where("staffId", "==", "s1"))));
await ok("R10 manager reads shift", () => getDoc(doc(M, "shifts/sh2")));
await no("R10 manager writes shift", () => setDoc(doc(M, "shifts/sh3"), { staffId: "s1", branchId: "b1", role: "cook" }));
await ok("R10 manager creates task", () => setDoc(doc(M, "tasks/tk3"), { branchId: "b1", title: "Buy banana leaves", assigneeStaffId: "s2", status: "Open", createdBy: "mgr" }));
await no("R10 manager creates task already Done", () => setDoc(doc(M, "tasks/tk4"), { branchId: "b1", title: "x", status: "Done", createdBy: "mgr" }));
await ok("R10 manager edits task title", () => updateDoc(doc(M, "tasks/tk1"), { title: "Wash vessels", ...U("mgr") }));
await no("R10 manager completes task directly", () => updateDoc(doc(M, "tasks/tk1"), { status: "Done", ...U("mgr") }));
await no("R10 manager sets doneAt", () => updateDoc(doc(M, "tasks/tk1"), { doneAt: 1, ...U("mgr") }));
await ok("R10 staff reads own task", () => getDoc(doc(S1, "tasks/tk1")));
await no("R10 staff reads other's task", () => getDoc(doc(S1, "tasks/tk2")));
await ok("R10 staff queries own tasks", () => getDocs(query(collection(S1, "tasks"), where("assigneeStaffId", "==", "s1"))));
await no("R10 staff completes own task directly", () => updateDoc(doc(S1, "tasks/tk1"), { status: "Done", ...U("st1") }));
await no("R10 staff edits task title", () => updateDoc(doc(S1, "tasks/tk1"), { title: "x", ...U("st1") }));
await no("R10 manager deletes task", () => deleteDoc(doc(M, "tasks/tk2")));
await ok("R10 manager reads rating", () => getDoc(doc(M, "staffRatings/bk2_s2")));
await ok("R10 staff reads own rating", () => getDoc(doc(S1, "staffRatings/bk1_s1")));
await no("R10 staff reads other's rating", () => getDoc(doc(S1, "staffRatings/bk2_s2")));
await no("R10 manager writes rating", () => setDoc(doc(M, "staffRatings/bk1_s2"), { staffId: "s2", branchId: "b1", stars: 5 }));
await no("R10 admin writes staff.ratings", () => updateDoc(doc(A, "staff/s1"), { ratings: {}, ...U("admin") }));
await ok("R10 admin edits staff name", () => updateDoc(doc(A, "staff/s1"), { name: "Ramu K", ...U("admin") }));
await ok("R10 manager creates lunch box order", () => setDoc(doc(M, "lunchBoxOrders/lb2"), { branchId: "b1", customerId: "c1", count: 20, pricePerBox: 170, status: "active", days: ["mon", "tue"], createdBy: "mgr" }));
await no("R10 lunch box order with deliveries", () => setDoc(doc(M, "lunchBoxOrders/lb3"), { branchId: "b1", customerId: "c1", count: 5, status: "active", deliveries: { "2026-11-06": 5 }, createdBy: "mgr" }));
await ok("R10 manager changes lunch box count", () => updateDoc(doc(M, "lunchBoxOrders/lb1"), { count: 12, ...U("mgr") }));
await no("R10 manager ticks delivery directly", () => updateDoc(doc(M, "lunchBoxOrders/lb1"), { "deliveries.2026-11-06": 10, ...U("mgr") }));
await no("R10 manager sets lastInvoiceId", () => updateDoc(doc(M, "lunchBoxOrders/lb1"), { lastInvoiceId: "x", ...U("mgr") }));
await no("R10 manager cancels lunch box order", () => updateDoc(doc(M, "lunchBoxOrders/lb1"), { status: "cancelled", ...U("mgr") }));
await ok("R10 staff reads branch lunch box order", () => getDoc(doc(S1, "lunchBoxOrders/lb1")));
await no("R10 staff edits lunch box order", () => updateDoc(doc(S1, "lunchBoxOrders/lb1"), { count: 1, ...U("st1") }));
await no("R10 other-branch manager reads lunch box order", () => getDoc(doc(M2, "lunchBoxOrders/lb1")));
await no("R10 admin creates lunch box invoice", () => setDoc(doc(A, "invoices/lunchbox_c1_2026-11"), { branchId: "b1", kind: "lunchBox" }));
await ok("R10 manager adds content idea", () => setDoc(doc(M, "contentPlan/cp2"), { platform: "Facebook", status: "Idea", idea: "Wedding setup", createdBy: "mgr" }));
await ok("calendar note: manager adds a festival", () => setDoc(doc(M, "calendarNotes/cn1"), { day: "2026-11-24", kind: "Festival", title: "Karthika Pournami", note: "", createdBy: "mgr" }));
await no("calendar note: bad kind refused", () => setDoc(doc(M, "calendarNotes/cn2"), { day: "2026-11-24", kind: "Other", title: "x", createdBy: "mgr" }));
await ok("calendar note: up to 5 photos", () => setDoc(doc(M, "calendarNotes/cn4"), { day: "2026-11-24", kind: "Idea", title: "Rangoli idea", note: "", photos: ["https://x/1.jpg", "https://x/2.jpg"], createdBy: "mgr" }));
await no("calendar note: 6 photos refused", () => setDoc(doc(M, "calendarNotes/cn5"), { day: "2026-11-24", kind: "Idea", title: "Too many", note: "", photos: ["a", "b", "c", "d", "e", "f"], createdBy: "mgr" }));
await no("calendar note: photos must be a list", () => setDoc(doc(M, "calendarNotes/cn6"), { day: "2026-11-24", kind: "Idea", title: "Bad", note: "", photos: "https://x/1.jpg", createdBy: "mgr" }));
await no("calendar note: staff cannot add", () => setDoc(doc(S1, "calendarNotes/cn3"), { day: "2026-11-24", kind: "Note", title: "x", createdBy: "st1" }));
await no("portal link: nobody reads it from the app", () => getDoc(doc(A, "portalLinks/abc")));
await no("payment link: nobody writes it from the app", () => setDoc(doc(A, "paymentLinks/plink_1"), { invoiceId: "i1" }));
await ok("R10 admin reads content plan", () => getDoc(doc(A, "contentPlan/cp1")));
await no("R10 staff reads content plan", () => getDoc(doc(S1, "contentPlan/cp1")));
await no("R10 staff adds content idea", () => setDoc(doc(S1, "contentPlan/cp3"), { platform: "Instagram", status: "Idea", createdBy: "st1" }));
await no("R10 content plan bad platform", () => setDoc(doc(M, "contentPlan/cp4"), { platform: "TikTok", status: "Idea", createdBy: "mgr" }));
await ok("R10 admin sets kidsPrice", () => updateDoc(doc(A, "menuPackages/pk1"), { kidsPrice: 150, ...U("admin") }));
await no("R10 negative kidsPrice", () => updateDoc(doc(A, "menuPackages/pk1"), { kidsPrice: -5, ...U("admin") }));
await no("R10 manager sets kidsPrice", () => updateDoc(doc(M, "menuPackages/pk1"), { kidsPrice: 120, ...U("mgr") }));
await ok("R10 manager sets kidsCount + specialMeals", () => updateDoc(doc(M, "bookings/bk1"), { kidsCount: 10, specialMeals: [{ type: "jain", count: 5, note: "no root veg" }], ...U("mgr") }));
await no("R10 negative kidsCount", () => updateDoc(doc(M, "bookings/bk1"), { kidsCount: -1, ...U("mgr") }));
await no("R10 specialMeals bad type", () => updateDoc(doc(M, "bookings/bk1"), { specialMeals: [{ type: "keto", count: 2 }], ...U("mgr") }));
await no("R10 staff sets kidsCount", () => updateDoc(doc(S1, "bookings/bk1"), { kidsCount: 3, ...U("st1") }));
await ok("R10 manager ticks whatsappOptIn", () => updateDoc(doc(M, "customers/c1"), { whatsappOptIn: true, ...U("mgr") }));
await no("R10 manager sets whatsappOptInAt", () => updateDoc(doc(M, "customers/c1"), { whatsappOptInAt: 1, ...U("mgr") }));
await no("R10 manager sets whatsappOptInBy", () => updateDoc(doc(M, "customers/c1"), { whatsappOptInBy: "mgr", ...U("mgr") }));
await no("R10 manager sets whatsappLastInboundAt", () => updateDoc(doc(M, "customers/c1"), { whatsappLastInboundAt: 1, ...U("mgr") }));
await no("R10 manager sets lead whatsappOptOutBy", () => updateDoc(doc(M, "leads/l1"), { whatsappOptOutBy: "mgr", ...U("mgr") }));
// Module 1a (18 Nov 2026): pipeline stages are client-writable, the assignee is server-only.
await no("M1a manager sets lead assignedTo", () => updateDoc(doc(M, "leads/l1"), { assignedTo: "mgr", ...U("mgr") }));
await no("M1a manager sets lead assignedName / assignedBy", () => updateDoc(doc(M, "leads/l1"), { assignedName: "X", assignedBy: "mgr", ...U("mgr") }));
await ok("M1a manager moves lead to qualified", () => updateDoc(doc(M, "leads/l1"), { status: "qualified", lostReason: "", ...U("mgr") }));
await ok("M1a manager marks lead duplicate", () => updateDoc(doc(M, "leads/l1"), { status: "duplicate", lostReason: "", ...U("mgr") }));
await no("M1a manager sets an unknown lead stage", () => updateDoc(doc(M, "leads/l1"), { status: "bogus", ...U("mgr") }));
await no("M1b manager sets lead firstResponseAt", () => updateDoc(doc(M, "leads/l1"), { firstResponseAt: serverTimestamp(), ...U("mgr") }));
await no("M1b manager clears lead tatAlertAt", () => updateDoc(doc(M, "leads/l1"), { tatAlertAt: null, ...U("mgr") }));
await ok("M1c manager sets lead scoreManual hot", () => updateDoc(doc(M, "leads/l1"), { scoreManual: "hot", ...U("mgr") }));
await ok("M1c manager clears lead scoreManual", () => updateDoc(doc(M, "leads/l1"), { scoreManual: "", ...U("mgr") }));
await no("M1c manager sets lead scoreManual to an unknown band", () => updateDoc(doc(M, "leads/l1"), { scoreManual: "boiling", ...U("mgr") }));
await no("M1c manager marks a lead imported", () => updateDoc(doc(M, "leads/l1"), { imported: true, ...U("mgr") }));
await ok("M1e manager sets lead notes + followUpTime", () => updateDoc(doc(M, "leads/l1"), { notes: "call after 6", followUpTime: "18:30", ...U("mgr") }));
await no("M1e manager sets a 6-character followUpTime", () => updateDoc(doc(M, "leads/l1"), { followUpTime: "18:300", ...U("mgr") }));
await no("M1e manager writes a lead comment directly", () => setDoc(doc(M, "leads/l1/comments/c1"), { text: "hi", createdBy: "mgr" }));
await ok("M1e manager reads lead comments", () => getDocs(collection(M, "leads/l1/comments")));
await ok("M1a manager moves lead back to new", () => updateDoc(doc(M, "leads/l1"), { status: "new", lostReason: "", ...U("mgr") }));
await no("R10 admin approves held message directly", () => updateDoc(doc(A, "messagesOutbox/mo2"), { status: "queued" }));
await no("R10 admin sets outbox metaTemplate", () => updateDoc(doc(A, "messagesOutbox/mo2"), { metaTemplate: "suseela_x" }));
await no("R10 admin writes settings targetMarginPct", () => updateDoc(doc(A, "settings/business"), { targetMarginPct: 25 }));

// Round 10b — expression-limit stress tests: many allowed fields in ONE write must pass.
await ok("R10b manager edits 20 booking fields at once", () => updateDoc(doc(M, "bookings/bk1"), {
  guestCount: 200, guestCountConfirmed: 190, guestCountActual: 0, kidsCount: 12, travelMinutes: 60,
  serveTime: "13:00", mealType: "lunch", serviceStyle: "banthi", venue: "Kalyana Mandapam", notes: "big event",
  totalAmount: 60000, advancePaid: 10000, pricePerPlate: 300, eventTypeCode: "wedding", status: "Confirmed",
  assignedStaffIds: ["s1"], eventDate: "2026-11-21",
  sessions: [{ id: "s-1", nameTe: "మధ్యాహ్నం", guests: 200, serviceStyle: "banthi" }],
  specialMeals: [{ type: "jain", count: 3 }], ...U("mgr") }));
await no("R10b same mega-edit plus costActual", () => updateDoc(doc(M, "bookings/bk1"), {
  guestCount: 210, kidsCount: 10, travelMinutes: 50, serveTime: "12:30", venue: "Hall B", notes: "x",
  totalAmount: 61000, advancePaid: 11000, pricePerPlate: 305, status: "Confirmed", costActual: { food: 1 }, ...U("mgr") }));
await ok("R10b manager creates booking with 19 fields", () => setDoc(doc(M, "bookings/r10big"), {
  branchId: "b1", createdBy: "mgr", updatedBy: "mgr", customerId: "c1", customerNameSnapshot: "Ravi",
  eventDate: "2026-12-01", eventType: "Wedding", eventTypeCode: "wedding", venue: "Hall", guestCount: 300,
  guestCountConfirmed: 300, kidsCount: 20, status: "Confirmed", serviceStyle: "buffet", mealType: "dinner",
  serveTime: "19:30", travelMinutes: 45, totalAmount: 90000, advancePaid: 20000, pricePerPlate: 300,
  assignedStaffIds: [], notes: "", specialMeals: [{ type: "diabetic", count: 4 }],
  sessions: [{ id: "s-1", guests: 300, serviceStyle: "buffet" }] }));
await ok("R10b staff edits 11 fields of own purchase", () => updateDoc(doc(S1, "purchases/pu1"), {
  subtotal: 900, discount: 10, otherCharges: 20, totalAmount: 910, items: [{ description: "Rice", quantity: 10, unitPrice: 90, amount: 900 }],
  billPhotoUrl: "https://x/y.jpg", staffPhone: "9000000000", notes: "market", vendorNameSnapshot: "Sri Ram Traders",
  costTarget: { type: "booking", bookingId: "bk1", sessionId: "s-1" }, ...U("st1") }));
await ok("R10b staff creates expense with 18 fields", () => setDoc(doc(S1, "expenses/r10big"), {
  branchId: "b1", createdBy: "st1", updatedBy: "st1", isDeleted: false, section: "Transport", subCategory: "Auto",
  personName: "Raju", mobileNumber: "9000000001", quantity: 2, rate: 500, subtotal: 1000, transportCharges: 0,
  setupCharges: 0, otherCharges: 0, totalAmount: 1000, advancePaid: 0, receiptPhotoUrl: "https://x/r.jpg",
  costTarget: { type: "booking", bookingId: "bk1" } }));
await ok("R10b manager edits 15 expense fields", () => updateDoc(doc(M, "expenses/new1"), {
  quantity: 3, rate: 400, subtotal: 1200, totalAmount: 1250, advancePaid: 200, transportCharges: 30,
  setupCharges: 10, otherCharges: 10, mobileNumber: "9000000002", staffPhone: "9000000003",
  receiptPhotoUrl: "https://x/a.jpg", photoUrl: "https://x/b.jpg", notes: "edited",
  costTarget: { type: "overhead", centre: "vehicles" }, ...U("mgr") }));
await ok("R10b manager invoice status + updatedAt + updatedBy", () => updateDoc(doc(M, "invoices/i1"), { status: "Sent", updatedAt: serverTimestamp(), ...U("mgr") }));
await ok("R10b manager edits 8 customer fields", () => updateDoc(doc(M, "customers/c1"), {
  name: "Ravi Kumar", phone: "9876543210", email: "r@x.in", address: "Vizag", notes: "VIP", whatsappOptIn: false,
  updatedAt: serverTimestamp(), ...U("mgr") }));
await ok("R10b manager edits 8 lead fields", () => updateDoc(doc(M, "leads/l1"), {
  name: "Kiran R", phone: "9876500000", source: "instagram", status: "contacted", guests: 250, budget: 75000,
  lostReason: "", ...U("mgr") }));
await ok("R10b manager edits 8 lunch box fields", () => updateDoc(doc(M, "lunchBoxOrders/lb1"), {
  count: 25, pricePerBox: 180, status: "paused", days: ["mon", "wed", "fri"], menuOptionIds: ["d1"],
  deliveryAddress: "IT park gate 2", deliveryTime: "12:30", ...U("mgr") }));

// Round 10c — denial paths kept small; blank-branch edge cases; backfill; null optional fields
const MNB = as("mgrNB");
await no("R10c branchless manager edits branchless booking", () => updateDoc(doc(MNB, "bookings/bkNB"), { notes: "x", ...U("mgrNB") }));
await no("R10c branchless manager edits branchless expense", () => updateDoc(doc(MNB, "expenses/exNB"), { totalAmount: 6, ...U("mgrNB") }));
await no("R10c manager backfills branchId", () => updateDoc(doc(M, "bookings/bkNB"), { branchId: "b1" }));
await ok("R10c admin backfills blank booking branchId", () => updateDoc(doc(A, "bookings/bkNB"), { branchId: "b1" }));
await ok("R10c admin backfills blank expense branchId", () => updateDoc(doc(A, "expenses/exNB"), { branchId: "b1" }));
await no("R10c admin changes branchId after backfill", () => updateDoc(doc(A, "bookings/bkNB"), { branchId: "b2", ...U("admin") }));
await ok("R10c manager clears optional booking fields to null", () => updateDoc(doc(M, "bookings/bk1"), {
  serveTime: null, mealType: null, travelMinutes: null, serviceStyle: null, pricePerPlate: null, ...U("mgr") }));
await no("R10c guestCount as string", () => updateDoc(doc(M, "bookings/bk1"), { guestCount: "200", ...U("mgr") }));
await no("R10c expense amount as string", () => updateDoc(doc(M, "expenses/new1"), { totalAmount: "100", ...U("mgr") }));
await no("R10c staff edits 12 booking fields (not allowed for staff)", () => updateDoc(doc(S1, "bookings/bk1"), {
  guestCount: 220, kidsCount: 5, travelMinutes: 30, serveTime: "11:00", venue: "x", notes: "y", totalAmount: 1,
  advancePaid: 1, pricePerPlate: 1, status: "Confirmed", eventTypeCode: "office", mealType: "lunch", ...U("st1") }));

// Final QA — staff read only their OWN purchases / expenses
await ok("QA staff reads own purchase", () => getDoc(doc(S1, "purchases/pu1")));
await no("QA staff reads other's purchase", () => getDoc(doc(S1, "purchases/puM")));
await ok("QA staff queries own purchases (createdBy ==)", () => getDocs(query(collection(S1, "purchases"), where("createdBy", "==", "st1"))));
await no("QA staff queries branch purchases", () => getDocs(query(collection(S1, "purchases"), where("branchId", "==", "b1"))));
await no("QA staff queries all purchases", () => getDocs(collection(S1, "purchases")));
await no("QA staff queries someone else's purchases", () => getDocs(query(collection(S1, "purchases"), where("createdBy", "==", "mgr"))));
await ok("QA staff reads own expense", () => getDoc(doc(S1, "expenses/new1")));
await no("QA staff reads other's expense", () => getDoc(doc(S1, "expenses/exS2")));
await ok("QA other staff reads own expense", () => getDoc(doc(S2, "expenses/exS2")));
await ok("QA staff queries own expenses (createdBy ==)", () => getDocs(query(collection(S1, "expenses"), where("createdBy", "==", "st1"))));
await no("QA staff queries branch expenses", () => getDocs(query(collection(S1, "expenses"), where("branchId", "==", "b1"))));
await ok("QA manager reads branch purchase by someone else", () => getDoc(doc(M, "purchases/pu1")));
await ok("QA manager queries branch purchases", () => getDocs(query(collection(M, "purchases"), where("branchId", "==", "b1"))));
await ok("QA manager queries branch expenses", () => getDocs(query(collection(M, "expenses"), where("branchId", "==", "b1"))));
await no("QA other-branch manager reads purchase", () => getDoc(doc(M2, "purchases/pu1")));
await no("QA other-branch manager queries b1 expenses", () => getDocs(query(collection(M2, "expenses"), where("branchId", "==", "b1"))));
await ok("QA admin queries all purchases", () => getDocs(collection(A, "purchases")));
await no("QA pending user reads own-branch purchase", () => getDoc(doc(P, "purchases/pu1")));

console.log(`\nRESULT: ${pass} passed, ${fail} failed, ${pass + fail} total`);
await env.cleanup();
process.exit(fail ? 1 : 0);
