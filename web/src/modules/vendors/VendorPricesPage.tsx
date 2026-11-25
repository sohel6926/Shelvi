import { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Chip, CircularProgress, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { useLang } from "../../i18n/LanguageContext";
import { errorText, vendorPriceComparison, type VendorRate } from "../../data/functions";
import { useBusinessSettings } from "../../data/settingsRepository";
import { ErrorBox, ScreenTitle } from "../../components/ui";
import { formatMoney } from "../../util/format";
import { formatDay } from "../../util/dates";
import { tabularNums, tokens } from "../../theme/tokens";
import { subscribeGroceryItems, type GroceryItem } from "../../data/groceryRepository";

type Item = { itemKey: string; groceryItemId?: string; name: string; nameTe?: string; unit: string; vendors: VendorRate[]; vendorCount: number };

/** R10-6: last rate per vendor for each item (vendorPriceComparison) — cheapest marked, change vs the previous rate. */
export function VendorPricesPage() {
  const { L, lang } = useLang();
  const { settings } = useBusinessSettings();
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [grocery, setGrocery] = useState<GroceryItem[]>([]);
  useEffect(() => subscribeGroceryItems(setGrocery, () => setGrocery([])), []);

  // QA fix 8: Telugu item name in Telugu mode (server nameTe, else the grocery master's), English name otherwise.
  const groceryById = useMemo(() => new Map(grocery.map((g) => [g.id, g])), [grocery]);
  const teName = useCallback(
    (i: Item) => i.nameTe || (i.groceryItemId ? groceryById.get(i.groceryItemId)?.nameTe : "") || "",
    [groceryById],
  );
  const itemName = (i: Item) => (lang === "te" ? teName(i) || i.name : i.name || teName(i));

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems((await vendorPriceComparison({})).items);
    } catch (e) {
      setError(errorText(e, lang));
      setItems([]);
    }
  }, [lang]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (items ?? []).filter(
      (i) => !q || i.name.toLowerCase().includes(q) || teName(i).toLowerCase().includes(q) || i.vendors.some((v) => v.vendorName.toLowerCase().includes(q)),
    );
  }, [items, search, teName]);
  const alertPct = settings.vendorPriceAlertPct;
  const num = { ...tabularNums, textAlign: "right" as const };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100 }}>
      <ScreenTitle
        title={L("సరఫరాదారుల ధరల పోలిక", "Vendor price comparison")}
        subtitle={L("ప్రతి సరుకుకి ప్రతి సరఫరాదారు చివరి ధర — తక్కువది గుర్తు పెట్టాం", "Last rate from each vendor per item — the cheapest is marked")}
        onRefresh={load}
      />
      <TextField size="small" placeholder={L("సరుకు / సరఫరాదారు వెతకండి", "Search item or vendor")} value={search} onChange={(e) => setSearch(e.target.value)} sx={{ mb: 2, minWidth: 280 }} />
      <ErrorBox message={error} />
      {items === null ? (
        <CircularProgress />
      ) : filtered.length === 0 ? (
        <Paper sx={{ p: 3 }}>
          <Typography color="text.secondary">
            {L("కొనుగోళ్లు లేవు. కొనుగోళ్లు నమోదు చేస్తే (stock item తో) ఇక్కడ ధరలు వస్తాయి.", "No purchases yet. Rates appear here once purchases (linked to stock items) are entered.")}
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: "grid", gap: 2 }}>
          {filtered.map((it) => (
            <Paper key={it.itemKey} sx={{ p: 2 }}>
              {/* A Chip renders a <div>, so the heading is a Box (not a <p> Typography) — no nesting warning. */}
              <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1, mb: 1 }}>
                <Typography component="h2" sx={{ fontWeight: 600 }}>
                  {itemName(it)}
                  {it.unit ? ` (${L("ఒక్క", "per")} ${it.unit})` : ""}
                </Typography>
                {it.vendorCount > 1 && <Chip size="small" variant="outlined" label={L(`${it.vendorCount} సరఫరాదారులు`, `${it.vendorCount} vendors`)} />}
              </Box>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{L("సరఫరాదారు", "Vendor")}</TableCell>
                      <TableCell sx={num}>{L("చివరి ధర", "Last rate")}</TableCell>
                      <TableCell>{L("తేదీ", "Date")}</TableCell>
                      <TableCell sx={num}>{L("ముందు ధర", "Previous")}</TableCell>
                      <TableCell sx={num}>{L("మార్పు", "Change")}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {it.vendors.map((v) => {
                      const up = v.changePct !== null && v.changePct > 0;
                      const alert = v.changePct !== null && v.changePct >= alertPct;
                      return (
                        <TableRow key={v.vendorId || v.vendorName} sx={v.cheapest ? { bgcolor: tokens.color.goodTint } : undefined}>
                          <TableCell>
                            {v.vendorName || "—"}
                            {v.cheapest && <Chip size="small" color="success" label={L("తక్కువ ధర", "Cheapest")} sx={{ ml: 1 }} />}
                          </TableCell>
                          <TableCell sx={{ ...num, fontWeight: 600 }}>{formatMoney(v.lastRate)}</TableCell>
                          <TableCell>{formatDay(v.lastDay, lang)}</TableCell>
                          <TableCell sx={num}>{v.previousRate === null ? "—" : formatMoney(v.previousRate)}</TableCell>
                          <TableCell sx={{ ...num, color: alert ? tokens.color.bad : up ? tokens.color.warning : v.changePct !== null && v.changePct < 0 ? tokens.color.good : undefined, fontWeight: alert ? 600 : 400 }}>
                            {v.changePct === null ? "—" : `${v.changePct > 0 ? "▲ +" : v.changePct < 0 ? "▼ " : ""}${v.changePct}%`}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          ))}
          <Typography variant="body2" color="text.secondary">
            {L(`ధర ${alertPct}% లేదా ఎక్కువ పెరిగితే ఎరుపు (Settings లో మార్చవచ్చు).`, `Red when a rate rose by ${alertPct}% or more (change it in Settings).`)}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
