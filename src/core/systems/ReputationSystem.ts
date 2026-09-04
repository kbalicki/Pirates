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

/** The five bands standing is read in. Exported so callers can key tables on it. */
export type ReputationLevel = "hostile" | "unfriendly" | "neutral" | "friendly" | "allied";

export function getReputationLevel(rep: number): ReputationLevel {
  if (rep <= -60) return "hostile";
  if (rep <= -20) return "unfriendly";
  if (rep < 20) return "neutral";
  if (rep < 60) return "friendly";
  return "allied";
}

// The price a standing costs at the counter used to live here, as
// `reputationPriceModifier`, and was never called by anything for eleven
// releases. It moved into `PortAccessSystem` in v0.24.0, where it sits in one
// table beside the other four things a town's opinion of you decides — so that
// "what does hostile mean" has a single answer a reader can check at a glance.
