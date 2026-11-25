/**
 * "Where is money leaking" hints for the P&L screen. Thresholds follow calc-spec §8 bands
 * (prime cost good ≤ 60 %, ROAS bad < 1). Amounts are the rupees above the healthy level.
 */
import { round2 } from "../calc/util";
import { PeriodStats } from "../stats/aggregate";

export interface Leak {
  te: string;
  en: string;
  amount: number;
}

export const OTHER_COSTS_HEALTHY_PCT = 15;

export function findLeaks(s: PeriodStats): Leak[] {
  const leaks: Leak[] = [];
  if (s.income > 0) {
    const prime = s.food + s.labour;
    const healthyPrime = (s.income * 60) / 100;
    if (prime > healthyPrime + 0.005) {
      leaks.push({ te: "సరుకులు + జీతాలు ఆదాయంలో 60% కంటే ఎక్కువ", en: "Food + labour above 60% of income", amount: round2(prime - healthyPrime) });
    }
    const healthyOther = (s.income * OTHER_COSTS_HEALTHY_PCT) / 100;
    if (s.other > healthyOther + 0.005) {
      leaks.push({ te: `ఇతర ఖర్చులు ఆదాయంలో ${OTHER_COSTS_HEALTHY_PCT}% కంటే ఎక్కువ`, en: `Other expenses above ${OTHER_COSTS_HEALTHY_PCT}% of income`, amount: round2(s.other - healthyOther) });
    }
  }
  if (s.ads > 0 && s.adsRevenue < s.ads) {
    leaks.push({ te: "Ads కి పెట్టిన ఖర్చు కంటే వచ్చిన ఆదాయం తక్కువ", en: "Ads earned less than they cost", amount: round2(s.ads - s.adsRevenue) });
  }
  if (s.profit < 0) leaks.push({ te: "ఈ కాలంలో నష్టం", en: "Loss in this period", amount: round2(-s.profit) });
  return leaks.sort((a, b) => b.amount - a.amount);
}
