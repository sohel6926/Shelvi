import { Box, Chip, Typography } from "@mui/material";
import { useLang } from "../../i18n/LanguageContext";
import { DataTable } from "../../components/DataTable";
import type { PlanDish, PlanIngredient } from "../../data/functions";
import { STYLE_LABEL, BAND_LABEL, comboLabel, type ServiceStyle, type SizeBand } from "../../data/dishRepository";

/** "12.5" / "263" — quantities without trailing zeros. */
export function qtyText(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return String(Math.round(n * 100) / 100);
}

/** Ingredient per 1 unit of dish: up to 4 decimals so "qty × perUnit = total" reads right (0.0973, not 0.1). */
function perUnitText(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return String(Math.round(n * 10000) / 10000);
}

/** Learning badge chip: "నేర్చుకుంటోంది 2/5" (orange), "నేర్చుకున్నది ✓" (green), none (grey). */
export function LearnChip({ status, te, en }: { status: string; te: string; en: string }) {
  const { L } = useLang();
  return <Chip size="small" color={status === "learned" ? "success" : status === "learning" ? "warning" : "default"} variant={status === "none" ? "outlined" : "filled"} label={L(te, en)} />;
}

const SOURCE_LABEL: Record<string, { te: string; en: string }> = {
  piece: { te: "ఒక్కొక్కరికి లెక్క", en: "Per plate" },
  cell: { te: "ఇదే రకం events నుండి", en: "From the same kind of events" },
  factors: { te: "మన events నుండి + సర్దుబాటు", en: "From our events + adjustments" },
  typed: { te: "మీరు ఇచ్చిన నియమం", en: "Your starting rule" },
  none: { te: "ఇంకా లెక్క లేదు", en: "No number yet" },
};

/** One planned dish: quantity, badge, why-lines and the ingredient maths (qty × perUnit). */
export function PlanDishBlock({ d, names }: { d: PlanDish; names: Map<string, { te: string; en: string; unit: string }> }) {
  const { L, T, lang } = useLang();
  const name = lang === "te" ? d.nameTe || d.nameEn : d.nameEn || d.nameTe;
  return (
    <Box sx={{ py: 1.25, borderBottom: 1, borderColor: "divider" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, alignItems: "flex-start", flexWrap: "wrap" }}>
        <Box>
          <Typography sx={{ fontWeight: 600 }}>{name}</Typography>
          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.5 }}>
            <LearnChip status={d.status} te={d.statusTe || L("ఇంకా నేర్చుకోలేదు", "Not learned yet")} en={d.status === "learned" ? "Learned ✓" : d.status === "learning" ? `Learning ${d.eventsUsed}/5` : "Not learned yet"} />
            {SOURCE_LABEL[d.source] && <Chip size="small" variant="outlined" label={T(SOURCE_LABEL[d.source])} />}
          </Box>
        </Box>
        <Box sx={{ textAlign: "right" }}>
          <Typography variant="h6" component="p" sx={{ lineHeight: 1.2 }}>
            {d.qty === null ? "—" : `${qtyText(d.qty)} ${d.unit}`}
          </Typography>
          {d.per100 !== null && (
            <Typography variant="caption" color="text.secondary">
              {L(`100 మందికి ${qtyText(d.per100)} ${d.unit}`, `${qtyText(d.per100)} ${d.unit} per 100`)}
            </Typography>
          )}
        </Box>
      </Box>
      {d.why.length > 0 && (
        <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
          {d.why.map((w, i) => (
            <Typography component="li" variant="body2" key={i} color="text.secondary">
              {T(w)}
            </Typography>
          ))}
        </Box>
      )}
      {d.qty === null && (
        <Typography variant="body2" color="warning.main" sx={{ mt: 0.5 }}>
          {L(
            "ఈ వంటకానికి ఇంకా లెక్క లేదు — వంటకం పేజీలో \"100 మందికి మొదటి అంచనా\" లేదా మొదటి నియమం పెట్టండి, లేదా event అయ్యాక వంట నమోదు చేయండి.",
            "No number yet — give a starting guess or rule on the dish page, or log what was cooked after an event.",
          )}
        </Typography>
      )}
      {d.ingredients.length > 0 && (
        <Box sx={{ mt: 0.75, pl: 1, borderLeft: 3, borderColor: "divider" }}>
          {d.ingredients.map((g) => {
            const n = names.get(g.groceryItemId);
            const gname = n ? (lang === "te" ? n.te || n.en : n.en || n.te) : g.groceryItemId;
            return (
              <Typography key={g.groceryItemId} variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
                {gname}: {qtyText(d.qty)} {d.unit} × {perUnitText(g.perUnit)} = <b>{qtyText(g.qty)} {n?.unit ?? ""}</b>
              </Typography>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

/** Header line of one event part: guests, size band, service style, menu combination. */
export function PartFacts({
  guests,
  band,
  serviceStyle,
  comboKey,
  kidsCount = 0,
  specialMeals = [],
  kind,
}: {
  guests: number;
  band: string;
  serviceStyle: string;
  comboKey: string;
  kidsCount?: number;
  specialMeals?: { type: string; typeTe: string; count: number; note: string }[];
  kind?: string;
}) {
  const { L, T, lang } = useLang();
  const st = STYLE_LABEL[serviceStyle as ServiceStyle];
  const bd = BAND_LABEL[band as SizeBand];
  return (
    <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
      <Chip size="small" label={L(`${guests} మంది`, `${guests} guests`)} />
      {bd && <Chip size="small" variant="outlined" label={T(bd)} />}
      <Chip size="small" variant="outlined" color={st ? "default" : "warning"} label={st ? T(st) : L("వడ్డన రకం ఇవ్వలేదు", "No service style")} />
      {comboKey && <Chip size="small" variant="outlined" label={`${L("కలయిక", "Combo")}: ${comboLabel(comboKey, lang)}`} />}
      {kind === "lunchBox" && <Chip size="small" color="secondary" label={L("లంచ్ బాక్సులు", "Lunch boxes")} />}
      {kidsCount > 0 && <Chip size="small" color="info" variant="outlined" label={L(`పిల్లలు ${kidsCount} (కలిపి)`, `incl. ${kidsCount} kids`)} />}
      {specialMeals.map((m, i) => (
        <Chip key={i} size="small" color="warning" variant="outlined" label={`${L(m.typeTe || m.type, m.type)} ${m.count}${m.note ? ` — ${m.note}` : ""}`} />
      ))}
    </Box>
  );
}

/** Grocery lines: needed (from dish recipes + per-100 items) / in stock / to buy. */
export function IngredientsTable({ rows }: { rows: PlanIngredient[] }) {
  const { L, lang } = useLang();
  return (
    <DataTable
      rows={rows}
      rowKey={(r) => r.groceryItemId}
      emptyText={L(
        "సరుకుల లెక్క లేదు — వంటకాలకి వంట నమోదు (వాడిన సరుకులు) లేదా సరుకుల జాబితాలో \"100 మందికి\" పెట్టండి.",
        "No groceries yet — log ingredients used for the dishes, or set per-100 amounts in the grocery list.",
      )}
      columns={[
        { label: L("సరుకు", "Item"), render: (r) => (lang === "te" ? r.nameTe || r.nameEn : r.nameEn || r.nameTe) },
        {
          label: L("కావాలి", "Needed"),
          align: "right",
          render: (r) => `${qtyText(r.needed)} ${r.unit}`,
        },
        {
          label: L("ఎక్కడి నుండి", "From"),
          hideOnMobile: true,
          render: (r) =>
            [r.fromDishes > 0 ? L(`వంటకాలు ${qtyText(r.fromDishes)}`, `dishes ${qtyText(r.fromDishes)}`) : "", r.fromPer100 > 0 ? L(`100 మందికి లెక్క ${qtyText(r.fromPer100)}`, `per-100 ${qtyText(r.fromPer100)}`) : ""]
              .filter(Boolean)
              .join(" + "),
        },
        {
          label: L("నిల్వ", "In stock"),
          align: "right",
          render: (r) => (
            <>
              {`${qtyText(r.inStock)} ${r.unit}`}
              {/* Module 2g: stock promised to other confirmed events is not counted for this one */}
              {typeof r.expired === "number" && r.expired > 0 ? (
                <span style={{ display: "block", fontSize: "0.8em", color: "#b3261e" }}>{L(`గడువు దాటినది ${qtyText(r.expired)} — లెక్కలో లేదు`, `expired ${qtyText(r.expired)} — not counted`)}</span>
              ) : null}
              {typeof r.reservedOthers === "number" && r.reservedOthers > 0 ? (
                <span style={{ display: "block", fontSize: "0.8em", opacity: 0.75 }}>{L(`వేరే ఈవెంట్‌లకు రిజర్వ్ ${qtyText(r.reservedOthers)}`, `reserved for other events ${qtyText(r.reservedOthers)}`)}</span>
              ) : null}
            </>
          ),
        },
        {
          label: L("కొనాలి", "To buy"),
          align: "right",
          render: (r) => (
            <>
              {r.toBuy > 0 ? <b>{`${qtyText(r.toBuy)} ${r.unit}`}</b> : "—"}
              {/* Module 2c: the item loses weight in cleaning, so more than the recipe quantity must be on hand */}
              {typeof r.yieldPct === "number" && r.yieldPct < 100 && typeof r.gross === "number" ? (
                <span style={{ display: "block", fontSize: "0.8em", opacity: 0.75 }}>
                  {L(`శుభ్రం చేశాక ${r.yieldPct}% వస్తుంది → ${qtyText(r.gross)} ${r.unit} కావాలి`, `${r.yieldPct}% usable → ${qtyText(r.gross)} ${r.unit} needed`)}
                </span>
              ) : null}
            </>
          ),
        },
      ]}
    />
  );
}

/** Plain-text plan for WhatsApp (Telugu first). */
export function planText(
  title: string,
  dishes: { name: string; qty: number | null; unit: string }[],
  ingredients: PlanIngredient[],
  lang: "te" | "en",
): string {
  const te = lang === "te";
  const lines = [title, "", te ? "వంటకాలు:" : "Dishes:"];
  for (const d of dishes) lines.push(`• ${d.name}: ${d.qty === null ? "—" : `${qtyText(d.qty)} ${d.unit}`}`);
  const buy = ingredients.filter((i) => i.toBuy > 0);
  if (buy.length) {
    lines.push("", te ? "కొనాల్సినవి:" : "To buy:");
    for (const i of buy) lines.push(`• ${te ? i.nameTe || i.nameEn : i.nameEn || i.nameTe}: ${qtyText(i.toBuy)} ${i.unit}`);
  }
  return lines.join("\n");
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  }
}
