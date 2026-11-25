import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import { useBranch } from "../../session/BranchContext";
import { useLang } from "../../i18n/LanguageContext";
import { useSession } from "../../auth/AuthProvider";
import { cancelGoodsReceipt, cancelPurchaseOrder, cancelPurchaseRequest, closePurchaseOrder, releaseBillHold, saveVendorBill, decidePurchaseOrder, decidePurchaseRequest, errorText, receiveGoods, savePurchaseOrder, savePurchaseRequest } from "../../data/functions";
import { PO_STATUS_LABEL, PR_STATUS_LABEL, linesTotal, subscribeGoodsReceipts, subscribeHeldBills, type HeldBill, subscribePurchaseOrders, subscribePurchaseRequests, type GoodsReceipt, type ProcureViewer, type PurchaseOrder, type PurchaseRequest } from "../../data/procureRepository";
import { subscribeVendors, type Vendor } from "../../data/records";
import { FIXED_UOMS, useBusinessSettings } from "../../data/settingsRepository";
import { DataTable, PageHeader, StatCard, StatRow } from "../../components/DataTable";
import { formatINR } from "../../util/format";

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const num = (t: string) => (t.trim() === "" ? NaN : Number(t.replace(/,/g, "")));

type DraftLine = { description: string; qty: string; unit: string; rate: string; inventoryItemId: string; groceryItemId: string };
const emptyLine = (unit: string): DraftLine => ({ description: "", qty: "", unit, rate: "", inventoryItemId: "", groceryItemId: "" });

/** Lines editor shared by the request and the order (the order also asks for a rate). */
function LinesEditor({ lines, setLines, units, withRate }: { lines: DraftLine[]; setLines: (l: DraftLine[]) => void; units: string[]; withRate: boolean }) {
  const { L } = useLang();
  const set = (i: number, patch: Partial<DraftLine>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <Box sx={{ display: "grid", gap: 1 }}>
      {lines.map((l, i) => (
        <Box key={i} sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr 1fr", sm: withRate ? "3fr 1fr 1.2fr 1fr auto" : "3fr 1fr 1.2fr auto" }, alignItems: "center" }}>
          <TextField size="small" label={L("వస్తువు", "Item")} value={l.description} onChange={(e) => set(i, { description: e.target.value })} />
          <TextField size="small" label={L("పరిమాణం", "Quantity")} value={l.qty} onChange={(e) => set(i, { qty: e.target.value })} slotProps={{ htmlInput: { inputMode: "decimal" } }} />
          <TextField select size="small" label={L("కొలత", "Unit")} value={l.unit} onChange={(e) => set(i, { unit: e.target.value })}>
            {(units.includes(l.unit) ? units : [l.unit, ...units]).map((u) => (
              <MenuItem key={u} value={u}>
                {u}
              </MenuItem>
            ))}
          </TextField>
          {withRate && <TextField size="small" label={L("ధర ₹ (ఒక కొలతకి)", "Rate ₹ (per unit)")} value={l.rate} onChange={(e) => set(i, { rate: e.target.value })} slotProps={{ htmlInput: { inputMode: "decimal" } }} />}
          <IconButton aria-label={L("ఈ వస్తువు తీసేయి", "Remove this item")} onClick={() => setLines(lines.filter((_, j) => j !== i))} disabled={lines.length === 1}>
            <DeleteIcon />
          </IconButton>
        </Box>
      ))}
      <Box>
        <Button size="small" startIcon={<AddIcon />} onClick={() => setLines([...lines, emptyLine(units[0] ?? "Kg")])}>
          {L("ఇంకో వస్తువు", "Another item")}
        </Button>
      </Box>
    </Box>
  );
}

const linesValid = (lines: DraftLine[], withRate: boolean) =>
  lines.length > 0 && lines.every((l) => l.description.trim() !== "" && num(l.qty) > 0 && l.unit !== "" && (!withRate || num(l.rate) > 0));
const toInput = (lines: DraftLine[], withRate: boolean) =>
  lines.map((l) => ({
    description: l.description.trim(),
    qty: num(l.qty),
    unit: l.unit,
    ...(withRate ? { rate: num(l.rate) } : {}),
    ...(l.inventoryItemId ? { inventoryItemId: l.inventoryItemId } : {}),
    ...(l.groceryItemId ? { groceryItemId: l.groceryItemId } : {}),
  }));

function RequestDialog({ branchId, units, onClose }: { branchId: string | null; units: string[]; onClose: () => void }) {
  const { L, lang } = useLang();
  const [neededBy, setNeededBy] = useState(todayIso());
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine(units[0] ?? "Kg")]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = neededBy >= todayIso() && linesValid(lines, false);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await savePurchaseRequest({ neededBy, ...(note.trim() ? { note: note.trim() } : {}), ...(branchId ? { branchId } : {}), lines: toInput(lines, false) });
      onClose();
    } catch (e) {
      setError(errorText(e, lang));
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{L("కొత్త కొనుగోలు అభ్యర్థన", "New purchase request")}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
        <TextField size="small" type="date" label={L("ఎప్పటికి కావాలి", "Needed by")} value={neededBy} onChange={(e) => setNeededBy(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} sx={{ maxWidth: 220 }} />
        <LinesEditor lines={lines} setLines={setLines} units={units} withRate={false} />
        <TextField size="small" label={L("గమనిక (ఐచ్ఛికం)", "Note (optional)")} value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={2} />
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{L("వద్దు", "Cancel")}</Button>
        <Button variant="contained" onClick={save} disabled={!valid || busy}>
          {L("అభ్యర్థన పంపు", "Send request")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** New order (optionally from an approved request), or changing one that is not approved yet. */
function OrderDialog({ order, from, branchId, units, vendors, isAdmin, managerLimit, approvalOn, onClose }: {
  order: PurchaseOrder | null;
  from: PurchaseRequest | null;
  branchId: string | null;
  units: string[];
  vendors: Vendor[];
  isAdmin: boolean;
  managerLimit: number;
  approvalOn: boolean;
  onClose: () => void;
}) {
  const { L, lang } = useLang();
  const seed = order?.lines ?? from?.lines ?? [];
  const [vendorId, setVendorId] = useState(order?.vendorId ?? "");
  const [expectedDay, setExpectedDay] = useState(order?.expectedDay && order.expectedDay >= todayIso() ? order.expectedDay : from?.neededBy && from.neededBy >= todayIso() ? from.neededBy : todayIso());
  const [terms, setTerms] = useState(order?.terms ?? "");
  const [lines, setLines] = useState<DraftLine[]>(
    seed.length
      ? seed.map((l) => ({ description: l.description, qty: String(l.qty), unit: l.unit, rate: l.rate > 0 ? String(l.rate) : "", inventoryItemId: l.inventoryItemId, groceryItemId: l.groceryItemId }))
      : [emptyLine(units[0] ?? "Kg")],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = linesTotal(lines.map((l) => ({ qty: num(l.qty) || 0, rate: num(l.rate) || 0 })));
  const valid = vendorId !== "" && expectedDay >= todayIso() && linesValid(lines, true);
  const waits = !isAdmin && approvalOn && total > managerLimit;
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await savePurchaseOrder({
        ...(order ? { id: order.id } : {}),
        vendorId,
        expectedDay,
        ...(terms.trim() ? { terms: terms.trim() } : {}),
        ...(!order && from ? { prId: from.id } : {}),
        ...(!order && branchId ? { branchId } : {}),
        lines: toInput(lines, true),
      });
      onClose();
    } catch (e) {
      setError(errorText(e, lang));
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{order ? L(`ఆర్డర్ ${order.number} మార్చు`, `Change order ${order.number}`) : from ? L(`అభ్యర్థన ${from.number} నుంచి ఆర్డర్`, `Order from request ${from.number}`) : L("కొత్త కొనుగోలు ఆర్డర్", "New purchase order")}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "2fr 1fr" } }}>
          <TextField select size="small" label={L("సరఫరాదారు", "Vendor")} value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
            {vendors.map((v) => (
              <MenuItem key={v.id} value={v.id}>
                {v.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField size="small" type="date" label={L("సరుకు రావలసిన తేదీ", "Expected delivery")} value={expectedDay} onChange={(e) => setExpectedDay(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        </Box>
        {vendors.length === 0 && <Alert severity="info">{L("ముందు సరఫరాదారుల పేజీలో సరఫరాదారుని చేర్చండి.", "Add the vendor on the Vendors page first.")}</Alert>}
        <LinesEditor lines={lines} setLines={setLines} units={units} withRate />
        <Typography sx={{ fontWeight: 600 }}>{L(`మొత్తం: ${formatINR(total)}`, `Total: ${formatINR(total)}`)}</Typography>
        {waits && <Alert severity="warning">{L(`ఈ మొత్తం మీ పరిమితి ${formatINR(managerLimit)} దాటింది — యజమాని ఆమోదం తర్వాతే ఆర్డర్ చెల్లుతుంది.`, `This total is above your limit of ${formatINR(managerLimit)} — the order counts only after the owner approves it.`)}</Alert>}
        <TextField size="small" label={L("షరతులు (ఐచ్ఛికం)", "Terms (optional)")} value={terms} onChange={(e) => setTerms(e.target.value)} multiline minRows={2} />
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{L("వద్దు", "Cancel")}</Button>
        <Button variant="contained" onClick={save} disabled={!valid || busy}>
          {L("ఆర్డర్ సేవ్ చేయి", "Save order")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Module 3b: what came for an approved order — delivered and accepted per line; the rest is counted as sent back. */
function ReceiveDialog({ order, onClose, onDone }: { order: PurchaseOrder; onClose: () => void; onDone: (message: string) => void }) {
  const { L, lang } = useLang();
  const due = order.lines.map((l, i) => Math.max(0, Math.round((l.qty - (order.receivedQty[i] ?? 0)) * 1000) / 1000));
  const [rows, setRows] = useState(order.lines.map((_, i) => ({ delivered: due[i] > 0 ? String(due[i]) : "", accepted: due[i] > 0 ? String(due[i]) : "", reason: "", expiryDay: "", batchNo: "" })));
  const [receiveDay, setReceiveDay] = useState(todayIso());
  const [billNo, setBillNo] = useState("");
  const [note, setNote] = useState("");
  // Module 6a: which store the goods go into ("" = each item's normal store, as before)
  const [storeId, setStoreId] = useState("");
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (!order.branchId) return;
    return onSnapshot(
      query(collection(db, "stores"), where("branchId", "==", order.branchId)),
      (snap) => setStores(snap.docs.filter((d) => !["archived", "inactive"].includes(String(d.data().status ?? "active")) && d.data().issueBlocked !== true).map((d) => ({ id: d.id, name: String(d.data().name ?? d.id) }))),
      () => setStores([]),
    );
  }, [order.branchId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (i: number, patch: Partial<(typeof rows)[number]>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const parsed = rows.map((r, i) => {
    const delivered = r.delivered.trim() === "" ? 0 : num(r.delivered);
    const accepted = r.accepted.trim() === "" ? 0 : num(r.accepted);
    const back = Math.round((delivered - accepted) * 1000) / 1000;
    const ok = delivered >= 0 && accepted >= 0 && accepted <= delivered && accepted <= due[i] && (back === 0 || r.reason.trim() !== "");
    return { delivered, accepted, back, ok };
  });
  const valid = receiveDay <= todayIso() && parsed.every((p) => p.ok) && parsed.some((p) => p.delivered > 0);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await receiveGoods({
        poId: order.id,
        receiveDay,
        ...(billNo.trim() ? { vendorBillNo: billNo.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(storeId ? { storeId } : {}),
        lines: parsed
          .map((p, i) => ({ line: i, delivered: p.delivered, accepted: p.accepted, ...(p.back > 0 ? { rejectReason: rows[i].reason.trim() } : {}), ...(rows[i].expiryDay ? { expiryDay: rows[i].expiryDay, ...(rows[i].batchNo.trim() ? { batchNo: rows[i].batchNo.trim() } : {}) } : {}) }))
          .filter((l) => l.delivered > 0),
      });
      const skipped = res.stockSkipped.map((x) => (lang === "te" ? x.te : x.en)).join("; ");
      onDone(L(`రసీదు ${res.number} నమోదైంది.`, `Receipt ${res.number} recorded.`) + (skipped ? " " + L(`Stock మార్చనివి — చేతితో సరిచేయండి: ${skipped}`, `Stock not changed — adjust by hand: ${skipped}`) : ""));
      onClose();
    } catch (e) {
      setError(errorText(e, lang));
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{L(`సరుకు రసీదు — ఆర్డర్ ${order.number} (${order.vendorName})`, `Goods receipt — order ${order.number} (${order.vendorName})`)}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
          <TextField size="small" type="date" label={L("సరుకు అందిన తేదీ", "Received on")} value={receiveDay} onChange={(e) => setReceiveDay(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" label={L("సరఫరాదారు బిల్ / చలాన్ నంబర్ (ఐచ్ఛికం)", "Vendor bill / challan no. (optional)")} value={billNo} onChange={(e) => setBillNo(e.target.value)} />
        </Box>
        {stores.length > 1 && (
          <TextField select size="small" label={L("ఏ స్టోర్‌లోకి (ఖాళీ = వస్తువు సాధారణ స్టోర్)", "Into which store (blank = the item's normal store)")} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            <MenuItem value="">{L("— సాధారణ స్టోర్ —", "— normal store —")}</MenuItem>
            {stores.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.name}
              </MenuItem>
            ))}
          </TextField>
        )}
        {order.lines.map((l, i) => (
          <Box key={i} sx={{ display: "grid", gap: 1, p: 1.5, border: 1, borderColor: "divider", borderRadius: 1 }}>
            <Typography sx={{ fontWeight: 600 }}>
              {l.description} — {L(`ఆర్డర్ ${l.qty} ${l.unit}, ఇంకా రావలసింది ${due[i]} ${l.unit}`, `ordered ${l.qty} ${l.unit}, still due ${due[i]} ${l.unit}`)}
            </Typography>
            {due[i] > 0 ? (
              <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr 1fr", sm: "1fr 1fr 1fr 1fr" } }}>
                <TextField size="small" label={L("వచ్చినది", "Delivered")} value={rows[i].delivered} onChange={(e) => set(i, { delivered: e.target.value })} slotProps={{ htmlInput: { inputMode: "decimal" } }} />
                <TextField size="small" label={L("తీసుకున్నది", "Accepted")} value={rows[i].accepted} onChange={(e) => set(i, { accepted: e.target.value })} error={!parsed[i].ok} slotProps={{ htmlInput: { inputMode: "decimal" } }} />
                <TextField size="small" type="date" label={L("గడువు తేదీ (ఉంటే)", "Expiry date (if any)")} value={rows[i].expiryDay} onChange={(e) => set(i, { expiryDay: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
                <TextField size="small" label={L("బ్యాచ్ నంబర్ (ఐచ్ఛికం)", "Batch no. (optional)")} value={rows[i].batchNo} onChange={(e) => set(i, { batchNo: e.target.value })} disabled={!rows[i].expiryDay} />
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {L("ఈ వస్తువు పూర్తిగా అందింది.", "This item is fully received.")}
              </Typography>
            )}
            {parsed[i].back > 0 && (
              <TextField size="small" label={L(`తిప్పి పంపినది ${parsed[i].back} ${l.unit} — కారణం`, `Sent back ${parsed[i].back} ${l.unit} — reason`)} value={rows[i].reason} onChange={(e) => set(i, { reason: e.target.value })} error={rows[i].reason.trim() === ""} />
            )}
            {!l.inventoryItemId && parsed[i].accepted > 0 && (
              <Typography variant="caption" color="text.secondary">
                {L("ఈ వస్తువు నిల్వ వస్తువుకి లింక్ కాలేదు — నిల్వలో కలవదు.", "This item is not linked to a stock item — stock will not change.")}
              </Typography>
            )}
          </Box>
        ))}
        <TextField size="small" label={L("గమనిక (ఐచ్ఛికం)", "Note (optional)")} value={note} onChange={(e) => setNote(e.target.value)} />
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{L("వద్దు", "Cancel")}</Button>
        <Button variant="contained" onClick={save} disabled={!valid || busy}>
          {L("రసీదు నమోదు చేయి", "Record receipt")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Module 3c: the vendor's bill for an order. What can be billed = accepted so far − billed before, at the order's rate. */
function BillDialog({ order, onClose, onDone }: { order: PurchaseOrder; onClose: () => void; onDone: (message: string, warn: boolean) => void }) {
  const { L, lang } = useLang();
  const canBill = order.lines.map((_, i) => Math.max(0, Math.round(((order.receivedQty[i] ?? 0) - (order.billedQty[i] ?? 0)) * 1000) / 1000));
  const [rows, setRows] = useState(order.lines.map((l, i) => ({ qty: canBill[i] > 0 ? String(canBill[i]) : "", rate: String(l.rate) })));
  const [billNo, setBillNo] = useState("");
  const [billDay, setBillDay] = useState(todayIso());
  const [other, setOther] = useState("");
  const [discount, setDiscount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (i: number, patch: Partial<(typeof rows)[number]>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const parsed = rows.map((r, i) => {
    const qty = r.qty.trim() === "" ? 0 : num(r.qty);
    const rate = num(r.rate);
    return { qty, rate, ok: qty >= 0 && (qty === 0 || rate > 0), overQty: qty > canBill[i], overRate: qty > 0 && rate > order.lines[i].rate };
  });
  const otherN = other.trim() === "" ? 0 : num(other);
  const discountN = discount.trim() === "" ? 0 : num(discount);
  const total = Math.round((parsed.reduce((a, p) => a + (p.qty > 0 ? p.qty * p.rate : 0), 0) + otherN - discountN) * 100) / 100;
  const valid = billNo.trim() !== "" && billDay <= todayIso() && parsed.every((p) => p.ok) && parsed.some((p) => p.qty > 0) && otherN >= 0 && discountN >= 0 && total > 0;
  const willHold = parsed.some((p) => p.overQty || p.overRate) || otherN > 0;
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await saveVendorBill({
        poId: order.id,
        billNo: billNo.trim(),
        billDay,
        ...(otherN > 0 ? { otherCharges: otherN } : {}),
        ...(discountN > 0 ? { discount: discountN } : {}),
        lines: parsed.map((p, i) => ({ line: i, qty: p.qty, rate: p.rate })).filter((l) => l.qty > 0),
      });
      const why = res.issues.map((x) => (lang === "te" ? x.te : x.en)).join("; ");
      onDone(
        res.paymentHold
          ? L(`బిల్ నమోదైంది (${formatINR(res.total)}), కానీ సరిపోలలేదు — చెల్లింపు ఆపాం: ${why}`, `Bill recorded (${formatINR(res.total)}) but it does not match — payment is on hold: ${why}`)
          : L(`బిల్ నమోదైంది (${formatINR(res.total)}). ఆర్డర్, రసీదుతో సరిపోయింది.`, `Bill recorded (${formatINR(res.total)}). It matches the order and the receipts.`),
        res.paymentHold,
      );
      onClose();
    } catch (e) {
      setError(errorText(e, lang));
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{L(`సరఫరాదారు బిల్ — ఆర్డర్ ${order.number} (${order.vendorName})`, `Vendor bill — order ${order.number} (${order.vendorName})`)}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
          <TextField size="small" label={L("సరఫరాదారు బిల్ నంబర్", "Vendor's bill number")} value={billNo} onChange={(e) => setBillNo(e.target.value)} />
          <TextField size="small" type="date" label={L("బిల్ తేదీ", "Bill date")} value={billDay} onChange={(e) => setBillDay(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        </Box>
        {order.lines.map((l, i) => (
          <Box key={i} sx={{ display: "grid", gap: 1, gridTemplateColumns: { xs: "1fr 1fr", sm: "3fr 1fr 1fr" }, alignItems: "center" }}>
            <Typography variant="body2">
              {l.description} — {L(`బిల్ చేయదగ్గది ${canBill[i]} ${l.unit}, ఆర్డర్ ధర ${formatINR(l.rate)}`, `can be billed ${canBill[i]} ${l.unit}, order rate ${formatINR(l.rate)}`)}
            </Typography>
            <TextField size="small" label={L("బిల్ పరిమాణం", "Billed quantity")} value={rows[i].qty} onChange={(e) => set(i, { qty: e.target.value })} color={parsed[i].overQty ? "warning" : undefined} focused={parsed[i].overQty || undefined} slotProps={{ htmlInput: { inputMode: "decimal" } }} />
            <TextField size="small" label={L("బిల్ ధర ₹", "Bill rate ₹")} value={rows[i].rate} onChange={(e) => set(i, { rate: e.target.value })} color={parsed[i].overRate ? "warning" : undefined} focused={parsed[i].overRate || undefined} slotProps={{ htmlInput: { inputMode: "decimal" } }} />
          </Box>
        ))}
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
          <TextField size="small" label={L("ఇతర ఛార్జీలు ₹ (రవాణా వంటివి)", "Other charges ₹ (transport etc.)")} value={other} onChange={(e) => setOther(e.target.value)} slotProps={{ htmlInput: { inputMode: "decimal" } }} />
          <TextField size="small" label={L("తగ్గింపు ₹", "Discount ₹")} value={discount} onChange={(e) => setDiscount(e.target.value)} slotProps={{ htmlInput: { inputMode: "decimal" } }} />
        </Box>
        <Typography sx={{ fontWeight: 600 }}>{L(`బిల్ మొత్తం: ${formatINR(total)}`, `Bill total: ${formatINR(total)}`)}</Typography>
        {willHold && (
          <Alert severity="warning">
            {L(
              "ఈ బిల్ ఆర్డర్ / రసీదుతో సరిపోవడం లేదు (ఎక్కువ పరిమాణం, ఎక్కువ ధర, లేదా ఆర్డర్‌లో లేని ఛార్జీలు). సేవ్ చేస్తే చెల్లింపు ఆగుతుంది; యజమాని విడుదల చేయాలి.",
              "This bill does not match the order / receipts (more quantity, a higher rate, or charges not on the order). If saved, payment is held until the owner releases it.",
            )}
          </Alert>
        )}
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{L("వద్దు", "Cancel")}</Button>
        <Button variant="contained" onClick={save} disabled={!valid || busy}>
          {L("బిల్ నమోదు చేయి", "Record bill")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

const linesText = (lines: { description: string; qty: number; unit: string }[]) =>
  lines
    .slice(0, 3)
    .map((l) => `${l.description} ${l.qty} ${l.unit}`)
    .join(", ") + (lines.length > 3 ? ` +${lines.length - 3}` : "");

export function ProcurementPage() {
  const { L, lang } = useLang();
  const { currentBranchId } = useBranch();
  const session = useSession();
  const { settings } = useBusinessSettings();
  const role = session.status === "loggedIn" ? session.profile.role : "staff";
  const uid = session.status === "loggedIn" ? session.profile.uid : "";
  const isAdmin = role === "admin";
  const isBoss = role === "admin" || role === "manager";
  const viewer = useMemo<ProcureViewer>(() => ({ role, uid, branchId: currentBranchId }), [role, uid, currentBranchId]);
  const units = useMemo(() => [...FIXED_UOMS, ...settings.uomPacks], [settings.uomPacks]);

  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newRequest, setNewRequest] = useState(false);
  const [orderDialog, setOrderDialog] = useState<{ order: PurchaseOrder | null; from: PurchaseRequest | null } | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [receipts, setReceipts] = useState<GoodsReceipt[]>([]);
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageWarn, setMessageWarn] = useState(false);
  const [billing, setBilling] = useState<PurchaseOrder | null>(null);
  const [held, setHeld] = useState<HeldBill[]>([]);

  useEffect(() => {
    if (!uid) return;
    return subscribePurchaseRequests(viewer, setRequests, (e) => setError(e.message));
  }, [viewer, uid]);
  useEffect(() => {
    if (!uid) return;
    return subscribePurchaseOrders(viewer, setOrders, (e) => setError(e.message));
  }, [viewer, uid]);
  useEffect(() => {
    if (!uid) return;
    return subscribeGoodsReceipts(viewer, setReceipts, (e) => setError(e.message));
  }, [viewer, uid]);
  useEffect(() => (isAdmin ? subscribeHeldBills(currentBranchId, setHeld, (e) => setError(e.message)) : undefined), [isAdmin, currentBranchId]);
  useEffect(() => (isBoss ? subscribeVendors((rows) => setVendors(rows.filter((v) => !v.cancelled))) : undefined), [isBoss]);

  const run = async (work: () => Promise<unknown>) => {
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(errorText(e, lang));
    }
  };
  const askReason = (te: string, en: string) => (window.prompt(L(te, en)) ?? "").trim();
  const rejectRequest = (r: PurchaseRequest) => {
    const reason = askReason("తిరస్కరించడానికి కారణం రాయండి", "Why are you rejecting it?");
    if (reason) void run(() => decidePurchaseRequest({ id: r.id, approve: false, reason }));
  };
  const cancelRequest = (r: PurchaseRequest) => {
    const reason = askReason("రద్దు చేయడానికి కారణం రాయండి", "Why are you cancelling it?");
    if (reason) void run(() => cancelPurchaseRequest({ id: r.id, reason }));
  };
  const rejectOrder = (o: PurchaseOrder) => {
    const reason = askReason("తిరస్కరించడానికి కారణం రాయండి", "Why are you rejecting it?");
    if (reason) void run(() => decidePurchaseOrder({ id: o.id, approve: false, reason }));
  };
  const cancelOrder = (o: PurchaseOrder) => {
    const reason = askReason("రద్దు చేయడానికి కారణం రాయండి", "Why are you cancelling it?");
    if (reason) void run(() => cancelPurchaseOrder({ id: o.id, reason }));
  };

  const releaseHold = (b: HeldBill) => {
    const reason = askReason("ఈ బిల్ సరిపోలకపోయినా చెల్లించడానికి కారణం రాయండి", "Why should this bill be paid although it does not match?");
    if (reason) void run(() => releaseBillHold({ purchaseId: b.id, reason }));
  };
  const cancelReceipt = (g: GoodsReceipt) => {
    const reason = askReason("ఈ రసీదు రద్దు చేయడానికి కారణం రాయండి (సరుకు నిల్వ నుంచి తగ్గుతుంది)", "Why are you cancelling this receipt? (its goods leave stock again)");
    if (reason) void run(() => cancelGoodsReceipt({ id: g.id, reason }));
  };
  const closeOrder = (o: PurchaseOrder) => {
    const reason = askReason("మిగతా సరుకు రాదని ముగించడానికి కారణం రాయండి", "Why will the rest not come?");
    if (reason) void run(() => closePurchaseOrder({ id: o.id, reason }));
  };

  const openRequests = requests.filter((r) => r.status === "submitted" || r.status === "approved");
  const openOrders = orders.filter((o) => o.status === "pendingApproval" || o.status === "approved" || o.status === "partReceived" || o.status === "rejected");
  const shownRequests = showClosed ? requests : openRequests;
  const shownOrders = showClosed ? orders : openOrders;
  const waitingOwner = orders.filter((o) => o.status === "pendingApproval").length;

  return (
    <Box>
      <PageHeader
        title={L("కొనుగోలు అభ్యర్థనలు & ఆర్డర్లు", "Purchase requests & orders")}
        action={
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setNewRequest(true)}>
              {L("కొత్త అభ్యర్థన", "New request")}
            </Button>
            {isBoss && (
              <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setOrderDialog({ order: null, from: null })}>
                {L("కొత్త ఆర్డర్", "New order")}
              </Button>
            )}
          </Box>
        }
      />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {message && (
        <Alert severity={messageWarn ? "warning" : "success"} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
          {message}
        </Alert>
      )}
      <Alert severity="info" sx={{ mb: 2 }}>
        {L(
          "ఇది ముందుగా సరఫరాదారుకి ఇచ్చే ఆర్డర్ల కోసం. రోజూ మార్కెట్‌లో నేరుగా కొనేవి ఎప్పటిలాగే 'కొనుగోళ్లు' లో బిల్‌గా రాయండి.",
          "This is for orders placed with a vendor in advance. Daily market buying is still entered as a bill under Purchases.",
        )}
      </Alert>
      <StatRow>
        <StatCard label={L("తెరిచి ఉన్న అభ్యర్థనలు", "Open requests")} value={openRequests.length} />
        {isBoss && <StatCard label={L("యజమాని ఆమోదం కోసం ఆర్డర్లు", "Orders waiting for the owner")} value={waitingOwner} tone={waitingOwner > 0 ? "warn" : "good"} />}
        {isBoss && <StatCard label={L("సరుకు రావలసిన ఆర్డర్ల విలువ", "Value of orders to be received")} value={formatINR(orders.filter((o) => o.status === "approved" || o.status === "partReceived").reduce((a, o) => a + o.total, 0))} />}
      </StatRow>
      <Button size="small" onClick={() => setShowClosed(!showClosed)} sx={{ mb: 1 }}>
        {showClosed ? L("తెరిచి ఉన్నవి మాత్రమే చూపించు", "Show open ones only") : L("ముగిసినవి కూడా చూపించు", "Show finished ones too")}
      </Button>

      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
        {L("అభ్యర్థనలు", "Requests")}
      </Typography>
      <DataTable
        rows={shownRequests}
        rowKey={(r) => r.id}
        columns={[
          { label: L("నంబర్", "Number"), render: (r) => r.number },
          { label: L("వస్తువులు", "Items"), render: (r) => linesText(r.lines) },
          { label: L("కావలసిన తేదీ", "Needed by"), hideOnMobile: true, render: (r) => r.neededBy },
          { label: L("అడిగినవారు", "Asked by"), hideOnMobile: true, render: (r) => r.requestedByName },
          {
            label: L("స్థితి", "Status"),
            render: (r) => <Chip size="small" color={PR_STATUS_LABEL[r.status].color} label={L(PR_STATUS_LABEL[r.status].te, PR_STATUS_LABEL[r.status].en) + (r.poNumber ? ` · ${r.poNumber}` : "") + (r.status === "rejected" && r.decideReason ? ` · ${r.decideReason}` : "")} />,
          },
          {
            label: "",
            render: (r) => (
              <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                {isBoss && r.status === "submitted" && (
                  <Button size="small" variant="contained" onClick={() => void run(() => decidePurchaseRequest({ id: r.id, approve: true }))}>
                    {L("ఆమోదించు", "Approve")}
                  </Button>
                )}
                {isBoss && r.status === "submitted" && (
                  <Button size="small" color="error" onClick={() => rejectRequest(r)}>
                    {L("తిరస్కరించు", "Reject")}
                  </Button>
                )}
                {isBoss && r.status === "approved" && (
                  <Button size="small" variant="contained" onClick={() => setOrderDialog({ order: null, from: r })}>
                    {L("ఆర్డర్ రాయి", "Write order")}
                  </Button>
                )}
                {(r.status === "submitted" || r.status === "approved") && (isBoss || r.requestedBy === uid) && (
                  <Button size="small" onClick={() => cancelRequest(r)}>
                    {L("రద్దు", "Cancel")}
                  </Button>
                )}
              </Box>
            ),
          },
        ]}
      />

      {isBoss && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
            {L("ఆర్డర్లు", "Orders")}
          </Typography>
          <DataTable
            rows={shownOrders}
            rowKey={(o) => o.id}
            columns={[
              { label: L("నంబర్", "Number"), render: (o) => o.number },
              { label: L("సరఫరాదారు", "Vendor"), render: (o) => o.vendorName },
              { label: L("వస్తువులు", "Items"), hideOnMobile: true, render: (o) => linesText(o.lines) },
              { label: L("రావలసిన తేదీ", "Expected"), hideOnMobile: true, render: (o) => o.expectedDay },
              { label: L("మొత్తం", "Total"), align: "right", render: (o) => formatINR(o.total) },
              { label: L("బిల్ అయింది", "Billed"), align: "right", hideOnMobile: true, render: (o) => (o.billedAmount > 0 ? formatINR(o.billedAmount) + (o.heldCount > 0 ? L(" · చెల్లింపు ఆపాం", " · on hold") : "") : "—") },
              {
                label: L("స్థితి", "Status"),
                render: (o) => <Chip size="small" color={PO_STATUS_LABEL[o.status].color} label={L(PO_STATUS_LABEL[o.status].te, PO_STATUS_LABEL[o.status].en) + (o.status === "rejected" && o.decideReason ? ` · ${o.decideReason}` : "")} />,
              },
              {
                label: "",
                render: (o) => (
                  <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                    {isAdmin && o.status === "pendingApproval" && (
                      <Button size="small" variant="contained" onClick={() => void run(() => decidePurchaseOrder({ id: o.id, approve: true }))}>
                        {L("ఆమోదించు", "Approve")}
                      </Button>
                    )}
                    {isAdmin && o.status === "pendingApproval" && (
                      <Button size="small" color="error" onClick={() => rejectOrder(o)}>
                        {L("తిరస్కరించు", "Reject")}
                      </Button>
                    )}
                    {(o.status === "approved" || o.status === "partReceived") && (
                      <Button size="small" variant="contained" onClick={() => { setMessage(null); setReceiving(o); }}>
                        {L("సరుకు తీసుకో", "Receive goods")}
                      </Button>
                    )}
                    {(o.status === "partReceived" || o.status === "received") && (
                      <Button size="small" variant="outlined" onClick={() => { setMessage(null); setBilling(o); }}>
                        {L("బిల్ రాయి", "Enter bill")}
                      </Button>
                    )}
                    {o.status === "partReceived" && (
                      <Button size="small" onClick={() => closeOrder(o)}>
                        {L("మిగతాది రాదు — ముగించు", "Rest won't come — close")}
                      </Button>
                    )}
                    {(o.status === "pendingApproval" || o.status === "rejected") && (
                      <Button size="small" onClick={() => setOrderDialog({ order: o, from: null })}>
                        {L("మార్చు", "Change")}
                      </Button>
                    )}
                    {(o.status === "pendingApproval" || o.status === "approved" || o.status === "rejected") && (
                      <Button size="small" onClick={() => cancelOrder(o)}>
                        {L("రద్దు", "Cancel")}
                      </Button>
                    )}
                  </Box>
                ),
              },
            ]}
          />
        </Box>
      )}

      {isBoss && receipts.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
            {L("సరుకు రసీదులు", "Goods receipts")}
          </Typography>
          <DataTable
            rows={showClosed ? receipts : receipts.slice(0, 20)}
            rowKey={(g) => g.id}
            columns={[
              { label: L("రసీదు", "Receipt"), render: (g) => g.number },
              { label: L("ఆర్డర్", "Order"), render: (g) => `${g.poNumber} · ${g.vendorName}` },
              { label: L("తేదీ", "Date"), hideOnMobile: true, render: (g) => g.receiveDay },
              { label: L("తీసుకున్నది", "Accepted"), hideOnMobile: true, render: (g) => g.lines.filter((l) => l.accepted > 0).slice(0, 3).map((l) => `${l.description} ${l.accepted} ${l.unit}`).join(", ") },
              { label: L("విలువ", "Value"), align: "right", render: (g) => formatINR(g.acceptedValue) },
              {
                label: L("గమనించవలసినవి", "To note"),
                render: (g) => (
                  <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                    {g.hasRejects && <Chip size="small" color="warning" label={L("తిప్పి పంపినవి ఉన్నాయి", "Some sent back")} />}
                    {g.stockSkipped && <Chip size="small" color="error" label={L("Stock చేతితో సరిచేయాలి", "Adjust stock by hand")} />}
                    {g.cancelled && <Chip size="small" label={L("రద్దు", "Cancelled")} />}
                    {!g.cancelled && (
                      <Button size="small" onClick={() => cancelReceipt(g)}>
                        {L("రసీదు రద్దు", "Cancel receipt")}
                      </Button>
                    )}
                  </Box>
                ),
              },
            ]}
          />
        </Box>
      )}

      {isAdmin && held.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
            {L("చెల్లింపు ఆపిన బిల్లులు (సరిపోలనివి)", "Bills on payment hold (not matching)")}
          </Typography>
          <DataTable
            rows={held}
            rowKey={(b) => b.id}
            columns={[
              { label: L("బిల్", "Bill"), render: (b) => `${b.billNumber} · ${b.vendorName}` },
              { label: L("ఆర్డర్", "Order"), hideOnMobile: true, render: (b) => b.poNumber },
              { label: L("మొత్తం", "Total"), align: "right", render: (b) => formatINR(b.total) },
              { label: L("ఎందుకు సరిపోలలేదు", "Why it does not match"), render: (b) => b.issues.map((x) => (lang === "te" ? x.te : x.en)).join("; ") },
              {
                label: "",
                render: (b) => (
                  <Button size="small" color="warning" onClick={() => releaseHold(b)}>
                    {L("అయినా చెల్లించవచ్చు", "Allow payment anyway")}
                  </Button>
                ),
              },
            ]}
          />
        </Box>
      )}

      {receiving && <ReceiveDialog order={receiving} onClose={() => setReceiving(null)} onDone={(m) => { setMessageWarn(false); setMessage(m); }} />}
      {billing && <BillDialog order={billing} onClose={() => setBilling(null)} onDone={(m, warn) => { setMessageWarn(warn); setMessage(m); }} />}
      {newRequest && <RequestDialog branchId={currentBranchId} units={units} onClose={() => setNewRequest(false)} />}
      {orderDialog && (
        <OrderDialog
          order={orderDialog.order}
          from={orderDialog.from}
          branchId={currentBranchId}
          units={units}
          vendors={vendors}
          isAdmin={isAdmin}
          managerLimit={settings.poApproval.managerLimit}
          approvalOn={settings.poApproval.on}
          onClose={() => setOrderDialog(null)}
        />
      )}
    </Box>
  );
}
