import type { WorldState } from "../core/model/WorldState.ts";
import { initPortPrices, initPortInventory } from "../core/data/prices.ts";
import { CITIES } from "../core/data/cities.ts";
import { portId } from "../core/model/ids.ts";
import { createDefaultCaptainProfile, TRAINING_DEFAULT } from "../core/model/CaptainState.ts";
import { getPortBaseline } from "../core/data/economyBaselines.ts";

export const CURRENT_WORLD_VERSION = 9;

type Migration = (world: unknown) => unknown;

const migrations: Record<number, Migration> = {
  2: (world: any) => {
    // Add eventLog, migrate cargo keys, rebuild port inventories
    const entities: Record<string, any> = {};
    for (const [id, entity] of Object.entries(world.entities as Record<string, any>)) {
      if (entity.ship?.cargo) {
        const old = entity.ship.cargo;
        const cargo: Record<string, number> = {};
        if (old.food) cargo.food = old.food;
        if (old.rum) cargo.rum = old.rum;
        if (old.sugar) cargo.sugar_cane = old.sugar;
        if (old.tobacco) cargo.tobacco = old.tobacco;
        if (!cargo.water) cargo.water = 10;
        entities[id] = { ...entity, ship: { ...entity.ship, cargo } };
      } else {
        entities[id] = entity;
      }
    }

    const ports: Record<string, any> = {};
    for (const [key, port] of Object.entries(world.ports as Record<string, any>)) {
      ports[key] = {
        ...port,
        prices: initPortPrices(key),
        inventory: initPortInventory(key),
      };
    }

    return { ...world, version: 2, eventLog: [], entities, ports };
  },

  3: (world: any) => {
    // Add playerName, eraId, startYear; rebuild ports for all cities
    const oldPorts = (world.ports ?? {}) as Record<string, any>;
    const ports: Record<string, any> = {};
    for (const key of Object.keys(CITIES)) {
      if (oldPorts[key]) {
        ports[key] = oldPorts[key];
      } else {
        ports[key] = {
          portId: portId(key),
          factionId: CITIES[key].factionId,
          prices: initPortPrices(key),
          inventory: initPortInventory(key),
          shipyardQueue: [],
        };
      }
    }

    return {
      ...world,
      version: 3,
      playerName: world.playerName ?? "Captain",
      eraId: world.eraId ?? "pirates_sunset",
      startYear: world.startYear ?? 1690,
      ports,
    };
  },

  4: (world: any) => {
    // Expand from 27 to 45 cities; rebuild ports for all cities in CITIES
    const oldPorts = (world.ports ?? {}) as Record<string, any>;
    const ports: Record<string, any> = {};
    for (const key of Object.keys(CITIES)) {
      if (oldPorts[key]) {
        // Preserve existing port runtime state, update faction from new data
        ports[key] = {
          ...oldPorts[key],
          factionId: CITIES[key].factionId,
        };
      } else {
        ports[key] = {
          portId: portId(key),
          factionId: CITIES[key].factionId,
          prices: initPortPrices(key),
          inventory: initPortInventory(key),
          shipyardQueue: [],
        };
      }
    }

    return { ...world, version: 4, ports };
  },

  5: (world: any) => {
    // Add captain profile to old saves
    return {
      ...world,
      version: 5,
      captain: world.captain ?? createDefaultCaptainProfile(),
    };
  },

  6: (world: any) => {
    // Add mode field to all entities
    const entities: Record<string, any> = {};
    for (const [id, entity] of Object.entries(world.entities as Record<string, any>)) {
      entities[id] = { ...entity, mode: entity.mode ?? "sailing" };
    }
    return { ...world, version: 6, entities };
  },

  8: (world: any) => {
    // Add captain.training field for crew reload-speed mechanic.
    const captain = world.captain ?? createDefaultCaptainProfile();
    return {
      ...world,
      version: 8,
      captain: { ...captain, training: typeof captain.training === "number" ? captain.training : TRAINING_DEFAULT },
    };
  },

  7: (world: any) => {
    // Living-world economy: add numeric population/wealth/defense to every port.
    // Old enum-only saves get fresh baselines from CityDef.
    const oldPorts = (world.ports ?? {}) as Record<string, any>;
    const ports: Record<string, any> = {};
    for (const key of Object.keys(CITIES)) {
      const baseline = getPortBaseline(key);
      const old = oldPorts[key];
      ports[key] = {
        ...(old ?? {
          portId: portId(key),
          factionId: CITIES[key].factionId,
          prices: initPortPrices(key),
          inventory: initPortInventory(key),
          shipyardQueue: [],
          availableCrew: 0,
        }),
        population: old?.population ?? baseline.population,
        wealth: typeof old?.wealth === "number" ? old.wealth : baseline.wealth,
        defense: old?.defense ?? baseline.defense,
        bonusProduces: old?.bonusProduces ?? [],
      };
    }
    return { ...world, version: 7, ports };
  },
  9: (world: any) => {
    // Repair pass. Ports carried over from a pre-v2 save were only ever
    // *extended* — v2 added prices/inventory, v7 added the economy numerics —
    // so ports that predate `shipyardQueue` / `availableCrew` never got them
    // and reached v8 with holes in them. Nothing crashed (both readers guard
    // with `?? 0`), but the shape did not match `PortRuntimeState` and the
    // tavern pool read as undefined until the first refresh. Normalise every
    // port to the full shape; ports that are already complete pass through.
    const oldPorts = (world.ports ?? {}) as Record<string, any>;
    const ports: Record<string, any> = {};
    for (const key of Object.keys(CITIES)) {
      const baseline = getPortBaseline(key);
      const old = oldPorts[key] ?? {};
      ports[key] = {
        ...old,
        portId: old.portId ?? portId(key),
        factionId: old.factionId ?? CITIES[key].factionId,
        prices: old.prices ?? initPortPrices(key),
        inventory: old.inventory ?? initPortInventory(key),
        shipyardQueue: Array.isArray(old.shipyardQueue) ? old.shipyardQueue : [],
        availableCrew: typeof old.availableCrew === "number" ? old.availableCrew : 0,
        population: typeof old.population === "number" ? old.population : baseline.population,
        wealth: typeof old.wealth === "number" ? old.wealth : baseline.wealth,
        defense: typeof old.defense === "number" ? old.defense : baseline.defense,
        bonusProduces: Array.isArray(old.bonusProduces) ? old.bonusProduces : [],
      };
    }
    return { ...world, version: 9, ports };
  },
};

export function migrateWorldState(world: unknown): WorldState {
  let current = world as Record<string, unknown>;
  let version = (current.version as number) ?? 1;

  while (version < CURRENT_WORLD_VERSION) {
    const nextVersion = version + 1;
    const migrator = migrations[nextVersion];
    if (!migrator) {
      throw new Error(`No migration from v${version} to v${nextVersion}`);
    }
    current = migrator(current) as Record<string, unknown>;
    version = nextVersion;
  }

  return current as unknown as WorldState;
}
