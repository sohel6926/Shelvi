import { createTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import type { CSSProperties } from "react";

/**
 * Suseela Caterings CRM — web theme.
 *
 * Source of truth: design/tokens.json (mirrored in Android ui/theme/Color.kt, Type.kt, Theme.kt).
 * Change a value there first, then here and in Color.kt, so both clients stay identical.
 * Contrast ratios in comments are WCAG 2.x, measured — see docs/design-system.md.
 */

// ---------------------------------------------------------------------------------------------
// Raw tokens
// ---------------------------------------------------------------------------------------------

export const tokens = {
  color: {
    green: "#1F6E45", // 6.22:1 on white, 5.66:1 on cream
    greenDark: "#185A38", // hover/pressed; white on it 8.21:1
    greenTint: "#E4F1E8",
    gold: "#C08A2E", // decorative only (3.04:1 on white) — never text
    goldDeep: "#8A5300", // text-safe gold: section labels, 5.76:1 on cream

    canvas: "#F7F4EC", // L0 page
    nav: "#FFFDF8", // sidebar
    raised: "#FFFFFF", // L1 cards / tables
    tableHeader: "#F1EBDD",
    rowHover: "#FBF8F1",
    track: "#ECE4D2",
    border: "#ECE4D2",
    borderStrong: "#D9CDB2",

    text: "#1C2421", // 14.43:1 on cream
    textSecondary: "#4F5A55", // 6.53:1 on cream
    tableHeaderText: "#4A3A12", // 9.27:1 on #F1EBDD
    onGold: "#1C2421", // 5.22:1 on gold

    good: "#1F6E45",
    goodTint: "#E4F1E8",
    warning: "#945C00", // 5.04:1 on cream, 4.84:1 on its tint
    warningTint: "#FBEEDA",
    bad: "#B42318", // 5.98:1 on cream
    badTint: "#FBE5E2",
    info: "#205E8C", // 6.28:1 on cream
    infoTint: "#E3EEF6",
    neutral: "#4A3A12",
    neutralTint: "#EFE9DC",
  },
  font: {
    heading: "'Baloo Tammudu 2', 'Anek Telugu', 'Noto Sans Telugu', system-ui, sans-serif",
    body: "'Anek Telugu', 'Noto Sans Telugu', system-ui, sans-serif",
    print: "'Hind Guntur', 'Anek Telugu', 'Noto Sans Telugu', serif",
  },
  weight: { regular: 400, medium: 500, semibold: 600 },
  radius: { xs: 4, sm: 8, md: 10, lg: 14, pill: 999 },
  shadow: {
    card: "0 1px 2px rgba(60,45,10,0.05), 0 4px 14px rgba(60,45,10,0.08)",
    overlay: "0 2px 6px rgba(60,45,10,0.06), 0 12px 28px rgba(60,45,10,0.08)",
    navSelected: "inset 4px 0 0 #C08A2E",
    appBar: "inset 0 -3px 0 #C08A2E",
  },
  motion: {
    press: 100,
    fast: 150,
    base: 200,
    slow: 300,
    progressFill: 500,
    countUp: 600,
    celebrate: 900,
    easeOut: "cubic-bezier(0.16, 1, 0.3, 1)",
    easeIn: "cubic-bezier(0.7, 0, 0.84, 0)",
    standard: "cubic-bezier(0.2, 0, 0, 1)",
    pressScale: 0.97,
  },
  touchTarget: 44,
} as const;

const c = tokens.color;
const m = tokens.motion;

export type Tone = "good" | "warning" | "bad" | "info" | "neutral" | "brand";

/** Main (text-safe) colour and soft tint for each status tone. */
export const toneColors: Record<Tone, { main: string; tint: string }> = {
  good: { main: c.good, tint: c.goodTint },
  warning: { main: c.warning, tint: c.warningTint },
  bad: { main: c.bad, tint: c.badTint },
  info: { main: c.info, tint: c.infoTint },
  neutral: { main: c.neutral, tint: c.neutralTint },
  brand: { main: c.gold, tint: c.greenTint },
};

/** Numbers in tables and totals line up in columns (Anek Telugu supports tnum). */
export const tabularNums: CSSProperties = {
  fontVariantNumeric: "tabular-nums",
  fontFeatureSettings: '"tnum" 1',
};

/**
 * KPI / stat card: white, 14px radius, 4px coloured top border, warm shadow.
 * Usage: <Paper sx={kpiCardSx("good")}>…</Paper>
 * Do not lay every KPI out as an identical grid: lead with the one number that matters
 * (e.g. today's bookings) at full width, then group the rest.
 */
export function kpiCardSx(tone: Tone = "brand") {
  return {
    bgcolor: c.raised,
    borderRadius: `${tokens.radius.lg}px`,
    border: `1px solid ${c.border}`,
    borderTop: `4px solid ${toneColors[tone].main}`,
    boxShadow: tokens.shadow.card,
    p: 2.5,
  } as const;
}

/**
 * Restrained traditional touch: one row of small gold "kolam" dots. Use once per screen
 * at most (e.g. under a page title). Purely decorative, so mark it aria-hidden.
 * Usage: <Box aria-hidden sx={kolamDividerSx} />
 */
export const kolamDividerSx = {
  height: 6,
  width: "100%",
  maxWidth: 240,
  opacity: 0.7,
  background: `radial-gradient(circle, ${c.gold} 1.4px, transparent 1.6px) 0 50% / 12px 6px repeat-x`,
  my: 1.5,
} as const;

// ---------------------------------------------------------------------------------------------
// MUI type augmentation (custom typography variants)
// ---------------------------------------------------------------------------------------------

declare module "@mui/material/styles" {
  interface TypographyVariants {
    kpi: CSSProperties;
    section: CSSProperties;
    print: CSSProperties;
  }
  interface TypographyVariantsOptions {
    kpi?: CSSProperties;
    section?: CSSProperties;
    print?: CSSProperties;
  }
}

declare module "@mui/material/Typography" {
  interface TypographyPropsVariantOverrides {
    kpi: true;
    section: true;
    print: true;
  }
}

// ---------------------------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------------------------

const REDUCED = "@media (prefers-reduced-motion: reduce)";
const focusRing = { outline: `2px solid ${c.green}`, outlineOffset: 2 } as const;
type StatusColor = "success" | "warning" | "error" | "info";
const statusTone: Record<StatusColor, Tone> = { success: "good", warning: "warning", error: "bad", info: "info" };

/** Soft-tinted filled chips for statuses, so <Chip color="success" /> reads as a label, not a button. */
const softChipVariants = (Object.keys(statusTone) as StatusColor[]).map((color) => {
  const t = toneColors[statusTone[color]];
  return {
    props: { variant: "filled" as const, color },
    style: {
      backgroundColor: t.tint,
      color: t.main,
      "&.MuiChip-clickable:hover": { backgroundColor: t.tint, boxShadow: `inset 0 0 0 1px ${t.main}` },
      "& .MuiChip-icon, & .MuiChip-deleteIcon": { color: t.main },
    },
  };
});

export function createAppTheme(): Theme {
  return createTheme({
    palette: {
      mode: "light",
      primary: { main: c.green, dark: c.greenDark, light: "#4C9270", contrastText: "#FFFFFF" },
      secondary: { main: c.gold, dark: c.goldDeep, light: "#D9AC5C", contrastText: c.onGold },
      success: { main: c.good, dark: c.greenDark, light: c.goodTint, contrastText: "#FFFFFF" },
      warning: { main: c.warning, dark: "#6E4400", light: c.warningTint, contrastText: "#FFFFFF" },
      error: { main: c.bad, dark: "#8C1B12", light: c.badTint, contrastText: "#FFFFFF" },
      info: { main: c.info, dark: "#174769", light: c.infoTint, contrastText: "#FFFFFF" },
      background: { default: c.canvas, paper: c.raised },
      text: { primary: c.text, secondary: c.textSecondary },
      divider: c.border,
    },
    shape: { borderRadius: tokens.radius.sm },
    typography: {
      fontFamily: tokens.font.body,
      htmlFontSize: 16,
      fontSize: 16,
      fontWeightLight: 400,
      fontWeightRegular: 400,
      fontWeightMedium: 500,
      fontWeightBold: 600,
      h1: { fontFamily: tokens.font.heading, fontWeight: 600, fontSize: "2.0625rem", lineHeight: 1.3, letterSpacing: 0 },
      h2: { fontFamily: tokens.font.heading, fontWeight: 600, fontSize: "1.75rem", lineHeight: 1.3, letterSpacing: 0 },
      h3: { fontFamily: tokens.font.heading, fontWeight: 600, fontSize: "1.4375rem", lineHeight: 1.35, letterSpacing: 0 },
      h4: { fontFamily: tokens.font.heading, fontWeight: 600, fontSize: "1.1875rem", lineHeight: 1.4, letterSpacing: 0 },
      h5: { fontFamily: tokens.font.heading, fontWeight: 600, fontSize: "1rem", lineHeight: 1.5, letterSpacing: 0 },
      h6: { fontFamily: tokens.font.heading, fontWeight: 600, fontSize: "1rem", lineHeight: 1.5, letterSpacing: 0 },
      subtitle1: { fontWeight: 500, fontSize: "1rem", lineHeight: 1.5 },
      subtitle2: { fontWeight: 500, fontSize: "0.875rem", lineHeight: 1.5 },
      body1: { fontSize: "1rem", lineHeight: 1.6, letterSpacing: 0 },
      body2: { fontSize: "0.875rem", lineHeight: 1.55, letterSpacing: 0 },
      button: { fontWeight: 500, fontSize: "1rem", lineHeight: 1.4, textTransform: "none", letterSpacing: 0 },
      caption: { fontSize: "0.75rem", lineHeight: 1.4, letterSpacing: 0 },
      overline: { fontSize: "0.75rem", lineHeight: 1.4, fontWeight: 600, letterSpacing: "0.04em" },
      // Custom variants
      kpi: { fontFamily: tokens.font.heading, fontWeight: 600, fontSize: "2.5rem", lineHeight: 1.15, letterSpacing: 0 },
      section: { fontFamily: tokens.font.body, fontWeight: 600, fontSize: "0.875rem", lineHeight: 1.4, color: c.goldDeep },
      print: { fontFamily: tokens.font.print, fontWeight: 400, fontSize: "0.9375rem", lineHeight: 1.5 },
    },
    transitions: {
      duration: {
        shortest: m.press,
        shorter: m.fast,
        short: m.base,
        standard: m.base,
        complex: m.slow,
        enteringScreen: m.base,
        leavingScreen: m.fast,
      },
      easing: {
        easeInOut: m.standard,
        easeOut: m.easeOut,
        easeIn: m.easeIn,
        sharp: m.standard,
      },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          // Neutralise the leftover Vite starter styles in src/index.css (18px root font, dark
          // colour-scheme, a centred 1126px #root) without editing that file.
          "html:root": { fontSize: "100%", colorScheme: "light", letterSpacing: "normal" },
          "html body #root": {
            width: "100%",
            maxWidth: "none",
            margin: 0,
            textAlign: "start",
            borderInline: "none",
          },
          body: { backgroundColor: c.canvas, color: c.text },
          "::selection": { backgroundColor: c.greenTint, color: c.text },
          ":focus-visible": focusRing,
          [REDUCED]: {
            "*, *::before, *::after": {
              animationDuration: "0.01ms !important",
              animationIterationCount: "1 !important",
              transitionDuration: "0.01ms !important",
              scrollBehavior: "auto !important",
            },
          },
        },
      },
      MuiButtonBase: {
        defaultProps: { disableRipple: false },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            minHeight: tokens.touchTarget,
            borderRadius: tokens.radius.pill,
            paddingInline: 20,
            transition: `background-color ${m.fast}ms ${m.standard}, border-color ${m.fast}ms ${m.standard}, transform ${m.press}ms ${m.standard}`,
            "&:active": { transform: `scale(${m.pressScale})` },
            "&.Mui-focusVisible": focusRing,
            [REDUCED]: { "&:active": { transform: "none" } },
            // MUI v7+ removed compound keys (containedPrimary …); colour+variant styles live in variants.
            variants: [
              { props: { variant: "contained", color: "primary" }, style: { "&:hover": { backgroundColor: c.greenDark } } },
              { props: { variant: "outlined", color: "primary" }, style: { "&:hover": { backgroundColor: c.greenTint, borderColor: c.green } } },
              { props: { variant: "text", color: "primary" }, style: { "&:hover": { backgroundColor: c.greenTint } } },
            ],
          },
          sizeSmall: { fontSize: "0.875rem", paddingInline: 14 },
          sizeLarge: { minHeight: 52, paddingInline: 28 },
          outlined: { borderColor: c.borderStrong, backgroundColor: c.raised },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            minWidth: tokens.touchTarget,
            minHeight: tokens.touchTarget,
            "&.Mui-focusVisible": focusRing,
          },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            backgroundImage: "none",
            variants: [{ props: { variant: "elevation", elevation: 0 }, style: { border: `1px solid ${c.border}`, boxShadow: tokens.shadow.card } }],
          },
          rounded: { borderRadius: tokens.radius.lg },
          outlined: { borderColor: c.border },
        },
      },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            borderRadius: tokens.radius.lg,
            border: `1px solid ${c.border}`,
            boxShadow: tokens.shadow.card,
          },
        },
      },
      MuiAppBar: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: { border: "none", borderRadius: 0, boxShadow: tokens.shadow.appBar },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: c.nav,
            borderRadius: 0,
            border: "none",
            borderRight: `1px solid ${c.border}`,
            boxShadow: "none",
          },
        },
      },
      MuiPopover: {
        styleOverrides: {
          paper: { borderRadius: tokens.radius.md, border: `1px solid ${c.border}`, boxShadow: tokens.shadow.overlay },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: { borderRadius: tokens.radius.lg, boxShadow: tokens.shadow.overlay },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: { borderRadius: tokens.radius.sm, boxShadow: "none", border: "none" },
        },
      },
      MuiListSubheader: {
        styleOverrides: {
          root: {
            backgroundColor: "transparent",
            color: c.goldDeep,
            fontSize: "0.875rem",
            fontWeight: 600,
            lineHeight: 1.4,
            paddingTop: 14,
            paddingBottom: 6,
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            minHeight: 48,
            borderRadius: tokens.radius.sm,
            marginBottom: 2,
            transition: `background-color ${m.fast}ms ${m.standard}`,
            "&:hover": { backgroundColor: c.tableHeader },
            "&.Mui-focusVisible": { ...focusRing, backgroundColor: c.tableHeader },
            "&.Mui-selected": {
              backgroundColor: c.green,
              color: "#FFFFFF",
              boxShadow: tokens.shadow.navSelected,
              "& .MuiListItemIcon-root": { color: "inherit" },
              "& .MuiListItemText-primary": { fontWeight: 500 },
            },
            "&.Mui-selected:hover, &.Mui-selected.Mui-focusVisible": { backgroundColor: c.greenDark },
          },
          dense: { minHeight: 48 },
        },
      },
      MuiListItemIcon: {
        styleOverrides: { root: { color: c.textSecondary, minWidth: 40 } },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: tokens.radius.pill,
            fontWeight: 500,
            "&.MuiChip-clickable": {
              minHeight: tokens.touchTarget,
              fontSize: "1rem",
              paddingInline: 6,
              transition: `background-color ${m.fast}ms ${m.standard}, transform ${m.press}ms ${m.standard}`,
              "&:active": { transform: `scale(${m.pressScale})` },
              [REDUCED]: { "&:active": { transform: "none" } },
            },
            "&.Mui-focusVisible": focusRing,
          },
          sizeSmall: { fontSize: "0.875rem" },
          outlined: { borderColor: c.borderStrong, backgroundColor: c.raised },
        },
        variants: [
          {
            props: { variant: "filled", color: "default" },
            style: { backgroundColor: c.neutralTint, color: c.neutral },
          },
          ...softChipVariants,
        ],
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor: c.raised,
            borderRadius: tokens.radius.sm,
            "& .MuiOutlinedInput-notchedOutline": { borderColor: c.borderStrong },
            "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: c.textSecondary },
          },
          sizeSmall: { "& .MuiOutlinedInput-input": { paddingTop: 11, paddingBottom: 11 } },
        },
      },
      MuiTableContainer: {
        styleOverrides: { root: { borderRadius: tokens.radius.lg } },
      },
      MuiTableHead: {
        styleOverrides: {
          root: {
            "& .MuiTableCell-root": {
              backgroundColor: c.tableHeader,
              color: c.tableHeaderText,
              fontSize: "0.875rem",
              fontWeight: 600,
              lineHeight: 1.4,
              borderBottom: `1px solid ${c.borderStrong}`,
            },
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            ...tabularNums,
            fontSize: "1rem",
            lineHeight: 1.5,
            borderBottom: `1px solid ${c.border}`,
          },
          sizeSmall: { paddingTop: 10, paddingBottom: 10, paddingInline: 12 },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            "&.MuiTableRow-hover:hover": { backgroundColor: c.rowHover },
            "&:last-child > .MuiTableCell-body": { borderBottom: "none" },
          },
        },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: { height: 8, borderRadius: tokens.radius.pill, backgroundColor: c.track },
          bar: { borderRadius: tokens.radius.pill },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: { backgroundColor: c.text, fontSize: "0.875rem", borderRadius: tokens.radius.sm },
        },
      },
    },
  });
}

/** The app theme. App.tsx imports this name, keep it. */
export const theme = createAppTheme();
