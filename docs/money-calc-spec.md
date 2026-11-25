# Money calculation spec

> **Superseded:** the full, current rules are in `docs/calc-spec.md` (GST discount now reduces the taxable value).


Single source of truth for calculations that exist in **two** independently-maintained places:
the Android app (Kotlin, writes straight to Firestore) and the web app's Cloud Functions (TypeScript,
writes via a validated backend call). Any change to a rule below must be made here first, then in
both implementations, in the same change.

Why two implementations exist at all: see `smooth-finding-bird.md` plan, "Consistency risk" section —
Android was not migrated to call these same Cloud Functions as part of this project.

## GST / invoice total

Source of truth today: `app/src/main/java/com/example/suseelacateringcrm/ui/billing/InvoiceGenerateViewModel.kt`
Mirrored in: `functions/src/shared/gstCalc.ts` (added when the Invoices module is built)

```
tax = subtotal * gstRate / 100

if isInterState:
    igst = tax
    cgst = 0
    sgst = 0
else:
    cgst = tax / 2
    sgst = tax / 2
    igst = 0

total = max(0, subtotal + tax - discount)
```

`subtotal` is the sum of invoice line item amounts (`quantity * unitPrice`), derived from the
booking's `menuSnapshot` at invoice-generation time — never accepted as a raw client-submitted number
in the Cloud Function path.

## branchId — immutable after create

Source of truth: `firestore.rules` (`isOwnBranch()`), Kotlin repos (e.g. `BookingRepository.saveBooking`
stamps `branchId` only in the create branch, never in the update branch).

Rule: `branchId` is set once, at document creation, from the branch the creating user is scoped to
(their own branch for staff, the currently-selected branch for admin). It is never present in any
update/edit write path, in either client. Both implementations must never include `branchId` in an
update payload.

## Invoice status transitions

Source of truth: `app/src/main/java/com/example/suseelacateringcrm/data/repository/InvoiceRepository.kt`
(`recordPayment`), `data/model/InvoiceStatus.kt`.

On recording a payment:
```
newPaid = currentPaid + paymentAmount
newBalance = max(0, totalAmount - newPaid)
newStatus =
    PAID            if newBalance <= 0
    PARTIALLY_PAID  else if newPaid > 0
    (unchanged)     otherwise
```
Payment recording must be atomic with the invoice update (a Firestore transaction in both Kotlin and
the future `functions/src/invoices/recordPayment.ts`), so a partial write never leaves the invoice's
`amountPaid`/`balanceDue`/`status` out of sync with its `payments` subcollection.
