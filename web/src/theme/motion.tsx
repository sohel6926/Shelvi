import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { Box } from "@mui/material";
import { keyframes } from "@emotion/react";
import { tokens, toneColors } from "./tokens";
import type { Tone } from "./tokens";

/**
 * Motion helpers for the Suseela CRM web app. No animation libraries — requestAnimationFrame
 * and CSS transforms only, so it stays light on cheap phones.
 *
 * Every helper here switches itself off when the user's device asks for reduced motion
 * (prefers-reduced-motion: reduce). Motion never carries meaning on its own: progress always
 * shows its % as text, and a completed target must also say so in words.
 */

const m = tokens.motion;

// ---------------------------------------------------------------------------------------------
// Reduced motion
// ---------------------------------------------------------------------------------------------

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReduced(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mql = window.matchMedia(REDUCED_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function readReduced(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(REDUCED_QUERY).matches
    : false;
}

/** True when the device asks for reduced motion. Updates live if the setting changes. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduced, readReduced, () => false);
}

// ---------------------------------------------------------------------------------------------
// Count-up
// ---------------------------------------------------------------------------------------------

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Animated number for KPIs. Counts from 0 on first render, then from the previous value
 * whenever `value` changes. Returns an unrounded number — round/format it yourself, or use
 * <CountUp/>, which also stops the text from jumping in width.
 * Reduced motion: returns `value` immediately.
 */
export function useCountUp(value: number, durationMs: number = m.countUp): number {
  const reduced = usePrefersReducedMotion();
  const [display, setDisplay] = useState(0);
  const current = useRef(0);

  useEffect(() => {
    if (reduced || !Number.isFinite(value) || durationMs <= 0) {
      current.current = value;
      return;
    }
    const from = current.current;
    if (from === value) return;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const next = from + (value - from) * easeOutCubic(t);
      current.current = next;
      setDisplay(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs, reduced]);

  return reduced || !Number.isFinite(value) || durationMs <= 0 ? value : display;
}

const inrNumber = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** 1234567 -> "12,34,567" (Indian grouping). */
export function formatIndian(n: number): string {
  return inrNumber.format(Math.round(n));
}

const srOnly = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

export interface CountUpProps {
  value: number;
  durationMs?: number;
  /** Defaults to Indian digit grouping without decimals. Use e.g. (n) => "₹" + formatIndian(n). */
  format?: (n: number) => string;
  align?: "start" | "end";
}

/**
 * KPI number that counts up. Baloo Tammudu 2 has no tabular figures, so the final value is
 * rendered invisibly underneath to reserve the width — the number never jitters sideways.
 * Screen readers only hear the final value.
 */
export function CountUp({ value, durationMs, format = formatIndian, align = "start" }: CountUpProps) {
  const shown = useCountUp(value, durationMs);
  const finalText = format(value);
  return (
    <Box component="span" sx={{ position: "relative", display: "inline-grid", justifyItems: align }}>
      <Box component="span" aria-hidden sx={{ gridArea: "1 / 1", visibility: "hidden" }}>
        {finalText}
      </Box>
      <Box component="span" aria-hidden sx={{ gridArea: "1 / 1" }}>
        {format(shown)}
      </Box>
      <Box component="span" sx={srOnly}>
        {finalText}
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------------------------
// Celebrate (gold burst, no dependencies)
// ---------------------------------------------------------------------------------------------

const burst = keyframes`
  0%   { transform: translate(0, 0) scale(1); opacity: 1; }
  70%  { opacity: 1; }
  100% { transform: translate(var(--dx), var(--dy)) scale(0.4); opacity: 0; }
`;

const ring = keyframes`
  0%   { transform: scale(0.3); opacity: 0.9; }
  100% { transform: scale(1.35); opacity: 0; }
`;

const PARTICLES = 14;

export interface CelebrateProps {
  /** Plays once each time this turns true. */
  active: boolean;
  /** Diameter of the burst in px. */
  size?: number;
  /** Wait this long before bursting (e.g. until a progress bar has finished filling). */
  delayMs?: number;
  onDone?: () => void;
}

/**
 * A short gold burst for "target reached". Put it inside a `position: relative` parent; it
 * covers the parent and never blocks clicks. Decorative only (aria-hidden): always show the
 * achievement in text too, e.g. "లక్ష్యం పూర్తి / Target reached".
 * Reduced motion: renders nothing.
 */
export function Celebrate({ active, size = 140, delayMs = 0, onDone }: CelebrateProps) {
  const reduced = usePrefersReducedMotion();
  const [run, setRun] = useState(0);
  const doneRef = useRef(onDone);

  useEffect(() => {
    doneRef.current = onDone;
  });

  useEffect(() => {
    if (!active || reduced) return;
    const startTimer = window.setTimeout(() => setRun((r) => r + 1), delayMs);
    const endTimer = window.setTimeout(() => {
      setRun(0);
      doneRef.current?.();
    }, delayMs + m.celebrate + 50);
    return () => {
      window.clearTimeout(startTimer);
      window.clearTimeout(endTimer);
    };
  }, [active, reduced, delayMs]);

  if (reduced || run === 0) return null;

  const radius = size / 2;
  const particles: ReactNode[] = [];
  for (let i = 0; i < PARTICLES; i++) {
    const angle = (i / PARTICLES) * Math.PI * 2;
    const dist = radius * (i % 2 === 0 ? 0.95 : 0.7);
    const isRay = i % 3 === 0;
    particles.push(
      <Box
        key={i}
        component="span"
        style={
          {
            "--dx": `${Math.cos(angle) * dist}px`,
            "--dy": `${Math.sin(angle) * dist}px`,
          } as Record<string, string>
        }
        sx={{
          position: "absolute",
          width: isRay ? 3 : 7,
          height: isRay ? 10 : 7,
          borderRadius: isRay ? 2 : "50%",
          bgcolor: i % 4 === 1 ? tokens.color.green : tokens.color.gold,
          rotate: isRay ? `${(angle * 180) / Math.PI + 90}deg` : undefined,
          animation: `${burst} ${m.celebrate}ms ${m.easeOut} forwards`,
        }}
      />,
    );
  }

  return (
    <Box
      key={run}
      aria-hidden
      sx={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        pointerEvents: "none",
        overflow: "visible",
        zIndex: 1,
      }}
    >
      <Box sx={{ position: "relative", width: 0, height: 0, display: "grid", placeItems: "center" }}>
        <Box
          component="span"
          sx={{
            position: "absolute",
            width: size * 0.6,
            height: size * 0.6,
            borderRadius: "50%",
            border: `2px solid ${tokens.color.gold}`,
            animation: `${ring} ${m.celebrate}ms ${m.easeOut} forwards`,
          }}
        />
        {particles}
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------------------------
// Animated progress bar
// ---------------------------------------------------------------------------------------------

export interface AnimatedProgressProps {
  /** 0–100. Values outside are clamped. */
  value: number;
  /** Accessible name, e.g. "ఈ నెల లక్ష్యం / This month's target". */
  label: string;
  tone?: Exclude<Tone, "neutral">;
  /** Show the % as text next to the bar (on by default — the bar alone is not enough). */
  showValue?: boolean;
  height?: number;
  /** Play the gold burst the moment the value reaches 100. */
  celebrateOnComplete?: boolean;
}

/**
 * Progress bar that fills from 0 on first render (500ms ease-out) and glides on later changes.
 * Animates `transform: scaleX` only — no layout work. Reduced motion: shows the value at once.
 */
export function AnimatedProgress({
  value,
  label,
  tone = "good",
  showValue = true,
  height = 8,
  celebrateOnComplete = false,
}: AnimatedProgressProps) {
  const reduced = usePrefersReducedMotion();
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (reduced) return;
    // Next frame, so the first paint is at 0 and the bar visibly fills.
    const frame = requestAnimationFrame(() => setShown(pct));
    return () => cancelAnimationFrame(frame);
  }, [pct, reduced]);

  const scale = (reduced ? pct : shown) / 100;
  // Gold is too light against the track (2.4:1), so the "brand" bar uses green.
  const barColor = tone === "brand" ? tokens.color.green : toneColors[tone].main;

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, position: "relative" }}>
      <Box
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        sx={{
          flex: 1,
          height,
          borderRadius: `${tokens.radius.pill}px`,
          bgcolor: tokens.color.track,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            bgcolor: barColor,
            transformOrigin: "left center",
            transform: `scaleX(${scale})`,
            transition: reduced ? "none" : `transform ${m.progressFill}ms ${m.easeOut}`,
          }}
        />
      </Box>
      {showValue && (
        <Box
          component="span"
          aria-hidden
          sx={{
            minWidth: "4ch",
            textAlign: "end",
            fontSize: "0.875rem",
            fontWeight: 500,
            color: "text.secondary",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {Math.round(pct)}%
        </Box>
      )}
      {celebrateOnComplete && <Celebrate active={pct >= 100} size={120} delayMs={reduced ? 0 : m.progressFill} />}
    </Box>
  );
}

// ---------------------------------------------------------------------------------------------
// Screen transition
// ---------------------------------------------------------------------------------------------

const screenIn = keyframes`
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: none; }
`;

/**
 * Put on the root Box of each routed page: <Box sx={screenEnterSx} key={location.pathname}>.
 * 200ms fade + 4px rise. Under reduced motion the global reset in the theme makes it instant.
 */
export const screenEnterSx = {
  animation: `${screenIn} ${m.base}ms ${m.easeOut} both`,
} as const;
