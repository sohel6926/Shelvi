import {
  addDoc,
  collection,
  doc,
  type DocumentData,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { cancelInfo, type CancelInfo } from "./cancel";
import { createStamp, updateStamp } from "./audit";

/** Mirrors data/model/Customer.kt */
export interface Customer extends CancelInfo {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  /** Module 6a: what the customer or their guests cannot eat (written by staff; shown on the allergen sheet) */
  allergyNote: string;
  /** R10-8: customer agreed to WhatsApp messages. The server trigger (optInOnCustomer) stamps when / who. */
  whatsappOptIn: boolean;
  /** 🔒 whatsappOptInAt / whatsappOptOutAt (server); older docs may carry optInAt. */
  optInAt: Date | null;
  optOutAt: Date | null;
}

export interface CustomerInput {
  id?: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  allergyNote?: string;
  whatsappOptIn: boolean;
}

const customersCol = collection(db, "customers");

function toCustomer(id: string, data: DocumentData): Customer {
  return {
    id,
    name: data.name ?? "",
    phone: data.phone ?? "",
    email: data.email ?? "",
    address: data.address ?? "",
    notes: data.notes ?? "",
    allergyNote: data.allergyNote ?? "",
    whatsappOptIn: data.whatsappOptIn === true,
    optInAt: data.whatsappOptInAt?.toDate ? data.whatsappOptInAt.toDate() : data.optInAt?.toDate ? data.optInAt.toDate() : null,
    optOutAt: data.whatsappOptOutAt?.toDate ? data.whatsappOptOutAt.toDate() : null,
    ...cancelInfo(data),
  };
}

export function subscribeCustomers(onData: (customers: Customer[]) => void): () => void {
  const q = query(customersCol, orderBy("name"));
  return onSnapshot(q, (snap) => onData(snap.docs.map((d) => toCustomer(d.id, d.data()))));
}

export async function getCustomer(id: string): Promise<Customer | null> {
  const snap = await getDoc(doc(db, "customers", id));
  return snap.exists() ? toCustomer(snap.id, snap.data()) : null;
}

/** Mirrors CustomerRepository.kt's saveCustomer — write-map shape kept identical for cross-client consistency. */
export async function saveCustomer(input: CustomerInput, createdBy: string): Promise<void> {
  const data = {
    name: input.name,
    phone: input.phone,
    email: input.email,
    address: input.address,
    notes: input.notes,
    ...(input.allergyNote !== undefined ? { allergyNote: input.allergyNote } : {}),
    // R10-8: only the tick; the server trigger stamps whatsappOptInAt/By or whatsappOptOutAt/By on a change.
    whatsappOptIn: input.whatsappOptIn,
  };
  if (!input.id) {
    await addDoc(customersCol, {
      ...data,
      ...createStamp(),
      createdBy,
    });
  } else {
    await updateDoc(doc(db, "customers", input.id), { ...data, ...updateStamp() });
  }
}
