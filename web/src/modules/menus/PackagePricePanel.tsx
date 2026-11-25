import { useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Collapse, TextField, Typography } from "@mui/material";
import { useLang } from "../../i18n/LanguageContext";
import type { Role } from "../../auth/roles";
import { setKidsPrice, type MenuPackage } from "../../data/menuPackageRepository";
import { errorText, setStandardCost, suggestPackagePrice, type PackagePriceSuggestion } from "../../data/functions";
import { parseMoney } from "../../components/ui";
import { formatMoney } from "../../util/format";
import { tabularNums, toneColors } from "../../theme/tokens";

const BAND = {
  red: { tone: toneColors.bad, te: "నష్టం దగ్గర (15% లోపు)", en: "Near loss (under 15%)" },
  amber: { tone: toneColors.warning, te: "తక్కువ లాభం (15–25%)", en: "Low margin (15–25%)" },
  green: { tone: toneColors.good, te: "బాగుంది (25% పైన)", en: "Healthy (25% and above)" },
  unknown: { tone: toneColors.neutral, te: "తెలియదు — కొన్ని సరుకుల ధరలు లేవు", en: "Unknown — some ingredient prices missing" },
} as const;

/**
 * R10-4 suggested price (suggestPackagePrice — every number from the server, colour band red/amber/green) and
 * R10-11 kids plate price (owner sets; empty = kids plates not offered; others see it read-only).
 * The cost / margin part is admin-only (owner rule A2).
 */
export function PackagePricePanel({ pkg, role }: { pkg: MenuPackage; role: Role }) {
  const { L, T, lang } = useLang();
  const [guests, setGuests] = useState("100");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<PackagePriceSuggestion | null>(null);
  const [showLines, setShowLines] = useState(false);
  const [kids, setKids] = useState(pkg.kidsPrice === null ? "" : String(pkg.kidsPrice));
  const [kidsBusy, setKidsBusy] = useState(false);
  const [kidsMsg, setKidsMsg] = useState<string | null>(null);
  const isAdmin = role === "admin";
  // Owner decision 18 Nov 2026: a manager may also see plate cost / margin / suggested price here (the server allows
  // admin + manager). Fixing the standard cost stays owner-only.
  const canSuggest = role === "admin" || role === "manager";
  const [stdBusy, setStdBusy] = useState(false);
  const [stdMsg, setStdMsg] = useState<string | null>(null);

  async function fixStandard() {
    const g = parseInt(guests, 10);
    if (!Number.isInteger(g) || g < 1) {
      setStdMsg(L("అతిథుల సంఖ్య 1 లేదా ఎక్కువ.", "Guests must be 1 or more."));
      return;
    }
    setStdBusy(true);
    setStdMsg(null);
    try {
      const r = await setStandardCost({ packageId: pkg.id, guests: g });
      setStdMsg(L(`ప్రామాణిక ఖర్చు నిర్ణయించాం: ప్లేటుకి ${formatMoney(r.perPlate)}`, `Standard cost fixed: ${formatMoney(r.perPlate)} per plate`));
    } catch (e) {
      setStdMsg(errorText(e, lang));
    } finally {
      setStdBusy(false);
    }
  }

  async function suggest() {
    const g = parseInt(guests, 10);
    if (!Number.isInteger(g) || g < 1) {
      setError(L("అతిథుల సంఖ్య 1 లేదా ఎక్కువ.", "Guests must be 1 or more."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setRes(await suggestPackagePrice({ packageId: pkg.id, guests: g }));
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  }

  async function saveKids() {
    const v = kids.trim() === "" ? null : parseMoney(kids);
    if (v !== null && !Number.isFinite(v)) {
      setKidsMsg(L("ధర సరిగా లేదు.", "Price is not valid."));
      return;
    }
    setKidsBusy(true);
    setKidsMsg(null);
    try {
      await setKidsPrice(pkg.id, v);
      setKidsMsg(v === null ? L("పిల్లల ప్లేట్లు ఇవ్వము (ధర లేదు).", "Kids plates not offered.") : L("Save అయింది.", "Saved."));
    } catch (e) {
      setKidsMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setKidsBusy(false);
    }
  }

  const band = res ? BAND[res.band] : null;

  return (
    <Box sx={{ mt: 1.5, pt: 1.5, borderTop: "1px solid", borderColor: "divider", display: "grid", gap: 1 }}>
      <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {L("పిల్లల ప్లేట్", "Kids plate")}:
        </Typography>
        {isAdmin && !pkg.cancelled ? (
          <>
            <TextField
              size="small"
              value={kids}
              onChange={(e) => setKids(e.target.value)}
              placeholder={L("ఇవ్వము", "not offered")}
              slotProps={{ htmlInput: { inputMode: "decimal", "aria-label": L("పిల్లల ప్లేట్ ధర ₹", "Kids plate price ₹") } }}
              sx={{ width: 120 }}
            />
            <Button size="small" onClick={saveKids} disabled={kidsBusy}>
              {L("Save", "Save")}
            </Button>
            {kidsMsg && <Typography variant="caption">{kidsMsg}</Typography>}
          </>
        ) : (
          <Typography variant="body2">{pkg.kidsPrice === null ? L("ఇవ్వము", "not offered") : formatMoney(pkg.kidsPrice)}</Typography>
        )}
      </Box>
      {canSuggest && !pkg.cancelled && (
        <>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
            <TextField
              size="small"
              label={L("అతిథులు", "Guests")}
              value={guests}
              onChange={(e) => setGuests(e.target.value)}
              slotProps={{ htmlInput: { inputMode: "numeric" } }}
              sx={{ width: 110 }}
            />
            <Button size="small" variant="outlined" onClick={suggest} disabled={busy}>
              {busy ? <CircularProgress size={18} /> : L("ప్లేటు ఖర్చు & సూచించే ధర", "Plate cost & suggested price")}
            </Button>
          </Box>
          {/* Module 2i: the standard plate cost — fixed by the owner, kept until fixed again */}
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
            <Typography variant="body2">
              <b>{L("ప్రామాణిక ఖర్చు", "Standard cost")}:</b>{" "}
              {pkg.standardCost
                ? `${formatMoney(pkg.standardCost.perPlate)} / ${L("ప్లేటు", "plate")}${pkg.standardCost.at ? ` (${pkg.standardCost.at.toLocaleDateString("en-IN")})` : ""}`
                : L("ఇంకా నిర్ణయించలేదు", "not fixed yet")}
            </Typography>
            {isAdmin && (
              <Button size="small" onClick={fixStandard} disabled={stdBusy}>
                {pkg.standardCost ? L("ఇప్పటి ధరలతో మళ్ళీ నిర్ణయించు", "Fix again at today's rates") : L("ఇప్పటి ధరలతో నిర్ణయించు", "Fix at today's rates")}
              </Button>
            )}
            {stdMsg && <Typography variant="caption">{stdMsg}</Typography>}
          </Box>
          {error && <Alert severity="error">{error}</Alert>}
          {res && band && (
            <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: band.tone.tint, borderLeft: `4px solid ${band.tone.main}`, display: "grid", gap: 0.5 }}>
              <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                <Chip size="small" label={L(res.bandTe || band.te, band.en)} sx={{ bgcolor: band.tone.main, color: "#fff", fontWeight: 600 }} />
                <Typography sx={{ ...tabularNums, fontWeight: 600 }}>
                  {L("లాభం", "Margin")} {res.marginPct === null ? "—" : `${res.marginPct}%`}
                </Typography>
              </Box>
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr auto", columnGap: 2, ...tabularNums }}>
                <span>{L("సరుకుల ఖర్చు / ప్లేటు", "Food per plate")}</span>
                <span>{formatMoney(res.foodPerPlate)}</span>
                <span>{L("కూలీ / ప్లేటు", "Labour per plate")}</span>
                <span>{formatMoney(res.labourPerPlate)}</span>
                <span>{L("ఇతర ఖర్చు / ప్లేటు", "Overhead per plate")}</span>
                <span>{formatMoney(res.overheadPerPlate)}</span>
                <b>{L("ప్లేటు ఖర్చు", "Plate cost")}</b>
                <b>{res.plateCost === null ? L(`తెలియదు (తెలిసిన భాగం ${formatMoney(res.knownPlateCost)})`, `Unknown (known part ${formatMoney(res.knownPlateCost)})`) : formatMoney(res.plateCost)}</b>
                <span>{L("ఇప్పటి ధర", "Current price")}</span>
                <span>{formatMoney(res.currentPrice)}</span>
                <b>{L(`సూచించే ధర (${res.targetMarginPct}% లాభంతో)`, `Suggested price (${res.targetMarginPct}% margin)`)}</b>
                <b>{res.suggestedPrice === null ? "—" : formatMoney(res.suggestedPrice)}</b>
              </Box>
              {res.band === "unknown" && (
                <Alert severity="info" sx={{ py: 0 }}>
                  {T(res.summary)}
                </Alert>
              )}
              {res.warnings.map((w, i) => (
                <Alert key={i} severity="warning" sx={{ py: 0 }}>
                  {T(w)}
                </Alert>
              ))}
              {res.ingredients.length > 0 && (
                <>
                  <Button size="small" sx={{ justifySelf: "start", px: 0 }} onClick={() => setShowLines((v) => !v)}>
                    {showLines ? L("సరుకుల లెక్క దాచు", "Hide ingredient maths") : L(`సరుకుల లెక్క (${res.ingredients.length})`, `Ingredient maths (${res.ingredients.length})`)}
                  </Button>
                  <Collapse in={showLines} unmountOnExit>
                    <Box sx={{ display: "grid", gap: 0.25 }}>
                      {res.ingredients.map((g) => (
                        <Typography key={g.groceryItemId} variant="body2" sx={tabularNums}>
                          {L(g.nameTe || g.nameEn, g.nameEn || g.nameTe)}: {g.qty} {g.unit} ×{" "}
                          {g.rate === null ? L("ధర లేదు", "no rate") : `${formatMoney(g.rate)}${g.vendor ? ` (${g.vendor}${g.rateDay ? `, ${g.rateDay}` : ""})` : ""}`}
                          {g.cost !== null ? ` = ${formatMoney(g.cost)}` : ""}
                          {g.unitMismatch ? ` — ${L("unit తేడా", "unit differs")}` : ""}
                        </Typography>
                      ))}
                    </Box>
                  </Collapse>
                </>
              )}
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
