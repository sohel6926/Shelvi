import { type ReactNode } from "react";
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useLang } from "../i18n/LanguageContext";
import { RefreshButton } from "./RefreshButton";

export interface Column<T> {
  label: string;
  render: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  /** Hidden on phones to keep the table readable. */
  hideOnMobile?: boolean;
}

interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyText?: string;
  /** Optional footer row (e.g. totals); one cell per column. */
  footer?: ReactNode[];
}

export function DataTable<T>({ rows, columns, rowKey, onRowClick, emptyText, footer }: DataTableProps<T>) {
  const { L } = useLang();
  const mobileHide = { display: { xs: "none", md: "table-cell" } };
  return (
    <Paper>
      {rows.length === 0 ? (
        <Typography color="text.secondary" sx={{ p: 3 }}>
          {emptyText ?? L("ఇంకా ఏమీ లేవు.", "Nothing here yet.")}
        </Typography>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                {columns.map((c) => (
                  <TableCell
                    key={c.label}
                    align={c.align}
                    sx={{ fontWeight: 600, whiteSpace: "nowrap", ...(c.hideOnMobile ? mobileHide : {}) }}
                  >
                    {c.label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={rowKey(row)}
                  hover={!!onRowClick}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  sx={onRowClick ? { cursor: "pointer" } : undefined}
                >
                  {columns.map((c) => (
                    <TableCell key={c.label} align={c.align} sx={c.hideOnMobile ? mobileHide : undefined}>
                      {c.render(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {footer && (
                <TableRow>
                  {footer.map((cell, i) => (
                    <TableCell
                      key={i}
                      align={columns[i]?.align}
                      sx={{ fontWeight: 700, ...(columns[i]?.hideOnMobile ? mobileHide : {}) }}
                    >
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  );
}

/** Page heading with an optional action and a Refresh icon (re-reads from the server) on the right. */
export function PageHeader({
  title,
  action,
  onRefresh,
}: {
  title: string;
  action?: ReactNode;
  onRefresh?: () => Promise<unknown>;
}) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2, mb: 3, flexWrap: "wrap" }}>
      <Typography variant="h5" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        {onRefresh && <RefreshButton onRefresh={onRefresh} />}
        {action}
      </Box>
    </Box>
  );
}

/** Small summary card (count or rupee total). */
export function StatCard({ label, value, tone }: { label: string; value: ReactNode; tone?: "default" | "warn" | "good" }) {
  const color = tone === "warn" ? "error.main" : tone === "good" ? "success.main" : "text.primary";
  return (
    <Paper sx={{ p: 2, flex: "1 1 180px" }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h5" sx={{ fontWeight: 600, color }}>
        {value}
      </Typography>
    </Paper>
  );
}

export function StatRow({ children }: { children: ReactNode }) {
  return <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 3 }}>{children}</Box>;
}
