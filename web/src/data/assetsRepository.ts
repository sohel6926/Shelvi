import { addDoc, collection, doc, onSnapshot, query, updateDoc, where, type DocumentData, type Query } from "firebase/firestore";
import { db } from "../firebase";
import { createStamp, updateStamp } from "./audit";
import { cancelInfo, type CancelInfo } from "./cancel";

/**
 * R7-4 vessels / equipment and vehicles. Field names follow docs/security-review.md "Round 7":
 * equipment kind (own | rented), qtyOwned, rentalRate; moves type (issue | return | damaged | lost), qty,
 * bookingId (required), branchId; vehicles ratePerKm; trips bookingId, ratePerKm. Rental / trip costs are
 * worked out by the server (stats triggers), never here.
 */

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const date = (v: unknown): Date | null => {
  const t = v as { toDate?: () => Date } | null;
  return t && typeof t.toDate === "function" ? t.toDate() : v instanceof Date ? v : null;
};

function byBranch(name: string, branchId: string | null): Query<DocumentData> {
  const col = collection(db, name);
  return branchId ? query(col, where("branchId", "==", branchId)) : query(col);
}

// ---------- equipment ----------

export type EquipmentKind = "own" | "rented";

export interface Equipment extends CancelInfo {
  id: string;
  nameTe: string;
  nameEn: string;
  kind: EquipmentKind;
  unit: string;
  qtyOwned: number;
  rentalVendor: string;
  /** Rent per unit per day (rented items). */
  rentalRate: number;
  branchId: string;
}

function toEquipment(id: string, d: DocumentData): Equipment {
  return {
    id,
    nameTe: str(d.nameTe) || str(d.name),
    nameEn: str(d.nameEn) || str(d.name),
    kind: d.kind === "rented" ? "rented" : "own",
    unit: str(d.unit) || "pcs",
    qtyOwned: num(d.qtyOwned),
    rentalVendor: str(d.rentalVendor),
    rentalRate: num(d.rentalRate ?? d.rate),
    branchId: str(d.branchId),
    ...cancelInfo(d),
  };
}

export function subscribeEquipment(branchId: string | null, onData: (rows: Equipment[]) => void, onError?: (e: Error) => void): () => void {
  return onSnapshot(
    byBranch("equipment", branchId),
    (s) => onData(s.docs.map((d) => toEquipment(d.id, d.data())).sort((a, b) => (a.nameEn || a.nameTe).localeCompare(b.nameEn || b.nameTe))),
    (e) => onError?.(e),
  );
}

export type EquipmentInput = Omit<Equipment, "id" | "branchId" | "cancelled" | "cancelReason"> & { id?: string };

export async function saveEquipment(input: EquipmentInput, branchId: string | null): Promise<void> {
  const data = {
    nameTe: input.nameTe,
    nameEn: input.nameEn,
    kind: input.kind,
    unit: input.unit,
    qtyOwned: input.qtyOwned,
    rentalVendor: input.kind === "rented" ? input.rentalVendor : "",
    rentalRate: input.kind === "rented" ? input.rentalRate : 0,
  };
  if (!input.id) {
    if (!branchId) throw new Error("Select a branch first");
    await addDoc(collection(db, "equipment"), { ...data, branchId, ...createStamp() });
  } else {
    await updateDoc(doc(db, "equipment", input.id), { ...data, ...updateStamp() });
  }
}

export const MOVE_TYPES = ["issue", "return", "damaged", "lost"] as const;
export type MoveType = (typeof MOVE_TYPES)[number];

export interface EquipmentMove {
  id: string;
  equipmentId: string;
  type: MoveType;
  qty: number;
  bookingId: string;
  sessionId: string;
  date: Date | null;
  note: string;
  branchId: string;
  /** 🔒 server (rented items: qty × rate × days; damage). */
  rentalCost: number | null;
  damageCost: number | null;
}

function toMove(id: string, d: DocumentData): EquipmentMove {
  return {
    id,
    equipmentId: str(d.equipmentId),
    type: (MOVE_TYPES as readonly string[]).includes(d.type) ? (d.type as MoveType) : "issue",
    qty: num(d.qty),
    bookingId: str(d.bookingId),
    sessionId: str(d.sessionId),
    date: date(d.date) ?? date(d.createdAt),
    note: str(d.note),
    branchId: str(d.branchId),
    rentalCost: typeof d.rentalCost === "number" ? d.rentalCost : null,
    damageCost: typeof d.damageCost === "number" ? d.damageCost : null,
  };
}

/** Managers must filter by branch (rules). Pass bookingId to read one event's moves. */
export function subscribeEquipmentMoves(
  branchId: string | null,
  onData: (rows: EquipmentMove[]) => void,
  onError?: (e: Error) => void,
  bookingId?: string,
): () => void {
  const col = collection(db, "equipmentMoves");
  const clauses = [
    ...(branchId ? [where("branchId", "==", branchId)] : []),
    ...(bookingId ? [where("bookingId", "==", bookingId)] : []),
  ];
  return onSnapshot(
    query(col, ...clauses),
    (s) => onData(s.docs.map((d) => toMove(d.id, d.data())).sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))),
    (e) => onError?.(e),
  );
}

export interface MoveInput {
  equipmentId: string;
  equipmentName: string;
  type: MoveType;
  qty: number;
  bookingId: string;
  sessionId: string;
  date: Date;
  note: string;
}

export async function addEquipmentMove(input: MoveInput, branchId: string): Promise<void> {
  await addDoc(collection(db, "equipmentMoves"), {
    equipmentId: input.equipmentId,
    equipmentName: input.equipmentName,
    type: input.type,
    qty: input.qty,
    bookingId: input.bookingId,
    sessionId: input.sessionId,
    date: input.date,
    note: input.note,
    branchId,
    ...createStamp(),
  });
}

/** Outstanding per booking per item = issued − returned − damaged − lost (contract R7-4). */
export function outstanding(moves: EquipmentMove[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const m of moves) {
    if (!m.bookingId) continue;
    const per = out.get(m.bookingId) ?? new Map<string, number>();
    const sign = m.type === "issue" ? 1 : -1;
    per.set(m.equipmentId, (per.get(m.equipmentId) ?? 0) + sign * m.qty);
    out.set(m.bookingId, per);
  }
  return out;
}

// ---------- vehicles ----------

export const EXPIRY_FIELDS = ["insuranceExpiry", "fitnessExpiry", "pollutionExpiry", "driverLicenseExpiry"] as const;
export type ExpiryField = (typeof EXPIRY_FIELDS)[number];

export interface Vehicle extends CancelInfo {
  id: string;
  number: string;
  type: string;
  kind: EquipmentKind;
  driver: string;
  driverPhone: string;
  ratePerKm: number;
  insuranceExpiry: Date | null;
  fitnessExpiry: Date | null;
  pollutionExpiry: Date | null;
  driverLicenseExpiry: Date | null;
  branchId: string;
}

function toVehicle(id: string, d: DocumentData): Vehicle {
  return {
    id,
    number: str(d.number),
    type: str(d.type),
    kind: d.kind === "rented" ? "rented" : "own",
    driver: str(d.driver) || str(d.driverName),
    driverPhone: str(d.driverPhone),
    ratePerKm: num(d.ratePerKm),
    insuranceExpiry: date(d.insuranceExpiry),
    fitnessExpiry: date(d.fitnessExpiry),
    pollutionExpiry: date(d.pollutionExpiry),
    driverLicenseExpiry: date(d.driverLicenseExpiry),
    branchId: str(d.branchId),
    ...cancelInfo(d),
  };
}

export function subscribeVehicles(branchId: string | null, onData: (rows: Vehicle[]) => void, onError?: (e: Error) => void): () => void {
  return onSnapshot(
    byBranch("vehicles", branchId),
    (s) => onData(s.docs.map((d) => toVehicle(d.id, d.data())).sort((a, b) => a.number.localeCompare(b.number))),
    (e) => onError?.(e),
  );
}

export type VehicleInput = Omit<Vehicle, "id" | "branchId" | "cancelled" | "cancelReason"> & { id?: string };

export async function saveVehicle(input: VehicleInput, branchId: string | null): Promise<void> {
  const data = {
    number: input.number,
    type: input.type,
    kind: input.kind,
    driver: input.driver,
    driverPhone: input.driverPhone,
    ratePerKm: input.ratePerKm,
    insuranceExpiry: input.insuranceExpiry,
    fitnessExpiry: input.fitnessExpiry,
    pollutionExpiry: input.pollutionExpiry,
    driverLicenseExpiry: input.driverLicenseExpiry,
  };
  if (!input.id) {
    if (!branchId) throw new Error("Select a branch first");
    await addDoc(collection(db, "vehicles"), { ...data, branchId, ...createStamp() });
  } else {
    await updateDoc(doc(db, "vehicles", input.id), { ...data, ...updateStamp() });
  }
}

/** Days until a date (negative = already past). */
export function daysUntil(d: Date | null): number | null {
  if (!d) return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / 86_400_000);
}

export interface VehicleTrip {
  id: string;
  vehicleId: string;
  bookingId: string;
  date: Date | null;
  kmStart: number | null;
  kmEnd: number | null;
  fuelCost: number;
  ratePerKm: number;
  note: string;
  branchId: string;
}

function toTrip(id: string, d: DocumentData): VehicleTrip {
  return {
    id,
    vehicleId: str(d.vehicleId),
    bookingId: str(d.bookingId),
    date: date(d.date) ?? date(d.createdAt),
    kmStart: typeof d.kmStart === "number" ? d.kmStart : null,
    kmEnd: typeof d.kmEnd === "number" ? d.kmEnd : null,
    fuelCost: num(d.fuelCost),
    ratePerKm: num(d.ratePerKm),
    note: str(d.note),
    branchId: str(d.branchId),
  };
}

export function subscribeTrips(branchId: string | null, onData: (rows: VehicleTrip[]) => void, onError?: (e: Error) => void): () => void {
  return onSnapshot(
    byBranch("vehicleTrips", branchId),
    (s) => onData(s.docs.map((d) => toTrip(d.id, d.data())).sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))),
    (e) => onError?.(e),
  );
}

export interface TripInput {
  vehicleId: string;
  vehicleNumber: string;
  bookingId: string;
  date: Date;
  kmStart: number | null;
  kmEnd: number | null;
  fuelCost: number;
  ratePerKm: number;
  note: string;
}

export async function addTrip(input: TripInput, branchId: string): Promise<void> {
  await addDoc(collection(db, "vehicleTrips"), { ...input, branchId, ...createStamp() });
}
