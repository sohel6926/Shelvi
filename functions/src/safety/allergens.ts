/**
 * Module 5h — allergen matrix and veg / non-veg separation. Rules: allergenRules.ts. The allergen list lives in
 * settings.allergens (owner, through saveBusinessSettings).
 *  - setFoodTags { kind: "dish" | "grocery", id, foodType, allergens[] }: owner / manager (job role: recipes · edit).
 *    Writes foodType, allergens, foodTagged on dishes / groceryItems (clients cannot write these fields).
 *  - allergenMatrix { bookingId }: owner / manager — every dish of the event (quotation / package dishes and the
 *    booking's menu items) × the owner's allergens, the real veg / non-veg type and what is wrong or not known.
 */
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { callable, ADMIN_MANAGER } from "../shared/callable";
import { FirestoreCollections } from "../shared/firestorePaths";
import { fail } from "../shared/errors";
import { reqId, reqOneOf } from "../shared/validate";
import { asArr, asObj, asStr, Doc } from "../shared/coerce";
import { loadSettings } from "../shared/settings";
import { assertAdminOrOwnBranch } from "../auth/authContext";
import { writeAuditEntry } from "../shared/auditLog";
import { PlanContext, planForBooking } from "../kitchen/eventPlan";
import { MASTER_COLLECTION } from "../masters/masterRules";
import { FoodTags, MatrixDishInput, TaggedPart, kitchenSplit, matrixRow, menuOnlyRow, parseFoodTags, recipeGroceryIds, tagsOf } from "./allergenRules";

export const setFoodTags = callable("setFoodTags", ADMIN_MANAGER, async (data, caller) => {
  const kind = reqOneOf(data, "kind", ["dish", "grocery"] as const);
  const id = reqId(data, "id");
  const settings = await loadSettings();
  const r = parseFoodTags(data, settings.allergens);
  if (!r.ok) fail("invalid-argument", r.te, r.en);
  const tags = (r as { ok: true; value: FoodTags }).value;
  const db = getFirestore();
  const ref = db.collection(kind === "dish" ? FirestoreCollections.DISHES : FirestoreCollections.GROCERY_ITEMS).doc(id);
  const before = await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) fail("not-found", "అది దొరకలేదు.", "It was not found.");
    const cur = s.data() as Doc;
    tx.update(ref, { foodType: tags.foodType, allergens: tags.allergens, foodTagged: true, foodTaggedBy: caller.uid, foodTaggedAt: FieldValue.serverTimestamp() });
    return { foodType: asStr(cur.foodType), allergens: asArr(cur.allergens), foodTagged: cur.foodTagged === true };
  });
  await writeAuditEntry({ uid: caller.uid, role: caller.role, action: "setFoodTags", collection: kind === "dish" ? "dishes" : "groceryItems", docId: id, before, after: { ...tags, foodTagged: true } });
  return { ok: true, ...tags };
});

const nameOf = (d: Doc | null | undefined, fallback: string) => asStr(d?.nameTe) || asStr(d?.nameEn) || asStr(d?.name) || fallback;
const part = (id: string, d: Doc | null | undefined): TaggedPart => ({ id, name: nameOf(d, id), ...tagsOf(d) });
const norm = (s: string) => s.trim().toLowerCase();

export const allergenMatrix = callable("allergenMatrix", ADMIN_MANAGER, async (data, caller) => {
  const bookingId = reqId(data, "bookingId");
  const db = getFirestore();
  const snap = await db.collection(FirestoreCollections.BOOKINGS).doc(bookingId).get();
  if (!snap.exists) fail("not-found", "బుకింగ్ దొరకలేదు.", "Booking not found.");
  const booking = snap.data() as Doc;
  assertAdminOrOwnBranch(caller, asStr(booking.branchId));
  const settings = await loadSettings();
  const ctx = new PlanContext();
  const { plans } = await planForBooking(bookingId, booking, undefined, ctx);

  // Veg-only brand: the booking's brand, else the branch's first brand.
  let brandId = asStr(booking.brandId);
  if (!brandId && asStr(booking.branchId)) {
    const br = await db.collection(MASTER_COLLECTION.branch).doc(asStr(booking.branchId)).get();
    brandId = asArr(asObj(br.data()).brandIds).map((x) => asStr(x))[0] ?? "";
  }
  const brand = brandId ? asObj((await db.collection(MASTER_COLLECTION.brand).doc(brandId).get()).data()) : {};
  const vegOnlyBrand = brand.vegOnly === true ? asStr(brand.name) || "—" : "";

  // Dishes of the event: plan dishes, then menu items matched to a dish by name.
  const dishIds: string[] = [];
  for (const p of plans) for (const d of p.dishes) if (!dishIds.includes(d.dishId)) dishIds.push(d.dishId);
  const menuIds = asArr(booking.menuItemIds).map((x) => asStr(x)).filter((x) => x && !x.includes("/"));
  const menuDocs = menuIds.length ? await db.getAll(...menuIds.map((id) => db.collection(FirestoreCollections.MENU_ITEMS).doc(id))) : [];
  const allDishes = (await db.collection(FirestoreCollections.DISHES).get()).docs.filter((d) => (d.data() as Doc).archived !== true);
  const menuOnly = [];
  for (const m of menuDocs) {
    if (!m.exists) continue;
    const md = m.data() as Doc;
    const names = [asStr(md.name), asStr(md.nameTe)].filter(Boolean).map(norm);
    const hit = allDishes.find((d) => names.includes(norm(asStr((d.data() as Doc).nameEn))) || names.includes(norm(asStr((d.data() as Doc).nameTe))));
    if (hit) {
      if (!dishIds.includes(hit.id)) dishIds.push(hit.id);
    } else menuOnly.push(menuOnlyRow(asStr(md.nameTe) || asStr(md.name) || m.id, md.isVeg !== false, vegOnlyBrand));
  }

  const groceries = new Map((await ctx.groceryMaster()).map((g) => [asStr(g.id), g]));
  const rows = [];
  for (const dishId of dishIds) {
    const dish = await ctx.dish(dishId);
    if (!dish) continue;
    const tree = await ctx.subTree(dishId);
    const baseIds = [...tree.keys()].filter((x) => x !== dishId);
    const groceryIds = new Set<string>();
    for (const id of [dishId, ...baseIds]) for (const g of recipeGroceryIds(tree.get(id) ?? null)) groceryIds.add(g);
    const input: MatrixDishInput = {
      dishId,
      name: nameOf(dish, dishId),
      self: part(dishId, dish),
      bases: baseIds.map((id) => part(id, tree.get(id))),
      ingredients: [...groceryIds].map((id) => part(id, groceries.get(id))),
    };
    rows.push(matrixRow(input, vegOnlyBrand));
  }
  const specialMeals = plans.flatMap((p) => p.part.specialMeals.filter((s) => s.type === "allergy").map((s) => ({ session: p.part.labelTe || p.part.labelEn, count: s.count, note: s.note })));
  // Module 6a: the customer's own allergy note, written on the customer
  const customerSnap = asStr(booking.customerId) ? await db.collection(FirestoreCollections.CUSTOMERS).doc(asStr(booking.customerId)).get() : null;
  const customerAllergyNote = customerSnap?.exists ? asStr((customerSnap.data() as Doc).allergyNote).trim() : "";
  // Module 6a: veg and non-veg are cooked apart — which kitchen of the branch each kind belongs in
  const kitchenDocs = asStr(booking.branchId) ? (await db.collection(MASTER_COLLECTION.kitchen).where("branchId", "==", asStr(booking.branchId)).get()).docs : [];
  const kitchens = kitchenDocs.filter((k) => (k.data() as Doc).status !== "archived" && (k.data() as Doc).status !== "inactive").map((k) => ({ id: k.id, name: asStr((k.data() as Doc).name), vegOnly: (k.data() as Doc).vegOnly === true, nonVegAllowed: (k.data() as Doc).nonVegAllowed !== false }));
  const split = kitchenSplit([...rows, ...menuOnly], kitchens);
  return { allergens: settings.allergens, vegOnlyBrand, rows, menuOnly, specialMeals, customer: asStr(booking.customerNameSnapshot), customerAllergyNote, kitchenSplit: split };
});
