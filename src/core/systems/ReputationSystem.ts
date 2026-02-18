import { clamp } from "../services/Geometry.ts";

export function changeReputation(
  reputation: Record<string, number>,
  factionId: string,
  delta: number,
): Record<string, number> {
  const current = reputation[factionId] ?? 0;
  return {
    ...reputation,
    [factionId]: clamp(current + delta, -100, 100),
  };
}

export function getReputationLevel(rep: number): "hostile" | "unfriendly" | "neutral" | "friendly" | "allied" {
  if (rep <= -60) return "hostile";
  if (rep <= -20) return "unfriendly";
  if (rep < 20) return "neutral";
  if (rep < 60) return "friendly";
  return "allied";
}

// Price modifier based on reputation with port's faction
export function reputationPriceModifier(rep: number): number {
  // hostile: +30% prices, allied: -15% prices
  if (rep <= -60) return 1.3;
  if (rep <= -20) return 1.15;
  if (rep < 20) return 1.0;
  if (rep < 60) return 0.95;
  return 0.85;
}
