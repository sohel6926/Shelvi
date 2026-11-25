import type { ReactNode } from "react";
import { Alert, Box, Chip, Typography } from "@mui/material";
import { formatIndian } from "../theme/motion";
import { kolamDividerSx } from "../theme/tokens";
import { useLang } from "../i18n/LanguageContext";
import { RefreshButton } from "./RefreshButton";

/** "₹12,34,567" — whole rupees, Indian grouping (KPI numbers). */
export function rupees(n: number | null | undefined): string {
  return Number.isFinite(n) ? `₹${formatIndian(n as number)}` : "—";
}

/** "₹1,234.50" — keeps paise (tables, totals); whole rupees show no decimals. */
export function rupees2(n: number | null | undefined): string {
  if (!Number.isFinite(n)) return "—";
  const v = n as number;
  const hasPaise = Math.round(Math.abs(v) * 100) % 100 !== 0;
  const digits = hasPaise ? 2 : 0;
  return `${v < 0 ? "−" : ""}₹${Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export type Band = "good" | "warn" | "bad" | "none";

/** Status chip for a good / warn / bad band — colour AND words, never colour alone. */
export function BandChip({ band }: { band: Band }) {
  const { L } = useLang();
  const label =
    band === "good" ? L("బాగుంది", "Good") : band === "warn" ? L("జాగ్రత్త", "Watch") : band === "bad" ? L("నష్టం", "Poor") : L("డేటా లేదు", "No data");
  const color = band === "good" ? "success" : band === "warn" ? "warning" : band === "bad" ? "error" : "default";
  return <Chip size="small" color={color} label={label} />;
}

/** Page title with optional subtitle, action and Refresh icon, plus the one kolam dot row per screen. */
export function ScreenTitle({
  title,
  subtitle,
  action,
  onRefresh,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  onRefresh?: () => Promise<unknown>;
}) {
  return (
    <Box sx={{ mb: 3 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2, flexWrap: "wrap" }}>
        <Box>
          <Typography variant="h4" component="h1">
            {title}
          </Typography>
          {subtitle && (
            <Typography color="text.secondary" sx={{ mt: 0.5 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          {onRefresh && <RefreshButton onRefresh={onRefresh} />}
          {action}
        </Box>
      </Box>
      <Box aria-hidden sx={kolamDividerSx} />
    </Box>
  );
}

export function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Alert severity="error" sx={{ mb: 2 }}>
      {message}
    </Alert>
  );
}

/** Whole number from a text field ("" → null). */
export function parseWhole(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isInteger(n) ? n : NaN;
}

/** Rupee amount from a text field, ≤ 2 decimals ("" → null, invalid → NaN). */
export function parseMoney(text: string): number | null {
  const t = text.trim().replace(/,/g, "");
  if (!t) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
  return Number(t);
}
