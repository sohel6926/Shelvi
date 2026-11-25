import { useState } from "react";
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { useLang } from "../../i18n/LanguageContext";
import { decideBatchHold, errorText, holdBatch, traceBatch, type BatchTrace } from "../../data/functions";
import { formatDay } from "../../util/dates";

/**
 * Module 5d (food safety) — on each batch: put it on hold (it is then not planned with, reserved or sold), release
 * or discard a held batch, and see which events the batch went to. Owner / managers; the server decides who may
 * release (not the person who placed the hold).
 */
export function BatchSafety({ itemId, batchId, hold, holdReason, unit }: { itemId: string; batchId: string; hold: boolean; holdReason: string; unit: string }) {
  const { L, lang } = useLang();
  const [busy, setBusy] = useState(false);
  const [trace, setTrace] = useState<BatchTrace | null>(null);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
    } catch (e) {
      window.alert(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };
  const ask = (text: string) => (window.prompt(text) ?? "").trim();

  return (
    <>
      {hold && <Chip size="small" color="error" label={`${L("ఆపారు", "On hold")}${holdReason ? `: ${holdReason}` : ""}`} />}
      {!hold ? (
        <Button
          size="small"
          color="warning"
          disabled={busy}
          onClick={() => {
            const reason = ask(L("ఈ బ్యాచ్‌ను ఎందుకు ఆపుతున్నారు? (వాసన, పాడైంది, అనుమానం …)", "Why are you holding this batch? (smell, damage, doubt …)"));
            if (reason) void run(() => holdBatch({ itemId, batchId, reason }));
          }}
        >
          {L("ఆపు", "Hold")}
        </Button>
      ) : (
        <>
          <Button
            size="small"
            color="success"
            disabled={busy}
            onClick={() => {
              const note = ask(L("విడుదల చేయడానికి కారణం రాయండి (ఏమి తనిఖీ చేశారు)", "Why is it safe to release? (what was checked)"));
              if (note) void run(() => decideBatchHold({ itemId, batchId, decision: "release", note }));
            }}
          >
            {L("విడుదల", "Release")}
          </Button>
          <Button
            size="small"
            color="error"
            disabled={busy}
            onClick={() => {
              const note = ask(L("పారవేయడానికి కారణం రాయండి — ఈ బ్యాచ్ మొత్తం నిల్వ నుంచి తీసేస్తాం", "Why is it being discarded? — the whole batch leaves the stock"));
              if (note) void run(() => decideBatchHold({ itemId, batchId, decision: "discard", note }));
            }}
          >
            {L("పారవేయి", "Discard")}
          </Button>
        </>
      )}
      <Button size="small" disabled={busy} onClick={() => void run(async () => setTrace(await traceBatch({ itemId, batchId })))}>
        {L("ఎక్కడికి వెళ్ళింది", "Where it went")}
      </Button>
      {trace && (
        <Dialog open onClose={() => setTrace(null)} fullWidth maxWidth="sm">
          <DialogTitle>
            {trace.item.name} — {L("బ్యాచ్ జాడ", "Batch trace")}
          </DialogTitle>
          <DialogContent sx={{ display: "grid", gap: 1.5 }}>
            <Typography variant="body2">
              {L(`వచ్చింది ${trace.batch.receivedQty} ${unit}`, `Received ${trace.batch.receivedQty} ${unit}`)}
              {trace.batch.receivedDay ? ` · ${formatDay(trace.batch.receivedDay, lang)}` : ""}
              {trace.batch.batchNo ? ` · #${trace.batch.batchNo}` : ""} · {L(`వాడింది ${trace.totalTaken} ${unit}`, `Used ${trace.totalTaken} ${unit}`)} · {L(`మిగిలింది ${trace.batch.qty} ${unit}`, `Left ${trace.batch.qty} ${unit}`)}
            </Typography>
            {trace.events.length === 0 ? (
              <Alert severity="info">{L("ఈ బ్యాచ్ ఇంకా ఏ కార్యక్రమానికీ వెళ్ళలేదు.", "This batch has not gone to any event yet.")}</Alert>
            ) : (
              <Box>
                <Typography variant="subtitle2">{L("ఈ బ్యాచ్ వాడిన కార్యక్రమాలు", "Events this batch was used for")}</Typography>
                {trace.events.map((e) => (
                  <Box key={e.bookingId} sx={{ display: "flex", justifyContent: "space-between", gap: 1, borderBottom: 1, borderColor: "divider", py: 0.5 }}>
                    <Typography variant="body2">
                      {e.day ? `${formatDay(e.day, lang)} · ` : ""}
                      {e.customer || e.bookingId}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {e.taken} {unit}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
            {trace.uses.some((u) => !u.bookingId) && (
              <Typography variant="caption" color="text.secondary">
                {L("కార్యక్రమానికి చెందని వాడకం (చేతి సవరణ, అమ్మకం, పారవేయడం) కూడా ఉంది:", "Some use was not for an event (hand adjustment, sale, discard):")} {trace.uses.filter((u) => !u.bookingId).reduce((a, u) => a + u.taken, 0)} {unit}
              </Typography>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setTrace(null)}>{L("మూసివేయి", "Close")}</Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}
