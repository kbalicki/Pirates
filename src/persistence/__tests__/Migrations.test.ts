import { describe, it, expect } from "vitest";
import { migrateWorldState, CURRENT_WORLD_VERSION } from "../Migrations.ts";
import { CITIES } from "../../core/data/cities.ts";
import { TRAINING_DEFAULT } from "../../core/model/CaptainState.ts";
import type { PortRuntimeState } from "../../core/model/WorldState.ts";

// ===========================================================================
// Migrations — v1 → v8
// ===========================================================================

/**
 * `Migrations.ts` is the only module whose failure destroys player data beyond
 * recovery: `migrateWorldState` runs on every load and the result is written
 * back to the slot. A migration that silently drops a field corrupts the save;
 * one that throws locks the player out of it entirely.
 *
 * These fixtures are hand-built shapes of what each historical version looked
 * like on disk — deliberately minimal, because old saves in the wild are
 * minimal too. They are NOT typed as `WorldState`: doing so would defeat the
 * point, since the whole job of a migration is to turn a shape that no longer
 * type-checks into one that does.
 */

/** The oldest shape we still accept: no `version` field at all. */
function makeV1Save(): Record<string, any> {
  return {
    // version omitted on purpose — migrateWorldState defaults to 1
    time: { day: 12, hour: 8, minute: 30, tick: 4200 },
    rng: { seed: 1234, state: 5678 },
    player: {
      id: "player",
      shipId: "player_ship",
      gold: 750,
      notoriety: 3,
      reputation: { england: 20, spain: -40 },
      ranks: { england: 1 },
      location: { type: "sea", pos: { x: 1646, y: 1576 } },
      questLog: [],
      fleet: [],
    },
    entities: {
      player_ship: {
        id: "player_ship",
        kind: "ship",
        pos: { x: 1646, y: 1576 },
        vel: { x: 0, y: 0 },
        heading: 1.2,
        sailLevel: 2,
        ship: {
          classId: "sloop",
          factionId: "england",
          hullHp: 55,
          hullMax: 60,
          sailsHp: 50,
          sailsMax: 50,
          cannons: 8,
          cargoCap: 40,
          crew: { current: 20, max: 30, morale: 0.8 },
          // v1 cargo keys: sugar/tobacco/food/rum, no water
          cargo: { sugar: 12, tobacco: 5, food: 15, rum: 3 },
        },
      },
    },
    // v1 knew only a handful of ports and stored no prices or inventory
    ports: {
      port_royal: { portId: "port_royal", factionId: "england" },
      havana: { portId: "havana", factionId: "spain" },
    },
    weather: { windDirRad: 2.35, windStrength: 0.5, stormActive: false, stormTimer: 0 },
    worldFlags: {},
    worldEvents: [],
    knownEventIds: [],
    gameSpeed: 1.2,
  };
}

const REQUIRED_PORT_FIELDS: (keyof PortRuntimeState)[] = [
  "portId", "factionId", "prices", "inventory", "shipyardQueue",
  "availableCrew", "population", "wealth", "defense", "bonusProduces",
];

function expectPortsWellFormed(world: any) {
  const keys = Object.keys(world.ports);
  expect(keys.length).toBe(Object.keys(CITIES).length);
  for (const key of keys) {
    const port = world.ports[key];
    for (const field of REQUIRED_PORT_FIELDS) {
      expect(port[field], "port " + key + " is missing " + String(field)).toBeDefined();
    }
    expect(typeof port.population).toBe("number");
    expect(typeof port.wealth).toBe("number");
    expect(typeof port.defense).toBe("number");
    expect(typeof port.availableCrew).toBe("number");
    expect(Array.isArray(port.bonusProduces)).toBe(true);
    expect(Array.isArray(port.shipyardQueue)).toBe(true);
  }
}

describe("migrateWorldState — full v1 → current chain", () => {
  it("lifts a versionless v1 save all the way to the current version", () => {
    const migrated = migrateWorldState(makeV1Save()) as any;
    expect(migrated.version).toBe(CURRENT_WORLD_VERSION);
  });

  it("preserves everything the player earned", () => {
    const migrated = migrateWorldState(makeV1Save()) as any;
    expect(migrated.player.gold).toBe(750);
    expect(migrated.player.notoriety).toBe(3);
    expect(migrated.player.reputation).toEqual({ england: 20, spain: -40 });
    expect(migrated.player.ranks).toEqual({ england: 1 });
    expect(migrated.time).toEqual({ day: 12, hour: 8, minute: 30, tick: 4200 });
    expect(migrated.rng).toEqual({ seed: 1234, state: 5678 });
    expect(migrated.entities.player_ship.ship.hullHp).toBe(55);
    expect(migrated.entities.player_ship.heading).toBe(1.2);
  });

  it("every port ends up with every field the current model requires", () => {
    expectPortsWellFormed(migrateWorldState(makeV1Save()));
  });

  it("keeps the faction of ports the save already knew", () => {
    const migrated = migrateWorldState(makeV1Save()) as any;
    expect(migrated.ports.port_royal.factionId).toBe(CITIES.port_royal.factionId);
    expect(migrated.ports.havana.factionId).toBe(CITIES.havana.factionId);
  });
});

describe("v2 — cargo key rename and port price tables", () => {
  it("renames sugar to sugar_cane and keeps the other holds", () => {
    const migrated = migrateWorldState(makeV1Save()) as any;
    const cargo = migrated.entities.player_ship.ship.cargo;
    expect(cargo.sugar_cane).toBe(12);
    expect(cargo.sugar).toBeUndefined();
    expect(cargo.tobacco).toBe(5);
    expect(cargo.food).toBe(15);
    expect(cargo.rum).toBe(3);
  });

  it("gives ships that predate the water hold a starting supply", () => {
    const migrated = migrateWorldState(makeV1Save()) as any;
    expect(migrated.entities.player_ship.ship.cargo.water).toBe(10);
  });

  it("leaves entities without cargo untouched apart from the v6 mode field", () => {
    const save = makeV1Save();
    save.entities.floating_wreck = { id: "floating_wreck", kind: "wreck", pos: { x: 1, y: 2 } };
    const migrated = migrateWorldState(save) as any;
    expect(migrated.entities.floating_wreck).toEqual({
      id: "floating_wreck", kind: "wreck", pos: { x: 1, y: 2 }, mode: "sailing",
    });
  });

  it("builds a price and inventory table for every port", () => {
    const migrated = migrateWorldState(makeV1Save()) as any;
    const port = migrated.ports.port_royal;
    expect(Object.keys(port.prices).length).toBeGreaterThan(0);
    expect(Object.keys(port.inventory).length).toBeGreaterThan(0);
  });

  it("adds the event log", () => {
    const migrated = migrateWorldState(makeV1Save()) as any;
    expect(migrated.eventLog).toEqual([]);
  });
});

describe("v3 / v4 — city roster growth", () => {
  it("fills in every city the save had never heard of", () => {
    const migrated = migrateWorldState(makeV1Save()) as any;
    for (const key of Object.keys(CITIES)) {
      expect(migrated.ports[key], "missing port " + key).toBeDefined();
    }
  });

  it("adds playerName / eraId / startYear with defaults", () => {
    const migrated = migrateWorldState(makeV1Save()) as any;
    expect(migrated.playerName).toBe("Captain");
    expect(migrated.eraId).toBe("pirates_sunset");
    expect(migrated.startYear).toBe(1690);
  });

  it("does not overwrite a name the player already chose", () => {
    const save = makeV1Save();
    save.playerName = "Barbanegra";
    save.eraId = "buccaneer_era";
    save.startYear = 1660;
    const migrated = migrateWorldState(save) as any;
    expect(migrated.playerName).toBe("Barbanegra");
    expect(migrated.eraId).toBe("buccaneer_era");
    expect(migrated.startYear).toBe(1660);
  });
});

describe("v5 / v8 — captain profile", () => {
  it("creates a default captain for saves from before captains existed", () => {
    const migrated = migrateWorldState(makeV1Save()) as any;
    expect(migrated.captain.nationality).toBe("england");
    expect(migrated.captain.startAge).toBe(20);
    expect(migrated.captain.training).toBe(TRAINING_DEFAULT);
    expect(migrated.captain.skills.fencing).toBeGreaterThan(0);
  });

  it("keeps a captain the save already had and only adds training", () => {
    const save = makeV1Save();
    save.captain = {
      nationality: "france",
      skills: { fencing: 9, gunnery: 2, navigation: 7, medicine: 1, charm: 6 },
      startAge: 26,
    };
    const migrated = migrateWorldState(save) as any;
    expect(migrated.captain.nationality).toBe("france");
    expect(migrated.captain.startAge).toBe(26);
    expect(migrated.captain.skills.fencing).toBe(9);
    expect(migrated.captain.training).toBe(TRAINING_DEFAULT);
  });

  it("does not reset training that was already set", () => {
    const save = migrateWorldState(makeV1Save()) as any;
    save.version = 7;
    save.captain.training = 0.87;
    const migrated = migrateWorldState(save) as any;
    expect(migrated.captain.training).toBe(0.87);
  });
});

describe("v6 — entity mode", () => {
  it("marks every legacy entity as sailing", () => {
    const migrated = migrateWorldState(makeV1Save()) as any;
    expect(migrated.entities.player_ship.mode).toBe("sailing");
  });

  it("leaves an explicit mode alone", () => {
    const save = makeV1Save();
    save.entities.player_ship.mode = "anchored";
    const migrated = migrateWorldState(save) as any;
    expect(migrated.entities.player_ship.mode).toBe("anchored");
  });
});

describe("v7 — living-world economy numerics", () => {
  it("seeds population / wealth / defense from the city baseline", () => {
    const migrated = migrateWorldState(makeV1Save()) as any;
    const port = migrated.ports.port_royal;
    expect(port.population).toBeGreaterThan(0);
    expect(port.wealth).toBeGreaterThan(0);
    expect(port.defense).toBeGreaterThan(0);
    expect(port.bonusProduces).toEqual([]);
  });

  it("keeps numerics a v7 save already carried", () => {
    const save = migrateWorldState(makeV1Save()) as any;
    save.version = 7;
    save.ports.port_royal = {
      ...save.ports.port_royal,
      availableCrew: 12, population: 999, wealth: 111, defense: 42, bonusProduces: ["gold"],
    };
    const migrated = migrateWorldState(save) as any;
    expect(migrated.ports.port_royal.population).toBe(999);
    expect(migrated.ports.port_royal.wealth).toBe(111);
    expect(migrated.ports.port_royal.defense).toBe(42);
    expect(migrated.ports.port_royal.bonusProduces).toEqual(["gold"]);
    expect(migrated.ports.port_royal.availableCrew).toBe(12);
  });

  it("treats wealth 0 as a real value, not a missing one", () => {
    const save = migrateWorldState(makeV1Save()) as any;
    save.version = 7;
    save.ports.port_royal = { ...save.ports.port_royal, population: 0, wealth: 0, defense: 0 };
    const migrated = migrateWorldState(save) as any;
    expect(migrated.ports.port_royal.wealth).toBe(0);
  });
});

describe("entry points and idempotence", () => {
  it("a current-version save passes through untouched", () => {
    const migrated = migrateWorldState(makeV1Save()) as any;
    const again = migrateWorldState(structuredClone(migrated)) as any;
    expect(again).toEqual(migrated);
  });

  it("migrating is stable — running the chain twice changes nothing", () => {
    const once = migrateWorldState(makeV1Save()) as any;
    const twice = migrateWorldState(migrateWorldState(makeV1Save()) as any) as any;
    expect(twice).toEqual(once);
  });

  it("every intermediate version is a valid entry point", () => {
    for (let v = 1; v <= CURRENT_WORLD_VERSION; v++) {
      // A save claiming version v skips every migration below it, so it has to
      // already look like v — build it by migrating fully and then relabelling.
      const asV = migrateWorldState(makeV1Save()) as any;
      asV.version = v;
      const migrated = migrateWorldState(asV) as any;
      expect(migrated.version, "entry at v" + v).toBe(CURRENT_WORLD_VERSION);
      expectPortsWellFormed(migrated);
    }
  });

  it("throws rather than half-migrating when a step is missing", () => {
    const future = { ...makeV1Save(), version: CURRENT_WORLD_VERSION - 100 };
    expect(() => migrateWorldState(future)).toThrow(/No migration from v/);
  });

  it("does not mutate the object it was handed", () => {
    const save = makeV1Save();
    const before = structuredClone(save);
    migrateWorldState(save);
    expect(save).toEqual(before);
  });
});
