import type { WorldState } from "../core/model/WorldState.ts";
import { initPortPrices, initPortInventory } from "../core/data/prices.ts";
import { CITIES } from "../core/data/cities.ts";
import { portId } from "../core/model/ids.ts";
import { createDefaultCaptainProfile } from "../core/model/CaptainState.ts";

export const CURRENT_WORLD_VERSION = 6;

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
