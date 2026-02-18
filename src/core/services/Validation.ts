import type { WorldState } from "../model/WorldState.ts";

export type ValidationError = {
  field: string;
  message: string;
};

export function validateWorldState(world: WorldState): ValidationError[] {
  const errors: ValidationError[] = [];

  // player.id exists in entities
  if (!world.entities[world.player.id as string]) {
    errors.push({ field: "player.id", message: "Player entity not found in entities" });
  }

  // player.shipId exists and is kind="ship"
  const playerShip = world.entities[world.player.shipId as string];
  if (!playerShip) {
    errors.push({ field: "player.shipId", message: "Player ship entity not found" });
  } else if (playerShip.kind !== "ship") {
    errors.push({ field: "player.shipId", message: `Player ship is kind="${playerShip.kind}", expected "ship"` });
  }

  // player.location.type="port" → portId exists in ports
  if (world.player.location.type === "port") {
    const pid = world.player.location.portId;
    if (!pid || !world.ports[pid as string]) {
      errors.push({ field: "player.location.portId", message: "Port location references missing port" });
    }
  }

  // Validate entities
  for (const [key, entity] of Object.entries(world.entities)) {
    if (entity.kind === "ship" && entity.ship) {
      // cargo not exceeding cargoCap
      const totalCargo = Object.values(entity.ship.cargo).reduce<number>((sum, qty) => sum + qty, 0);
      if (totalCargo > entity.ship.cargoCap) {
        errors.push({ field: `entities[${key}].cargo`, message: "Cargo exceeds capacity" });
      }

      // hullHp in range
      if (entity.ship.hullHp < 0 || entity.ship.hullHp > entity.ship.hullMax) {
        errors.push({ field: `entities[${key}].hullHp`, message: "Hull HP out of range" });
      }

      // sailsHp in range
      if (entity.ship.sailsHp < 0 || entity.ship.sailsHp > entity.ship.sailsMax) {
        errors.push({ field: `entities[${key}].sailsHp`, message: "Sails HP out of range" });
      }
    }

    // sailLevel in range
    if (entity.sailLevel < 0 || entity.sailLevel > 1) {
      errors.push({ field: `entities[${key}].sailLevel`, message: "Sail level out of 0..1 range" });
    }

    // No NaN
    if (isNaN(entity.pos.x) || isNaN(entity.pos.y)) {
      errors.push({ field: `entities[${key}].pos`, message: "Position contains NaN" });
    }
    if (isNaN(entity.heading)) {
      errors.push({ field: `entities[${key}].heading`, message: "Heading is NaN" });
    }
  }

  // Validate reputation values
  for (const [fid, rep] of Object.entries(world.player.reputation)) {
    if (typeof rep !== "number" || isNaN(rep)) {
      errors.push({ field: `player.reputation[${fid}]`, message: "Reputation is not a valid number" });
    }
    if (rep < -100 || rep > 100) {
      errors.push({ field: `player.reputation[${fid}]`, message: "Reputation out of -100..100 range" });
    }
  }

  return errors;
}
