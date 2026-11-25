// Test mode only: fills the LOCAL Firebase emulators with a demo owner, the 10 menus and a little demo data.
// Run: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 NODE_PATH=functions/node_modules node tools/seed-emulator.cjs
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error("Refusing to run: emulator not set (this must never touch the real project)."); process.exit(1); }
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const fs = require("fs");
initializeApp({ projectId: "demo-suseela" });
const auth = getAuth(), db = getFirestore();
(async () => {
  const email = "owner@suseela.test", password = "Suseela@2026";
  let user;
  try { user = await auth.getUserByEmail(email); } catch { user = await auth.createUser({ email, password, displayName: "Sainadh (Owner)" }); }
  const now = FieldValue.serverTimestamp();
  // merge: a restart must not wipe what the masters page added to the branch (companyId, brandIds, code).
  await db.doc("branches/main").set({ name: "Main Kitchen – Hyderabad", active: true, createdAt: now }, { merge: true });
  await db.doc(`users/${user.uid}`).set({ name: "Sainadh (Owner)", email, phone: "9966649469", role: "admin", active: true, branchId: "main", createdAt: now });
  // Test Mode only: a second login with a business role, to see the menu narrow (same test password as the owner).
  const email2 = "accountant@suseela.test";
  let user2;
  try { user2 = await auth.getUserByEmail(email2); } catch { user2 = await auth.createUser({ email: email2, password, displayName: "Test Accountant" }); }
  await db.doc(`users/${user2.uid}`).set({ name: "Test Accountant", email: email2, phone: "9000000099", role: "manager", jobRole: "accountant", active: true, branchId: "main", createdAt: now });
  await db.doc("settings/business").set({
    name: "Suseela Caterings", phone: "9966649469", ownerPhone: "9966649469", address: "Hyderabad, Telangana",
    fssaiNumber: "", gstin: "", gstRegistered: false, defaultGstRate: 0, profitMarginPct: 25,
    monthlyPayRules: { deductAbsences: false, freeLeaves: 0, overtime: false },
    calcModes: { quotation: "auto", invoice: "auto", attendancePay: "auto", payroll: "auto", cooking: "auto", targets: "auto" },
    managerCanOverride: true, updatedAt: now,
  }, { merge: true });
  const seed = JSON.parse(fs.readFileSync("data/seed/menus.json", "utf8"));
  for (const m of seed.menus) {
    const { transportExtra, groups, ...rest } = m;
    await db.doc(`menuPackages/${m.code}`).set({ ...rest, groups: groups.map((options) => ({ options })), transportCharged: transportExtra !== false, active: true, branchId: "main", createdBy: user.uid, createdAt: now });
  }
  const custs = [["రమేష్ (demo)", "9000000001"], ["లక్ష్మి (demo)", "9000000002"]];
  for (const [i, [name, phone]] of custs.entries()) await db.doc(`customers/demo-c${i + 1}`).set({ name, phone, email: "", address: "Hyderabad", notes: "Test mode demo", whatsappOptIn: true, createdBy: user.uid, branchId: "main", createdAt: now, updatedAt: now });
  const staff = [["రాము (cook)", "Cook", "monthly", 13000, 0], ["సీత (helper)", "Helper", "daily", 0, 800]];
  for (const [i, [name, jobRole, payType, monthlySalary, dailyWage]] of staff.entries()) await db.doc(`staff/demo-s${i + 1}`).set({ name, phone: `90000001${i}0`, jobRole, payType, monthlySalary, dailyWage, active: true, linkedUserId: "", branchId: "main", createdAt: now });
  const dishes = [["pulihora", "పులిహోర / అన్నం (బియ్యం)", "Pulihora / rice (raw rice)", "kg", 18], ["dal", "ముద్దపప్పు (కందిపప్పు)", "Muddapappu (toor dal)", "kg", 10], ["curry", "కూర (కూరగాయలు)", "Curry (vegetables)", "kg", 20], ["sambar", "సాంబారు", "Sambar", "L", 15], ["curd", "పెరుగు", "Curd", "kg", 10], ["bobbatlu", "బొబ్బట్లు", "Bobbatlu", "pcs", 200]];
  // Round 8: dish category + role (role "flavoured-rice" for pulihora / biryani; §13.5 comboKey uses main roles).
  const dishMeta = { pulihora: ["rice", "flavoured-rice"], dal: ["dal", "side"], curry: ["curry", "side"], sambar: ["liquid", "side"], curd: ["other", "side"], bobbatlu: ["sweet", "sweet"] };
  for (const [id, nameTe, nameEn, unit, basePer100] of dishes) await db.doc(`dishes/${id}`).set({ nameTe, nameEn, unit, basePer100, category: dishMeta[id][0], role: dishMeta[id][1], variants: [], startRules: [], createdAt: now });
  // Round 8 demo: 3 completed demo events with a pulihora cook log (+ ingredients) → "నేర్చుకుంటోంది 3/5" in test mode.
  // History lines are written here too so it works without the functions emulator (the server recomputes when it runs).
  const demoEvents = [["demo-ev1", "2026-10-05", 120, 22, 2, 2.6], ["demo-ev2", "2026-10-12", 200, 37, 3, 4.4], ["demo-ev3", "2026-10-19", 180, 33, 3, 3.9]];
  const eatens = [];
  for (const [bid, day, guests, cooked, leftover, riceUsed] of demoEvents) {
    const eventAt = new Date(`${day}T06:30:00Z`);
    const band = guests <= 150 ? "S" : guests <= 400 ? "M" : guests <= 800 ? "L" : "XL";
    await db.doc(`bookings/${bid}`).set({ customerId: "demo-c1", customerNameSnapshot: "రమేష్ (demo)", eventDate: eventAt, eventType: "Wedding", eventTypeCode: "wedding", serviceStyle: "banthi", venue: "Demo hall", guestCount: guests, guestCountActual: guests, status: "Completed", assignedStaffIds: ["demo-s1"], branchId: "main", createdBy: user.uid, createdAt: now, updatedAt: now });
    const line = { dishId: "pulihora", variantId: "", sessionId: "", unit: "kg", cooked, leftover, guests, band, serviceStyle: "banthi", comboKey: "flavoured-rice", ingredients: { "sona-masoori-biyyam": riceUsed }, eventAt, branchId: "main", recordedBy: user.uid, recordedAt: now };
    await db.doc(`bookings/${bid}/cookLog/pulihora`).set(line);
    await db.doc(`dishes/pulihora/history/${bid}__pulihora`).set({ ...line, bookingId: bid, eventTypeCode: "wedding", updatedAt: now });
    eatens.push(((cooked - leftover) / guests) * 100);
  }
  const per100 = eatens.reduce((a, b) => a + b, 0) / eatens.length;
  await db.doc("dishes/pulihora").set({ learned: { per100, eventsUsed: 3, status: "learning", advice: "ok", changePct: 0, byBand: {}, byCell: {}, factors: { band: {}, style: {}, combo: {} }, variants: {} } }, { merge: true });
  // Demo stock items (6) — linked below to the matching grocery-master items.
  const groc = [["rice", "బియ్యం", "Rice", "kg"], ["toordal", "కందిపప్పు", "Toor dal", "kg"], ["oil", "నూనె", "Oil", "L"], ["veg", "కూరగాయలు", "Vegetables", "kg"], ["curd", "పెరుగు", "Curd", "kg"], ["sugar", "చక్కెర", "Sugar", "kg"]];
  const stock = { rice: 150, toordal: 60, oil: 40, veg: 30, curd: 50, sugar: 20 };
  for (const [id, nameTe, nameEn, unit] of groc) {
    await db.doc(`inventory/demo-${id}`).set({ name: `${nameTe} / ${nameEn}`, unit, quantityInStock: stock[id], reorderLevel: Math.round(stock[id] / 5), category: "Groceries", branchId: "main", createdBy: user.uid, lastUpdated: now }, { merge: true });
  }
  // Grocery master (data/seed/grocery-items.json): same merge as the web "జాబితా load చేయి" button —
  // create missing items, refresh items still marked source "seed", never touch owner-edited ones.
  const master = JSON.parse(fs.readFileSync("data/seed/grocery-items.json", "utf8"));
  const existing = new Map((await db.collection("groceryItems").get()).docs.map((d) => [d.id, d.data()]));
  let batch = db.batch(), ops = 0, created = 0, refreshed = 0;
  for (const it of master.items) {
    const ex = existing.get(it.id);
    const fields = { nameTe: it.nameTe, nameEn: it.nameEn, nameRoman: it.nameRoman, module: it.module, group: it.group, unit: it.unit, purchaseUnits: it.purchaseUnits, aliases: it.aliases, seedVersion: master.version };
    const ref = db.doc(`groceryItems/${it.id}`);
    if (!ex) { batch.set(ref, { ...fields, per100: it.per100, inventoryItemId: null, source: "seed", createdBy: user.uid, createdAt: now }); created++; }
    else if (ex.source === "seed") { batch.update(ref, { ...fields, ...(ex.per100 == null ? { per100: it.per100 } : {}), updatedAt: now }); refreshed++; }
    else continue;
    if (++ops >= 400) { await batch.commit(); batch = db.batch(); ops = 0; }
  }
  if (ops) await batch.commit();
  // Keep the 6 demo stock links on the master items; remove the old 6 demo grocery docs.
  const demoLinks = { rice: "sona-masoori-biyyam", toordal: "kandi-pappu", oil: "sunflower-noone", veg: "kuragayalu-mottam", curd: "perugu", sugar: "panchadara" };
  for (const [oldId, masterId] of Object.entries(demoLinks)) {
    const ref = db.doc(`groceryItems/${masterId}`);
    const snap = await ref.get();
    if (snap.exists && !snap.data().inventoryItemId) await ref.update({ inventoryItemId: `demo-${oldId}` });
    if (existing.has(oldId)) await db.doc(`groceryItems/${oldId}`).delete();
  }
  console.log("grocery master", { items: master.items.length, created, refreshed });
  console.log("seeded", { email, password, menus: seed.menus.length });
})().catch((e) => { console.error(e); process.exit(1); });
