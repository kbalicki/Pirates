import type { WorldState, Vec2 } from "../model/WorldState.ts";
import type { RngState } from "../model/WorldState.ts";
import type { WorldEvent } from "../model/Events.ts";
import { MAP_ZONES } from "../data/mapZones.ts";
import { pointInRect } from "../services/Geometry.ts";
import { rngNext } from "../services/RNG.ts";

export function checkEncounters(
  world: WorldState,
  playerPos: Vec2,
  dtTicks: number,
): { events: WorldEvent[]; rng: RngState } {
  let rng = world.rng;
  const events: WorldEvent[] = [];

  for (const zone of MAP_ZONES) {
    if (!pointInRect(playerPos, zone.rect)) continue;

    const { value: roll, state: newRng } = rngNext(rng);
    rng = newRng;

    // Probability scales with risk and dt
    const prob = zone.risk * 0.001 * dtTicks;
    if (roll < prob) {
      let kind = "pirate";
      if (zone.kind === "patrol") kind = "navy_patrol";
      if (zone.kind === "storm_prone") kind = "storm";

      events.push({
        type: "Encounter",
        encounterId: `enc_${world.time.tick}_${zone.zoneId}`,
        kind,
      });
      break; // max one encounter per tick
    }
  }

  return { events, rng };
}
