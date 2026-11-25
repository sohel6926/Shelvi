import { useEffect, useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Link, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSession } from "../../auth/AuthProvider";
import { hasPer100, subscribeGroceryItems, type GroceryItem } from "../../data/groceryRepository";
import PrintIcon from "@mui/icons-material/Print";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { dateLocale, useLang } from "../../i18n/LanguageContext";
import { errorText, groceryList, type GroceryLine } from "../../data/functions";
import { EVENT_TYPE_LABEL } from "../../i18n/eventLabels";
import { DataTable } from "../../components/DataTable";
import { ScreenTitle } from "../../components/ui";
import { tokens } from "../../theme/tokens";
import { EMPTY_EVENT_INPUT, EventInputs, eventRef, type EventInputValue } from "./EventInputs";

function qty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

/** Sum of quantities per unit, e.g. "25 kg + 8 L + 40 pcs". */
function perUnit(lines: GroceryLine[], pick: (l: GroceryLine) => number): string {
  const sums = new Map<string, number>();
  for (const l of lines) {
    const v = pick(l);
    if (v > 0) sums.set(l.unit, (sums.get(l.unit) ?? 0) + v);
  }
  return [...sums.entries()].map(([u, v]) => `${qty(Math.round(v * 100) / 100)} ${u}`).join(" + ") || "0";
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Older browsers / no permission: select a hidden textarea and copy.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

/** "సరుకుల లెక్క": groceries for an event (calc §6, server `groceryList`) — in stock vs to buy. */
export function GroceryPage() {
  const { L, T, lang } = useLang();
  const navigate = useNavigate();
  const session = useSession();
  const isAdmin = session.status === "loggedIn" && session.profile.role === "admin";
  const [master, setMaster] = useState<GroceryItem[]>([]);
  const [params] = useSearchParams();
  const [input, setInput] = useState<EventInputValue>(EMPTY_EVENT_INPUT);
  const [rawLines, setRawLines] = useState<GroceryLine[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => subscribeGroceryItems((rows) => setMaster(rows.filter((r) => !r.cancelled)), () => setMaster([])), []);
  const guests = parseInt(input.guests, 10);
  const valid = Number.isInteger(guests) && guests >= 1;

  async function load() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const res = await groceryList({ guests, eventTypeCode: input.eventTypeCode, ...eventRef(input) });
      setRawLines(res.items);
    } catch (e) {
      setError(errorText(e, lang));
      setRawLines(null);
    } finally {
      setBusy(false);
    }
  }

  // Recalculate (debounced) whenever the guests / event type change.
  useEffect(() => {
    if (!valid) return;
    const t = window.setTimeout(() => void load(), 350);
    return () => window.clearTimeout(t);
  }, [input.guests, input.eventTypeCode, input.booking?.id, input.sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Only items with a per-100 quantity take part (the master has ~370 items, most without one yet).
  const masterById = new Map(master.map((m) => [m.id, m]));
  const lines =
    rawLines?.filter((l) => {
      const m = masterById.get(l.groceryItemId);
      return m ? hasPer100(m) : l.quantity > 0;
    }) ?? null;
  const notCounted = master.filter((m) => !hasPer100(m)).length;
  const b = input.booking;
  const heading = [
    b?.customerNameSnapshot,
    b?.eventDate?.toLocaleDateString(dateLocale(lang), { day: "numeric", month: "short", year: "numeric" }),
    valid ? L(`${guests} మంది`, `${guests} guests`) : "",
    T(EVENT_TYPE_LABEL[input.eventTypeCode]),
  ]
    .filter(Boolean)
    .join(" · ");
  const toBuy = (lines ?? []).filter((l) => l.toBuy > 0);

  function whatsappText(): string {
    const rows = (lines ?? []).map(
      (l, i) =>
        `${i + 1}. ${l.nameTe || l.nameEn} — ${qty(l.quantity)} ${l.unit}` +
        (l.toBuy > 0 ? ` (కొనాలి ${qty(l.toBuy)} ${l.unit})` : " (stock లో ఉంది)"),
    );
    return [`సరుకుల లెక్క — ${heading}`, "", ...rows, "", `కొనాల్సినవి: ${toBuy.length} వస్తువులు`].join("\n");
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1000, "@media print": { p: 0, maxWidth: "none" } }}>
      <Box sx={{ displayPrint: "none" }}>
        <ScreenTitle
          title={L("సరుకుల లెక్క", "Grocery list")}
          subtitle={L("ఎంతమందికి, ఏ event — ఎంత సరుకు కావాలి, stock లో ఎంత ఉంది, ఎంత కొనాలి", "For how many guests and which event — how much is needed, in stock, and to buy")}
          onRefresh={load}
          action={
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              <Button
                variant="outlined"
                startIcon={<ContentCopyIcon />}
                disabled={!lines?.length}
                onClick={async () => {
                  await copyText(whatsappText());
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2500);
                }}
              >
                {copied ? <><CheckIcon fontSize="small" sx={{ mr: 0.5 }} />{L("Copy అయింది", "Copied")}</> : L("WhatsApp కి copy", "Copy for WhatsApp")}
              </Button>
              <Button variant="contained" startIcon={<PrintIcon />} disabled={!lines?.length} onClick={() => window.print()}>
                {L("ప్రింట్", "Print")}
              </Button>
            </Box>
          }
        />
        <EventInputs value={input} onChange={setInput} initialBookingId={params.get("booking")} initialSessionId={params.get("session")} />
        {!valid && <Alert severity="info">{L("అతిథుల సంఖ్య ఇవ్వండి (1 లేదా ఎక్కువ).", "Enter the number of guests (1 or more).")}</Alert>}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
      </Box>

      {/* Printed heading */}
      <Box sx={{ display: "none", displayPrint: "block", mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          {L("సరుకుల లెక్క", "Grocery list")}
        </Typography>
        <Typography>{heading}</Typography>
      </Box>

      {busy && !lines && <CircularProgress />}
      {lines && (
        <>
          <Box sx={{ display: "flex", gap: 1, mb: 1.5, flexWrap: "wrap", displayPrint: "none" }}>
            <Chip label={L(`${lines.length} సరుకులు`, `${lines.length} items`)} />
            <Chip color={toBuy.length ? "error" : "success"} label={toBuy.length ? L(`${toBuy.length} కొనాలి`, `${toBuy.length} to buy`) : L("అన్నీ stock లో ఉన్నాయి", "All in stock")} />
            {b && <Chip color="info" label={heading} />}
          </Box>
          <DataTable
            rows={lines}
            rowKey={(l) => l.groceryItemId}
            emptyText={L("సరుకుల జాబితా ఖాళీగా ఉంది — 'సరుకుల జాబితా' పేజీలో చేర్చండి.", "No grocery items — add them on the Grocery items page.")}
            columns={[
              { label: L("సరుకు", "Item"), render: (l) => (lang === "te" ? l.nameTe || l.nameEn : l.nameEn || l.nameTe) },
              { label: L("కావాల్సింది", "Needed"), align: "right", render: (l) => `${qty(l.quantity)} ${l.unit}` },
              { label: L("Stock లో", "In stock"), align: "right", render: (l) => `${qty(l.inStock)} ${l.unit}` },
              {
                label: L("కొనాలి", "To buy"),
                align: "right",
                render: (l) =>
                  l.toBuy > 0 ? (
                    <Box component="span" sx={{ color: tokens.color.bad, fontWeight: 600 }}>
                      {qty(l.toBuy)} {l.unit}
                    </Box>
                  ) : (
                    <Box component="span" sx={{ color: tokens.color.good }}>
                      ✓
                    </Box>
                  ),
              },
            ]}
            footer={
              lines.length > 0
                ? [L("మొత్తం", "Total"), perUnit(lines, (l) => l.quantity), perUnit(lines, (l) => l.inStock), perUnit(lines, (l) => l.toBuy)]
                : undefined
            }
          />
          {notCounted > 0 && (
            <Typography variant="body2" sx={{ mt: 1.5, displayPrint: "none" }}>
              {isAdmin ? (
                <Link component="button" onClick={() => navigate("/grocery-items")}>
                  {L(`per-100 పెట్టని ${notCounted} సరుకులు లెక్కలో లేవు`, `${notCounted} items without a per-100 quantity are not counted`)}
                </Link>
              ) : (
                L(`per-100 పెట్టని ${notCounted} సరుకులు లెక్కలో లేవు`, `${notCounted} items without a per-100 quantity are not counted`)
              )}
            </Typography>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, displayPrint: "none" }}>
            {L(
              "పరిమాణాలు 5% అదనంతో server లెక్కిస్తుంది. Stock వస్తువుతో జత చేయని సరుకులకి 'Stock లో' 0 గా చూపిస్తుంది.",
              "Quantities include a 5% buffer and come from the server. Items not linked to stock show 0 in stock.",
            )}
          </Typography>
        </>
      )}
    </Box>
  );
}
