import { useCallback, useEffect, useMemo, useState } from "react";
import { Link as RouterLink, useSearchParams } from "react-router-dom";
import { Alert, Box, Button, CircularProgress, Collapse, Link, Paper, TextField, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import PrintIcon from "@mui/icons-material/Print";
import { dateLocale, useLang } from "../../i18n/LanguageContext";
import { useBranch } from "../../session/BranchContext";
import { dayPlan, errorText, type DayPlanDish, type PlanIngredient, type PlanPart } from "../../data/functions";
import { subscribeGroceryItems, type GroceryItem } from "../../data/groceryRepository";
import { DataTable } from "../../components/DataTable";
import { ScreenTitle } from "../../components/ui";
import { IngredientsTable, PartFacts, PlanDishBlock, copyText, planText, qtyText } from "./PlanViews";

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Round 8 Day plan: every event of a day, dish quantities per event and combined, and one purchase list. */
export function DayPlanPage() {
  const { L, lang } = useLang();
  const [params, setParams] = useSearchParams();
  const { currentBranchId } = useBranch();
  const date = params.get("date") || isoDay(new Date());
  const [data, setData] = useState<{ events: PlanPart[]; dishes: DayPlanDish[]; ingredients: PlanIngredient[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openEvent, setOpenEvent] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [master, setMaster] = useState<GroceryItem[]>([]);
  useEffect(() => subscribeGroceryItems(setMaster, () => setMaster([])), []);

  const load = useCallback(async () => {
    setError(null);
    setData(null);
    setCopied(false);
    try {
      const r = await dayPlan({ date, ...(currentBranchId ? { branchId: currentBranchId } : {}) });
      setData({ events: r.events, dishes: r.dishes, ingredients: r.ingredients });
    } catch (e) {
      setError(errorText(e, lang));
      setData({ events: [], dishes: [], ingredients: [] });
    }
  }, [date, currentBranchId, lang]);

  useEffect(() => {
    void load();
  }, [load]);

  const names = useMemo(() => {
    const m = new Map<string, { te: string; en: string; unit: string }>();
    for (const g of master) m.set(g.id, { te: g.nameTe, en: g.nameEn || g.nameRoman, unit: g.unit });
    for (const i of data?.ingredients ?? []) m.set(i.groceryItemId, { te: i.nameTe, en: i.nameEn, unit: i.unit });
    return m;
  }, [master, data]);

  const partKey = (p: { bookingId: string; sessionId: string; lunchBoxOrderId?: string }) => `${p.bookingId}|${p.sessionId}|${p.lunchBoxOrderId ?? ""}`;
  const partLabel = (p: PlanPart) => `${p.customer || "—"}${p.labelTe || p.labelEn ? ` · ${L(p.labelTe || p.labelEn, p.labelEn || p.labelTe)}` : ""}`;
  const dateLabel = new Date(`${date}T12:00:00`).toLocaleDateString(dateLocale(lang), { weekday: "long", day: "numeric", month: "long" });

  const copy = async () => {
    if (!data) return;
    const title = L(`${dateLabel} వంట plan — ${data.events.length} events`, `${dateLabel} cooking plan — ${data.events.length} events`);
    const ok = await copyText(
      planText(
        title,
        data.dishes.map((d) => ({ name: lang === "te" ? d.nameTe || d.nameEn : d.nameEn || d.nameTe, qty: d.total, unit: d.unit })),
        data.ingredients,
        lang,
      ),
    );
    setCopied(ok);
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100, "@media print": { p: 0 } }}>
      <ScreenTitle
        title={L("రోజు వంట plan", "Day plan")}
        subtitle={dateLabel}
        onRefresh={load}
        action={
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", displayPrint: "none" }}>
            <TextField
              size="small"
              type="date"
              label={L("తేదీ", "Date")}
              value={date}
              onChange={(e) => e.target.value && setParams({ date: e.target.value })}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <Button variant="outlined" startIcon={<PrintIcon />} onClick={() => window.print()} disabled={!data?.events.length}>
              {L("ప్రింట్", "Print")}
            </Button>
            <Button variant="outlined" onClick={copy} disabled={!data?.events.length}>
              {copied ? <><CheckIcon fontSize="small" sx={{ mr: 0.5 }} />{L("Copy అయింది", "Copied")}</> : L("WhatsApp కి copy", "Copy for WhatsApp")}
            </Button>
          </Box>
        }
      />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {data === null ? (
        <CircularProgress />
      ) : data.events.length === 0 ? (
        <Paper sx={{ p: 3 }}>
          <Typography>{L("ఈ రోజు events లేవు.", "No events on this day.")}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {L(
              "Plan రావాలంటే: బుకింగ్ లో తేదీ, అతిథులు, బంతి / బఫే, మెనూ ప్యాకేజీ ఉండాలి; మెనూ ఐటమ్స్ కి వంటకాలు జత చేయాలి; వంటకాలకి మొదటి అంచనా లేదా గత events వంట నమోదు ఉండాలి.",
              "For a plan, a booking needs a date, guests, banthi / buffet and a menu package; menu items must be linked to dishes; dishes need a starting guess or past cook logs.",
            )}
          </Typography>
        </Paper>
      ) : (
        <>
          <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
            {L(`Events (${data.events.length})`, `Events (${data.events.length})`)}
          </Typography>
          <Box sx={{ display: "grid", gap: 1.5, mb: 3 }}>
            {data.events.map((p) => (
              <Paper key={partKey(p)} sx={{ p: 2, "@media print": { boxShadow: "none", border: "1px solid #ccc" } }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
                  <Box>
                    <Link component={RouterLink} to={p.kind === "lunchBox" ? "/lunch-boxes" : `/bookings/${p.bookingId}`} sx={{ fontWeight: 600 }}>
                      {partLabel(p)}
                    </Link>
                    <Box sx={{ mt: 0.5 }}>
                      <PartFacts guests={p.guests} band={p.band} serviceStyle={p.serviceStyle} comboKey={p.comboKey} kidsCount={p.kidsCount} specialMeals={p.specialMeals} kind={p.kind} />
                    </Box>
                  </Box>
                  <Button size="small" sx={{ displayPrint: "none" }} onClick={() => setOpenEvent(openEvent === partKey(p) ? null : partKey(p))}>
                    {openEvent === partKey(p) ? L("మూసివేయి", "Hide") : L(`వంటకాలు (${p.dishes.length}) ఎందుకు ఇంత?`, `Dishes (${p.dishes.length}) — why?`)}
                  </Button>
                </Box>
                <Collapse in={openEvent === partKey(p)} unmountOnExit>
                  {p.dishes.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      {L("ఈ event మెనూలో వంటకాలు జత చేయలేదు.", "No dishes linked to this event's menu.")}
                    </Typography>
                  ) : (
                    p.dishes.map((d) => <PlanDishBlock key={d.key} d={d} names={names} />)
                  )}
                </Collapse>
              </Paper>
            ))}
          </Box>

          <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
            {L("వంటకాలు — మొత్తం, event వారీగా", "Dishes — total and per event")}
          </Typography>
          <DataTable
            rows={data.dishes}
            rowKey={(d) => `${d.dishId}|${d.variantId}`}
            emptyText={L("వంటకాలు లేవు — మెనూ ఐటమ్స్ కి వంటకాలు జత చేయండి.", "No dishes — link menu items to dishes.")}
            columns={[
              { label: L("వంటకం", "Dish"), render: (d) => (lang === "te" ? d.nameTe || d.nameEn : d.nameEn || d.nameTe) },
              { label: L("మొత్తం", "Total"), align: "right", render: (d) => <b>{`${qtyText(d.total)} ${d.unit}`}</b> },
              {
                label: L("event వారీగా", "Per event"),
                render: (d) =>
                  d.perEvent
                    .map((x) => {
                      const ev = data.events.find((p) => p.bookingId === x.bookingId && p.sessionId === x.sessionId && (p.lunchBoxOrderId ?? "") === (x.lunchBoxOrderId ?? ""));
                      return `${ev ? partLabel(ev) : x.customer}: ${x.qty === null ? "—" : `${qtyText(x.qty)} ${d.unit}`}`;
                    })
                    .join(" · "),
              },
            ]}
          />
          <Typography variant="h6" component="h2" sx={{ mt: 3, mb: 1 }}>
            {L("కొనాల్సిన సరుకులు (అన్ని events కలిపి)", "Groceries to buy (all events together)")}
          </Typography>
          <IngredientsTable rows={data.ingredients} />
        </>
      )}
    </Box>
  );
}
