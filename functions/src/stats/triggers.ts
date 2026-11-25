import { REGION } from "../setup";
import { onDocumentWritten, Change, FirestoreEvent } from "firebase-functions/v2/firestore";
import { DocumentSnapshot } from "firebase-admin/firestore";
import { Doc } from "../shared/coerce";
import { recomputeDays } from "./recompute";
import { recomputeBookingCost } from "./bookingCost";
import { affectedBookings, affectedDays } from "./affected";

export { affectedBookings, affectedDays };

type WriteEvent = FirestoreEvent<Change<DocumentSnapshot> | undefined, Record<string, string>>;

function statsTrigger(document: string, fields: string[], bookingLinked = true) {
  return onDocumentWritten({ document, region: REGION }, async (event: WriteEvent) => {
    const before = event.data?.before?.exists ? (event.data.before.data() as Doc) : undefined;
    const after = event.data?.after?.exists ? (event.data.after.data() as Doc) : undefined;
    const days = fields.length ? affectedDays(before, after, fields) : [];
    if (days.length) await recomputeDays(days);
    if (bookingLinked) for (const b of affectedBookings(before, after)) await recomputeBookingCost(b);
  });
}

// Recompute the affected day + month from the source collections (idempotent; no increments).
export const statsOnInvoice = statsTrigger("invoices/{invoiceId}", ["issueDate"]);
export const statsOnPayment = statsTrigger("invoices/{invoiceId}/payments/{paymentId}", ["date"], false);
export const statsOnExpense = statsTrigger("expenses/{expenseId}", ["serviceDate"]);
export const statsOnPurchase = statsTrigger("purchases/{purchaseId}", ["purchaseDate"]);
export const statsOnAdSpend = statsTrigger("adSpend/{adSpendId}", ["date"]);
export const statsOnAttendance = statsTrigger("attendance/{attendanceId}", ["date"]);
export const statsOnBooking = statsTrigger("bookings/{bookingId}", ["eventDate", "createdAt", "cancelledAt"], false);
// Event cost only (no day stats): vehicle trips and equipment moves linked to a booking.
export const costOnVehicleTrip = statsTrigger("vehicleTrips/{tripId}", []);
export const costOnEquipmentMove = statsTrigger("equipmentMoves/{moveId}", []);
// R7-6: outside orders count as food on their `date` and as event cost.
export const statsOnOutsideOrder = statsTrigger("outsideOrders/{orderId}", ["date"]);
