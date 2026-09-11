/**
 * DefeatSystem — what happens to a captain who loses his ship (v0.59.0).
 *
 * ## The hole this fills
 *
 * `showBattleResult` has printed DEFEAT since the sea battle existed, and then
 * written the wreck straight back onto the world map: hull at zero, sails at
 * whatever was left, and the player returned to the chart still holding the
 * helm of a ship that had just gone down in front of him. Nothing else
 * happened. Losing cost a cargo and a log line.
 *
 * It was worse than free. `hullTier` answers `speedMul: 0` for a hull at zero,
 * so `mapDamageSpeedMultiplier` returned **exactly zero** — no thrust, in any
 * wind, at any sail. `repairAtSea` refuses a hull at zero by its first line,
 * and the shipyard is in a port the ship can no longer reach. The save was
 * over and the game never said so.
 *
 * Measured, because the third entrance is the one nobody would have guessed:
 *
 * | how a hull reaches zero | reachable by |
 * |---|---|
 * | a lost sea battle | anyone who fires on a man-of-war |
 * | **running aground** | 6.23% of the Caribbean, 0.12 hull a tick |
 * | a fort's guns during a bombardment | any siege pressed too far |
 *
 * The sandbank is the cruel one. At 20 ticks a second the bottom grinds away
 * 2.4 hull a second, so a sloop that touches and is left alone is a rock in
 * **25 seconds** and a galleon in 75. And of the 333 water cells that can
 * ground a deep hull, **61.6% have no current over them at all** — nothing to
 * drift her off. On two thirds of the water that can strand her, a hull ground
 * to zero never moves again.
 *
 * The whole difference between a ship that can still limp home and a save that
 * cannot continue is **one hull point**: at 1 she is foundering and makes
 * 0.45x, at 0 she makes nothing. So there are two rules here and neither is a
 * special case:
 *
 *   1. **Nothing the map holds is ever at zero.** `MIN_AFLOAT_HULL` floors the
 *      two grinders that are not a sinking — the sandbank and the fort. Being
 *      driven ashore wrecks a ship; it does not put her under. This is the
 *      same rule `MAP_DISMASTED_CRAWL` has enforced for the rigging since
 *      v0.9.9, applied at last to the other half of the product.
 *   2. **A hull that really does go down is gone**, and this file says what
 *      the captain has instead. That is the only remaining way to zero, and it
 *      never reaches the map.
 *
 * ## What he has instead
 *
 * Two answers, and which one he gets is a decision he made before the fight:
 *
 * - **He has a consort.** The flag shifts. The largest hull still afloat
 *   becomes the flagship, the boats bring across whoever got off, and the
 *   squadron sails on one ship lighter. Sailing in company is worth something
 *   the moment it is worth anything at all, which is the point.
 * - **He sails alone.** He is put ashore. A man-of-war lands him at her own
 *   crown's nearest colony as a prisoner to be ransomed; anybody else simply
 *   leaves the boats to find a beach, and he lands wherever the nearest beach
 *   is. Either way the purse pays: half of it, and out of what is left the
 *   yard gives him a pinnace — the smallest hull in the game, one class below
 *   the sloop a career begins with.
 *
 * Nothing is conjured. The men are the survivors of his own crew, the pinnace
 * is bought with his own gold (and if the gold will not stretch, the wreck's
 * salvage makes up the difference and the purse goes to nothing), and the
 * cargo he lands with is what `cargoSurvivingSinking` says the boats saved —
 * the same share the old code already computed and then threw into a hold that
 * was on the bottom.
 *
 * Pure. No Phaser, no RNG: a defeat must play out the same way in a test as it
 * does on the water.
 */

import type { WorldState, FleetShip, Vec2 } from "../model/WorldState.ts";
import type { ShipData } from "../model/EntityState.ts";
import { SHIP_CLASSES } from "../data/ships.ts";
import { PORTS } from "../data/ports.ts";
import { shipClassId } from "../model/ids.ts";
import { t } from "../i18n/index.ts";
import { addLogEntry } from "./EventLogSystem.ts";
import { cargoSurvivingSinking } from "./DamageSystem.ts";
import { consortCrew, consortCrewMax, consortMorale } from "./FleetSystem.ts";
import { getPortWaterPos } from "./PortWaterPositions.ts";
import { portFaction } from "./SiegeSystem.ts";

/**
 * Share of the men still on the roll who reach a boat.
 *
 * Half. It sits beside `RESCUE_FRACTION = 0.40` in `ShipRepairSystem`, which
 * is the same question asked about an enemy crew in the water: a man getting
 * off his own deck, with his own boats swung out, does a little better than a
 * man being fished out by strangers. The sick bay is not counted at all — men
 * who cannot stand do not climb into a boat off a sinking ship.
 */
export const DEFEAT_SURVIVOR_SHARE = 0.5;

/** Share of the purse a beaten captain does not keep. */
export const RANSOM_SHARE = 0.5;

/** The hull a captain who has nothing left is put back on the water in. */
export const CASTAWAY_CLASS = "pinnace";

/**
 * What the yard asks for a pinnace, and never more than the purse holds.
 *
 * Deliberately the class's own asking price rather than a number invented
 * here, so the bottom of the ladder stays one rung below the sloop a career
 * starts on even if the table moves.
 */
export const CASTAWAY_PRICE = SHIP_CLASSES[CASTAWAY_CLASS].buyPrice;

/** What a beaten crew loses off its mood, on top of everything else. */
export const MORALE_BLOW = 0.25;

/** How the fight ended for the man who lost it. */
export type DefeatFate =
  | {
      kind: "flag_shifted";
      /** Class of the consort the flag moved to. */
      classId: string;
      /**
       * Men who actually got onto her deck.
       *
       * Not the men who reached a boat: her berths are the limit, and a
       * hundred survivors off a galleon do not fit in a sloop. What is
       * printed has to be what he has.
       */
      survivors: number;
    }
  | {
      kind: "put_ashore";
      /** Town he was landed at. */
      portKey: string;
      /** Gold taken off him, ransom and the yard's bill together. */
      ransom: number;
      survivors: number;
      /** True when a king's ship landed him, which is why it is that king's town. */
      prisoner: boolean;
    };

export type DefeatResult = { world: WorldState; fate: DefeatFate };

/** Straight-line distance, squared — only ever used to rank. */
function dist2(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x, dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/**
 * The nearest town, optionally restricted to one crown's colonies.
 *
 * Read through `portFaction` rather than `PortDef.factionId`, because a colony
 * taken in v0.13.0 still carries its 1680 owner in the table and a man-of-war
 * does not land her prisoners in a town her king lost — TODO section 5's rule,
 * and the one v0.50.0 found broken in the spawner.
 */
export function nearestPort(world: WorldState, from: Vec2, crown?: string): string {
  let best = "";
  let bestD = Infinity;
  for (const key of Object.keys(PORTS)) {
    if (crown && (portFaction(world, key) as string) !== crown) continue;
    const d = dist2(from, getPortWaterPos(key));
    if (d < bestD) { bestD = d; best = key; }
  }
  // A crown with nothing left on the chart still has to land him somewhere.
  if (!best && crown) return nearestPort(world, from);
  return best;
}

/** The consort the flag would move to: the biggest hull still afloat. */
export function heirToTheFlag(fleet: FleetShip[]): number {
  let best = -1;
  let bestRank = -Infinity;
  fleet.forEach((consort, i) => {
    if (!(consort.hullHp > 0)) return;
    const cls = SHIP_CLASSES[consort.classId];
    // Tonnage first, because that is what makes a ship a flagship; her hull
    // only breaks a tie between two of the same class.
    const rank = (cls?.tonnage ?? 0) * 1000 + consort.hullHp;
    if (rank > bestRank) { bestRank = rank; best = i; }
  });
  return best;
}

/** What the boats saved out of a hold that went down with the ship. */
function salvagedCargo(ship: ShipData | undefined, cap: number): Record<string, number> {
  if (!ship) return {};
  const crewFrac = ship.crew.max > 0 ? ship.crew.current / ship.crew.max : 0;
  const kept = cargoSurvivingSinking(crewFrac);
  const out: Record<string, number> = {};
  let room = Math.max(0, Math.floor(cap));
  // Most valuable first would need a price read in here; the hold's own order
  // is what the boats reached, and it is the order `computePrize` already uses.
  for (const [item, qty] of Object.entries(ship.cargo ?? {})) {
    if (room <= 0) break;
    const saved = Math.min(room, Math.floor(qty * kept));
    if (saved > 0) { out[item] = saved; room -= saved; }
  }
  return out;
}

/**
 * Settle a lost sea battle: the flagship is gone, and this says what is left.
 *
 * Called once, from the scene that lost her, **after** the damage write-back —
 * it reads the flagship's final crew to decide how many got off. The entity
 * keeps its id: everything in the world that points at the player's ship
 * (quests, the blockade, the renderer) points at `player.shipId`, and a defeat
 * is not the moment to make all of that chase a new key.
 *
 * `victorFaction` and `victorBehavior` are whatever beat him, straight off the
 * enemy entity. Both are optional — a hull with neither lands him on the
 * nearest beach, which is the right answer for anything that is not a king's
 * ship.
 */
export function settleDefeat(
  world: WorldState,
  victorFaction?: string,
  victorBehavior?: string,
): DefeatResult {
  const shipId = world.player.shipId as string;
  const entity = world.entities[shipId];
  const lost = entity?.ship;

  const onTheRoll = Math.max(0, Math.floor(lost?.crew.current ?? 0));
  const survivors = Math.floor(onTheRoll * DEFEAT_SURVIVOR_SHARE);

  const fleet = world.player.fleet ?? [];
  const heir = heirToTheFlag(fleet);

  if (heir >= 0) {
    // ── The flag shifts ──────────────────────────────────
    const consort = fleet[heir];
    const cls = SHIP_CLASSES[consort.classId];
    const berths = consortCrewMax(consort);
    const aboard = Math.min(berths, consortCrew(consort) + survivors);
    const cargo = salvagedCargo(lost, cls?.cargoCap ?? 0);

    const ship: ShipData = {
      classId: shipClassId(consort.classId),
      factionId: lost?.factionId ?? (entity?.ship?.factionId as ShipData["factionId"]),
      hullHp: consort.hullHp,
      hullMax: consort.hullMax,
      sailsHp: consort.sailsHp,
      sailsMax: consort.sailsMax,
      cannons: consort.cannons,
      cargo,
      cargoCap: cls?.cargoCap ?? 0,
      crew: {
        current: aboard,
        max: cls?.crewMax ?? berths,
        // Watching the flagship go down is not a morale-neutral afternoon, and
        // the men coming over the side were on her. The consort's own mood is
        // the starting point because they are her crew now.
        morale: Math.max(0, Math.min(1, consortMorale(consort) - MORALE_BLOW)),
      },
      wounded: consort.wounded ?? 0,
    };

    const broughtAcross = aboard - consortCrew(consort);
    const rest = fleet.filter((_, i) => i !== heir);
    const w: WorldState = {
      ...world,
      player: { ...world.player, fleet: rest },
      entities: {
        ...world.entities,
        [shipId]: {
          ...entity,
          // She is under way again the moment the flag is aboard, and with no
          // canvas set: the map would otherwise carry the sunk ship's orders.
          vel: { x: 0, y: 0 },
          sailLevel: 0,
          aground: undefined,
          shoaling: undefined,
          ship,
        },
      },
    };

    const logged = addLogEntry(w, "defeat.log_flag_shifted", {
      // The printed name, never the key. `vars` goes into the save and is
      // rendered wherever the log is read — the v0.37.0 trap, and the one
      // thing review caught in v0.58.0.
      ship: t(`ship.${consort.classId}.name`),
      count: broughtAcross,
    });
    return {
      world: logged,
      fate: { kind: "flag_shifted", classId: consort.classId, survivors: broughtAcross },
    };
  }

  // ── He is put ashore ───────────────────────────────────
  // A king's ship lands him in a town of that king's; anyone else puts the
  // boats over the side and the sea decides which beach.
  const prisoner = victorBehavior === "navy" && !!victorFaction;
  const from = entity?.pos ?? world.player.location.pos;
  const portKey = nearestPort(world, from, prisoner ? victorFaction : undefined);
  const pos = getPortWaterPos(portKey);

  const cls = SHIP_CLASSES[CASTAWAY_CLASS];
  const ransom = Math.max(0, Math.round(world.player.gold * RANSOM_SHARE));
  // The yard is paid out of what the ransom left, and takes whatever that is
  // when it is not enough: a wreck's salvage and a captain's name are worth
  // the difference exactly once.
  const afterRansom = Math.max(0, world.player.gold - ransom);
  const yardBill = Math.min(afterRansom, CASTAWAY_PRICE);

  const ship: ShipData = {
    classId: shipClassId(CASTAWAY_CLASS),
    factionId: lost?.factionId ?? (entity?.ship?.factionId as ShipData["factionId"]),
    hullHp: cls.hullMax,
    hullMax: cls.hullMax,
    sailsHp: cls.sailsMax,
    sailsMax: cls.sailsMax,
    cannons: cls.cannons,
    cargo: salvagedCargo(lost, cls.cargoCap),
    cargoCap: cls.cargoCap,
    crew: {
      // No floor. A pinnace wants four hands and he may land with two — that
      // costs handling and never movement (v0.49.0), so the honest number is
      // the number of men who got off, and he can fill the rest in the tavern
      // he has just been carried into.
      current: Math.min(cls.crewMax, survivors),
      max: cls.crewMax,
      morale: Math.max(0, Math.min(1, (lost?.crew.morale ?? 0.8) - MORALE_BLOW)),
    },
    wounded: 0,
  };

  const w: WorldState = {
    ...world,
    player: {
      ...world.player,
      gold: afterRansom - yardBill,
      fleet: [],
      location: { type: "sea", pos },
    },
    entities: {
      ...world.entities,
      [shipId]: {
        ...entity,
        pos,
        vel: { x: 0, y: 0 },
        sailLevel: 0,
        mode: "sailing",
        aground: undefined,
        shoaling: undefined,
        ship,
      },
    },
  };

  const landed = ship.crew.current;
  const logged = addLogEntry(w, prisoner ? "defeat.log_ransomed" : "defeat.log_castaway", {
    port: PORTS[portKey]?.name ?? portKey,
    gold: ransom + yardBill,
    count: landed,
  });
  return {
    world: logged,
    fate: { kind: "put_ashore", portKey, ransom: ransom + yardBill, survivors: landed, prisoner },
  };
}
