import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { Box, Chip, Paper, Typography } from "@mui/material";
import { db } from "../../firebase";
import { dateLocale, useLang } from "../../i18n/LanguageContext";
import type { GroceryItem } from "../../data/groceryRepository";

interface Line {
  groceryItemId: string;
  perUnit: number;
}
interface Version {
  id: string;
  version: number;
  unit: string;
  typedRecipe: Line[];
  variants: { id: string; nameTe: string; nameEn: string; typedRecipe: Line[] }[];
  /** Module 2e: bases used by the dish in this version (JSON text, for comparing versions) and how many */
  basesKey: string;
  basesCount: number;
  changedAt: Date | null;
}

const toLines = (raw: unknown): Line[] =>
  Array.isArray(raw)
    ? raw
        .filter((l): l is { groceryItemId: string; perUnit: number } => !!l && typeof l.groceryItemId === "string" && typeof l.perUnit === "number")
        .map((l) => ({ groceryItemId: l.groceryItemId, perUnit: l.perUnit }))
    : [];

/** What changed from `before` to `after`, per ingredient (same rule as the server's recipeDiff). */
function diff(before: Line[], after: Line[]): { groceryItemId: string; from: number | null; to: number | null }[] {
  const a = new Map(before.map((l) => [l.groceryItemId, l.perUnit]));
  const b = new Map(after.map((l) => [l.groceryItemId, l.perUnit]));
  return [...new Set([...a.keys(), ...b.keys()])]
    .sort()
    .map((id) => ({ groceryItemId: id, from: a.has(id) ? (a.get(id) as number) : null, to: b.has(id) ? (b.get(id) as number) : null }))
    .filter((d) => d.from !== d.to);
}

/**
 * Module 2b — "రెసిపీ చరిత్ర": every saved change of this dish's typed recipe (dishes/{id}/recipeVersions, written by
 * the server). Newest first; each version shows what changed against the one before it. Read-only.
 */
export function RecipeVersionsPanel({ dishId, master }: { dishId: string; master: GroceryItem[] }) {
  const { L, lang } = useLang();
  const [versions, setVersions] = useState<Version[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "dishes", dishId, "recipeVersions"), orderBy("version", "asc")),
        (snap) =>
          setVersions(
            snap.docs.map((d) => {
              const x = d.data();
              const at = x.changedAt as { toDate?: () => Date } | null | undefined;
              return {
                id: d.id,
                version: typeof x.version === "number" ? x.version : 0,
                unit: typeof x.unit === "string" ? x.unit : "",
                typedRecipe: toLines(x.typedRecipe),
                variants: Array.isArray(x.variants)
                  ? x.variants.map((v: Record<string, unknown>) => ({ id: String(v.id ?? ""), nameTe: String(v.nameTe ?? ""), nameEn: String(v.nameEn ?? ""), typedRecipe: toLines(v.typedRecipe) }))
                  : [],
                basesKey: JSON.stringify(Array.isArray(x.subRecipes) ? x.subRecipes : []),
                basesCount: Array.isArray(x.subRecipes) ? x.subRecipes.length : 0,
                changedAt: at && typeof at.toDate === "function" ? at.toDate() : null,
              };
            }),
          ),
        (e) => setError(e.message),
      ),
    [dishId],
  );

  const name = (id: string) => {
    const g = master.find((m) => m.id === id);
    return g ? (lang === "te" ? g.nameTe || g.nameEn : g.nameEn || g.nameRoman || g.nameTe) : id;
  };
  const unitOf = (id: string) => master.find((m) => m.id === id)?.unit ?? "";
  const fmt = (n: number | null) => (n === null ? "—" : String(n));

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
        {L("రెసిపీ చరిత్ర (మార్చలేరు)", "Recipe history (read-only)")}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {L("రెసిపీ మార్చి Save చేసిన ప్రతిసారీ పాతది ఇక్కడ అలాగే ఉంటుంది.", "Each time the recipe is changed and saved, the earlier one stays here.")}
      </Typography>
      {error && <Typography color="error">{error}</Typography>}
      {versions.length === 0 && !error && <Typography color="text.secondary">{L("ఇంకా రెసిపీ save చేయలేదు.", "No recipe saved yet.")}</Typography>}
      <Box sx={{ display: "grid", gap: 1 }}>
        {[...versions].reverse().map((v, i, arr) => {
          const prev = arr[i + 1];
          const changes = prev ? diff(prev.typedRecipe, v.typedRecipe) : [];
          const variantChanged = prev ? JSON.stringify(prev.variants.map((x) => [x.id, x.typedRecipe])) !== JSON.stringify(v.variants.map((x) => [x.id, x.typedRecipe])) : false;
          return (
            <Paper key={v.id} variant="outlined" sx={{ p: 1.25 }}>
              <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                <Chip size="small" color={i === 0 ? "primary" : "default"} label={`${L("వెర్షన్", "Version")} ${v.version}`} />
                {i === 0 && <Chip size="small" variant="outlined" label={L("ఇప్పటిది", "Current")} />}
                {v.basesCount > 0 && <Chip size="small" variant="outlined" label={L(`బేస్‌లు ${v.basesCount}`, `bases ${v.basesCount}`)} />}
                {prev && prev.basesKey !== v.basesKey && <Chip size="small" color="warning" variant="outlined" label={L("బేస్‌లు మారాయి", "bases changed")} />}
                <Typography variant="body2" color="text.secondary">
                  {v.changedAt ? v.changedAt.toLocaleString(dateLocale(lang), { dateStyle: "medium", timeStyle: "short" }) : ""}
                </Typography>
              </Box>
              {!prev ? (
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  {v.typedRecipe.length
                    ? v.typedRecipe.map((l) => `${name(l.groceryItemId)} ${l.perUnit} ${unitOf(l.groceryItemId)}`).join(" · ")
                    : L("(ప్రధాన రెసిపీ ఖాళీ)", "(main recipe empty)")}
                </Typography>
              ) : (
                <Box sx={{ mt: 0.5 }}>
                  {changes.map((c) => (
                    <Typography key={c.groceryItemId} variant="body2">
                      {name(c.groceryItemId)}: {fmt(c.from)} → {fmt(c.to)} {unitOf(c.groceryItemId)}
                      {c.from === null ? ` (${L("కొత్తగా చేర్చారు", "added")})` : c.to === null ? ` (${L("తీసేశారు", "removed")})` : ""}
                    </Typography>
                  ))}
                  {prev.unit !== v.unit && (
                    <Typography variant="body2">
                      {L("యూనిట్", "Unit")}: {prev.unit} → {v.unit}
                    </Typography>
                  )}
                  {variantChanged && <Typography variant="body2">{L("రకాల రెసిపీ మారింది", "A variant's recipe changed")}</Typography>}
                </Box>
              )}
            </Paper>
          );
        })}
      </Box>
    </Paper>
  );
}
