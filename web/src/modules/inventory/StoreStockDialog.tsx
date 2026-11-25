import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography } from "@mui/material";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import { useLang } from "../../i18n/LanguageContext";
import { errorText, setItemHomeStore, setItemLocation, transferStock, transferToBranch } from "../../data/functions";

interface Store {
  id: string;
  name: string;
  storeType: string;
  status: string;
  issueBlocked: boolean;
  locations: string[];
}

/**
 * Module 5c — where one item's stock sits, store by store, and moving it between stores (transferStock). The item's
 * total never changes here. The "usual store" holds whatever is not in another store, so purchases and event issues
 * (which do not name a store) land there. Managers and the owner; a quarantine / scrap store is emptied only by the
 * owner (the server decides).
 */
export function StoreStockDialog({ itemId, name, unit, branchId, onClose }: { itemId: string; name: string; unit: string; branchId: string; onClose: () => void }) {
  const { L, lang } = useLang();
  const [stores, setStores] = useState<Store[]>([]);
  const [total, setTotal] = useState(0);
  const [storeQty, setStoreQty] = useState<Record<string, number>>({});
  const [homeSet, setHomeSet] = useState("");
  const [binLocation, setBinLocation] = useState<Record<string, string>>({});
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [qtyText, setQtyText] = useState("");
  const [note, setNote] = useState("");
  // Module 6a: moving stock to another branch
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [toBranch, setToBranch] = useState("");
  const [bFrom, setBFrom] = useState("");
  const [bQtyText, setBQtyText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      onSnapshot(
        doc(db, "inventory", itemId),
        (s) => {
          const d = s.data() ?? {};
          setTotal(typeof d.quantityInStock === "number" ? d.quantityInStock : 0);
          setStoreQty(typeof d.storeQty === "object" && d.storeQty !== null ? (d.storeQty as Record<string, number>) : {});
          setHomeSet(typeof d.homeStoreId === "string" ? d.homeStoreId : "");
          setBinLocation(typeof d.binLocation === "object" && d.binLocation !== null ? (d.binLocation as Record<string, string>) : {});
        },
        () => undefined,
      ),
    [itemId],
  );
  useEffect(() => {
    if (!branchId) return;
    return onSnapshot(
      query(collection(db, "stores"), where("branchId", "==", branchId)),
      (snap) => setStores(snap.docs.map((d) => ({ id: d.id, name: String(d.data().name ?? d.id), storeType: String(d.data().storeType ?? ""), status: String(d.data().status ?? "active"), issueBlocked: d.data().issueBlocked === true, locations: Array.isArray(d.data().locations) ? (d.data().locations as unknown[]).map((x) => String(x)) : [] })).filter((s) => s.status !== "archived")),
      () => setStores([]),
    );
  }, [branchId]);

  useEffect(
    () =>
      onSnapshot(
        collection(db, "branches"),
        (snap) => setBranches(snap.docs.filter((d) => d.id !== branchId && d.data().status !== "archived" && d.data().active !== false).map((d) => ({ id: d.id, name: String(d.data().name ?? d.id) }))),
        () => setBranches([]),
      ),
    [branchId],
  );

  // same rule as the server (storeRules.homeStoreOf): the store set on the item, else the main store, else the first
  const home = useMemo(() => {
    if (homeSet && stores.some((s) => s.id === homeSet)) return homeSet;
    return (stores.find((s) => s.storeType === "main" && s.status !== "inactive") ?? stores.find((s) => s.status !== "inactive") ?? stores[0])?.id ?? "";
  }, [homeSet, stores]);
  const balance = (id: string) => {
    const others = Object.entries(storeQty).filter(([k, v]) => k !== home && typeof v === "number" && v > 0);
    if (id === home) return Math.round((total - others.reduce((a, [, v]) => a + v, 0)) * 1000) / 1000;
    return others.find(([k]) => k === id)?.[1] ?? 0;
  };
  const qty = Number(qtyText);
  const valid = !!from && !!to && from !== to && Number.isFinite(qty) && qty > 0 && qty <= balance(from) + 1e-9;

  const bQty = Number(bQtyText);
  const bFromId = bFrom || home;
  const bValid = !!toBranch && Number.isFinite(bQty) && bQty > 0 && bQty <= balance(bFromId) + 1e-9;

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      setQtyText("");
      setNote("");
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={() => !busy && onClose()} fullWidth maxWidth="sm">
      <DialogTitle>
        {name} — {L("స్టోర్ వారీ నిల్వ", "Stock by store")}
      </DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
        {stores.length === 0 ? (
          <Alert severity="info">{L("ఈ శాఖకు ఇంకా స్టోర్లు లేవు. \"కంపెనీ · బ్రాండ్ · శాఖలు\" తెరలో స్టోర్లు చేర్చండి (లేదా మొదటి ఏర్పాటు చేయండి).", "This branch has no stores yet. Add stores on the \"Company · Brands · Branches\" page (or do the first set-up).")}</Alert>
        ) : (
          <>
            <Box sx={{ display: "grid", gap: 0.5 }}>
              {stores.map((s) => (
                <Box key={s.id} sx={{ display: "flex", justifyContent: "space-between", gap: 1, alignItems: "center", borderBottom: 1, borderColor: "divider", py: 0.5 }}>
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                    <Typography variant="body2">{s.name}</Typography>
                    {s.id === home && <Chip size="small" color="primary" label={L("సాధారణ స్టోర్", "Usual store")} />}
                    {s.issueBlocked && <Chip size="small" color="warning" label={L("వాడకానికి కాదు", "Not for issue")} />}
                  </Box>
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                    {s.locations.length > 0 && (
                      <TextField
                        select
                        size="small"
                        label={L("స్థానం", "Place")}
                        value={binLocation[s.id] ?? ""}
                        disabled={busy}
                        onChange={(e) => void run(() => setItemLocation({ itemId, storeId: s.id, location: e.target.value }))}
                        sx={{ minWidth: 150 }}
                      >
                        <MenuItem value="">{L("— లేదు —", "— none —")}</MenuItem>
                        {s.locations.map((l) => (
                          <MenuItem key={l} value={l}>
                            {l}
                          </MenuItem>
                        ))}
                      </TextField>
                    )}
                    <Typography variant="body2" sx={{ fontWeight: 600, color: balance(s.id) < 0 ? "error.main" : undefined }}>
                      {balance(s.id)} {unit}
                    </Typography>
                  </Box>
                </Box>
              ))}
              <Box sx={{ display: "flex", justifyContent: "space-between", pt: 0.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {L("మొత్తం", "Total")}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {total} {unit}
                </Typography>
              </Box>
            </Box>
            {balance(home) < 0 && <Alert severity="warning">{L("సాధారణ స్టోర్‌లో నిల్వ మైనస్‌లో ఉంది: సరుకు వేరే స్టోర్‌లో ఉండగా ఇక్కడి నుంచి వాడారు. ఆ స్టోర్ నుంచి ఇక్కడికి బదిలీ చేయండి.", "The usual store shows a negative balance: stock was used from here while it sat in another store. Transfer it here from that store.")}</Alert>}
            {stores.length > 1 && (
              <>
                <Typography variant="subtitle2">{L("స్టోర్ల మధ్య బదిలీ", "Transfer between stores")}</Typography>
                <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
                  <TextField select size="small" label={L("ఎక్కడి నుంచి", "From")} value={from} onChange={(e) => setFrom(e.target.value)}>
                    {stores.filter((s) => balance(s.id) > 0).map((s) => (
                      <MenuItem key={s.id} value={s.id}>
                        {s.name} ({balance(s.id)} {unit})
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField select size="small" label={L("ఎక్కడికి", "To")} value={to} onChange={(e) => setTo(e.target.value)}>
                    {stores.filter((s) => s.id !== from && s.status === "active").map((s) => (
                      <MenuItem key={s.id} value={s.id}>
                        {s.name}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField size="small" label={`${L("ఎంత", "How much")} (${unit})`} value={qtyText} onChange={(e) => setQtyText(e.target.value)} slotProps={{ htmlInput: { inputMode: "decimal" } }} error={qtyText !== "" && !valid && !!from && !!to} />
                  <TextField size="small" label={L("గమనిక (ఐచ్ఛికం)", "Note (optional)")} value={note} onChange={(e) => setNote(e.target.value)} />
                </Box>
                <Box>
                  <Button variant="contained" disabled={!valid || busy} onClick={() => void run(() => transferStock({ itemId, fromStoreId: from, toStoreId: to, quantity: qty, ...(note.trim() ? { note: note.trim() } : {}) }))}>
                    {L("బదిలీ చేయి", "Transfer")}
                  </Button>
                </Box>
                <TextField select size="small" label={L("ఈ వస్తువు సాధారణ స్టోర్ (కొనుగోలు, వంట తీసివేత ఇక్కడే లెక్క)", "This item's usual store (purchases and kitchen issues count here)")} value={home} disabled={busy} onChange={(e) => void run(() => setItemHomeStore({ itemId, storeId: e.target.value }))} helperText={L("ఇది మార్చినా ఏ స్టోర్ నిల్వా మారదు.", "Changing this does not move any stock.")}>
                  {stores.filter((s) => s.status === "active" && !s.issueBlocked).map((s) => (
                    <MenuItem key={s.id} value={s.id}>
                      {s.name}
                    </MenuItem>
                  ))}
                </TextField>
              </>
            )}
            {branches.length > 0 && (
              <>
                <Typography variant="subtitle2">{L("మరో శాఖకు పంపడం", "Send to another branch")}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {L("ఆ శాఖలో ఇదే పేరు, ఇదే యూనిట్‌తో వస్తువు ఉండాలి. అక్కడ సాధారణ స్టోర్‌లో చేరుతుంది. ధర ఏదీ మారదు.", "The other branch must already have this item (same name and unit). It lands in that item's usual store there. No money moves.")}
                </Typography>
                <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
                  <TextField select size="small" label={L("ఏ శాఖకు", "To branch")} value={toBranch} onChange={(e) => setToBranch(e.target.value)}>
                    {branches.map((b) => (
                      <MenuItem key={b.id} value={b.id}>
                        {b.name}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField select size="small" label={L("ఇక్కడ ఏ స్టోర్ నుంచి", "From which store here")} value={bFromId} onChange={(e) => setBFrom(e.target.value)}>
                    {stores.filter((s) => balance(s.id) > 0).map((s) => (
                      <MenuItem key={s.id} value={s.id}>
                        {s.name} ({balance(s.id)} {unit})
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField size="small" label={`${L("ఎంత", "How much")} (${unit})`} value={bQtyText} onChange={(e) => setBQtyText(e.target.value)} slotProps={{ htmlInput: { inputMode: "decimal" } }} error={bQtyText !== "" && !bValid} />
                </Box>
                <Box>
                  <Button
                    variant="contained"
                    disabled={!bValid || busy}
                    onClick={() => void run(async () => { await transferToBranch({ itemId, toBranchId: toBranch, quantity: bQty, fromStoreId: bFromId, ...(note.trim() ? { note: note.trim() } : {}) }); setBQtyText(""); })}
                  >
                    {L("శాఖకు పంపు", "Send to branch")}
                  </Button>
                </Box>
              </>
            )}
          </>
        )}
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {L("మూసివేయి", "Close")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
