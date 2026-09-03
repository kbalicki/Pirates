import type { CombatState, CombatEntityState, CombatEvent } from "../model/CombatState.ts";
import type { CombatCommand } from "../model/Commands.ts";
import type { EngineResult } from "../model/Events.ts";
import { SHIP_CLASSES } from "../data/ships.ts";
import { headingToVec, vec2Add, vec2Scale, vec2Dist, normalizeHeading, clamp } from "../services/Geometry.ts";
import { windSpeedModifier } from "../systems/WeatherSystem.ts";
import { CANNON_RANGE, CANNON_DAMAGE_HULL, CANNON_DAMAGE_SAILS, CANNON_DAMAGE_CREW, effectiveReloadTicks } from "../systems/CombatSystem.ts";
import { AMMO_DEFS, type AmmoType } from "../data/ammo.ts";
import { canBoard, resolveBoarding } from "../systems/BoardingSystem.ts";
import { damageSpeedMultiplier, damageTurnMultiplier, applyFlooding } from "../systems/DamageSystem.ts";

/** Archetypes drive enemy AI behavior. Mapped from ai.behavior in the world. */
export type AiArchetype = "aggressive" | "defensive" | "tactical";

/** Battle ships sail noticeably faster than world-map cruise speed for snappier tactics. */
const COMBAT_SPEED_MUL = 10;

export class CombatEngine {
  /**
   * Each archetype steers, throttles, and fires differently:
   *   - aggressive  → close to ~100px, broadside, round shot
   *   - defensive   → keep distance, chain shot to escape
   *   - tactical    → maintain weather gauge, grape then board
   */
  private archetype: AiArchetype = "aggressive";
  /** Captain swordsmanship 0..10 — affects boarding outcome. */
  private swordsmanship = 5;
  /** Player crew training 0..1 — affects reload speed for the player ship only. */
  private playerTraining = 0.5;
  /** Enemy crew training 0..1 — kept separate so AI ships reload at their own pace. */
  private enemyTraining = 0.5;
  /**
   * Result of the captains' duel, set by `SeaBattleScene` just before it queues
   * the boarding command. Consumed once, then cleared: a boarding that arrives
   * without a duel behind it falls back to the old strength comparison.
   */
  private pendingDuelWin: boolean | null = null;

  setArchetype(a: AiArchetype): void {
    this.archetype = a;
  }

  /** Hand the engine the outcome of the captains' duel for the next boarding. */
  setDuelResult(playerWon: boolean): void {
    this.pendingDuelWin = playerWon;
  }

  setSwordsmanship(v: number): void {
    this.swordsmanship = v;
  }

  setPlayerTraining(v: number): void {
    this.playerTraining = Math.max(0, Math.min(1, v));
  }

  setEnemyTraining(v: number): void {
    this.enemyTraining = Math.max(0, Math.min(1, v));
  }

  /**
   * Drill for one consort, when it has its own (v0.21.0).
   *
   * A hull that joined the fleet last month is manned by people the captain has
   * never drilled, and it should reload like it. Absent an entry the ally falls
   * back to the player's drill, which is what every consort used before.
   */
  private allyTraining: Map<string, number> = new Map();

  setAllyTraining(allyId: string, v: number): void {
    this.allyTraining.set(allyId, Math.max(0, Math.min(1, v)));
  }

  /** Pick the right training value depending on which ship is firing. */
  private trainingFor(shipId: string, state: CombatState): number {
    if (shipId === (state.playerShipId as string)) return this.playerTraining;
    const ally = this.allyTraining.get(shipId);
    if (ally !== undefined) return ally;
    return this.enemyTraining;
  }

  /** Wind angle modulates how easily the ship turns.
   *   beam reach (~90° off wind)  →  1.0 (best — sails are loaded but you have lateral grip)
   *   close-hauled (30-60°)       →  0.6 (sluggish — sails fight the bow)
   *   running (>150°)             →  0.85 (good but rudder less responsive)
   *   in irons (<30°)             →  0.4 (sails luffing — minimal steerage)
   * Effect strength scales with wind strength: in dead calm, factor approaches 1.0. */
  private windTurnFactor(shipHeading: number, windDirRad: number, windStrength: number): number {
    const TWO_PI = Math.PI * 2;
    let angleDiff = Math.abs(shipHeading - windDirRad);
    angleDiff = ((angleDiff % TWO_PI) + TWO_PI) % TWO_PI;
    const windAngle = angleDiff > Math.PI ? TWO_PI - angleDiff : angleDiff;
    const deg = windAngle * (180 / Math.PI);
    let f: number;
    if (deg < 30) f = 0.4;
    else if (deg < 60) f = 0.4 + (deg - 30) / 30 * 0.2;       // 0.4 → 0.6
    else if (deg < 90) f = 0.6 + (deg - 60) / 30 * 0.4;       // 0.6 → 1.0
    else if (deg < 130) f = 1.0;                              // peak (beam reach)
    else if (deg < 180) f = 1.0 - (deg - 130) / 50 * 0.15;    // 1.0 → 0.85
    else f = 0.85;
    return 1.0 + (f - 1.0) * windStrength;
  }

  apply(
    prev: CombatState,
    commands: CombatCommand[],
    dtTicks: number,
  ): EngineResult<CombatState, CombatEvent> {
    let state = prev;
    const events: CombatEvent[] = [];

    // Apply player commands
    for (const cmd of commands) {
      const result = this.reduceCommand(state, state.playerShipId as string, cmd);
      state = result.state;
      events.push(...result.events);
    }

    // Tick cooldowns and movement for all ships
    const updatedEntities: Record<string, CombatEntityState> = {};

    for (const [id, entity] of Object.entries(state.entities)) {
      let updated = entity;

      if (entity.kind === "ship" && entity.ship) {
        const shipClass = SHIP_CLASSES[entity.ship.classId as string];
        if (shipClass) {
          const windMod = windSpeedModifier(entity.heading, state.wind.dirRad, state.wind.strength);
          // Damage tiers (v0.9.9): hull and rigging each cost speed in stages.
          // A dismasted ship returns 0 and drifts, whatever the helm orders.
          const damageMod = damageSpeedMultiplier(
            entity.ship.hullHp, entity.ship.hullMax,
            entity.ship.sailsHp, entity.ship.sailsMax,
          );
          const sailLvl = entity.sailLevel ?? 0;
          // Speed scales with sail throttle 0..1 and is boosted by COMBAT_SPEED_MUL so battles feel snappy.
          const speed = COMBAT_SPEED_MUL * shipClass.speedBase * sailLvl * windMod * damageMod;

          const dir = headingToVec(entity.heading);
          const vel = vec2Scale(dir, speed);
          const newPos = vec2Add(entity.pos, vec2Scale(vel, dtTicks));

          const clampedPos = {
            x: clamp(newPos.x, 0, state.arena.width),
            y: clamp(newPos.y, 0, state.arena.height),
          };

          // Tick cooldowns
          const newCooldown = {
            left: Math.max(0, entity.ship.cooldown.left - dtTicks),
            right: Math.max(0, entity.ship.cooldown.right - dtTicks),
          };

          // A foundering hull keeps taking water even if nobody fires again.
          const beforeFlood = entity.ship.hullHp;
          const floodedHull = applyFlooding(beforeFlood, entity.ship.hullMax, dtTicks);
          if (floodedHull < beforeFlood) {
            events.push({
              type: "ShipDamaged",
              shipId: entity.id,
              hullDelta: floodedHull - beforeFlood,
              sailsDelta: 0,
            });
          }

          updated = {
            ...entity,
            pos: clampedPos,
            vel,
            ship: { ...entity.ship, hullHp: floodedHull, cooldown: newCooldown },
          };
        }
      }

      updatedEntities[id] = updated;
    }

    // Enemy AI (uses archetype)
    const enemyId = state.enemyShipId as string;
    const playerId = state.playerShipId as string;
    const enemy = updatedEntities[enemyId];
    const player = updatedEntities[playerId];
    const baseRange = state.cannonRange ?? CANNON_RANGE;

    if (enemy?.ship && player) {
      const aiResult = this.runEnemyAI(enemy, player, dtTicks, baseRange);
      updatedEntities[enemyId] = aiResult.entity;
      events.push(...aiResult.events);

      // Damage from enemy fire is encoded in events — apply now
      for (const ev of aiResult.events) {
        if (ev.type === "ShipDamaged" && ev.shipId === player.id && updatedEntities[playerId]?.ship) {
          const ps = updatedEntities[playerId].ship!;
          updatedEntities[playerId] = {
            ...updatedEntities[playerId],
            ship: {
              ...ps,
              hullHp: Math.max(0, ps.hullHp + ev.hullDelta),
              sailsHp: Math.max(0, ps.sailsHp + ev.sailsDelta),
              crew: {
                ...ps.crew,
                current: Math.max(0, ps.crew.current + (ev.crewDelta ?? 0)),
              },
            },
          };
        }
      }
    }

    // Phase D: Allied fleet ships (id starts with "ally_") fire at enemy when in range
    if (enemy?.ship) {
      const enemyClass = SHIP_CLASSES[enemy.ship.classId as string];
      const enemyArmor = enemyClass?.armor ?? 0.3;
      for (const [id, ally] of Object.entries(updatedEntities)) {
        if (!id.startsWith("ally_") || !ally.ship) continue;
        if (ally.ship.cooldown.left > 0) continue;
        const dist = vec2Dist(ally.pos, enemy.pos);
        const def = AMMO_DEFS[ally.ship.ammoType ?? "round"];
        const effRange = baseRange * def.rangeMul;
        if (dist > effRange) continue;

        const dRatio = dist / effRange;
        let distFactor = Math.pow(1 - dRatio, 1.5);
        if (dRatio < 0.15) distFactor *= 1.6;
        const accuracy = Math.max(0.15, 1 - 0.7 * dRatio);
        const hit = Math.random() < accuracy;

        events.push({ type: "CannonFired", side: "left", shipId: ally.id, ammo: ally.ship.ammoType ?? "round", hit, fromPos: ally.pos, targetPos: enemy.pos });
        events.push({ type: "Sound", id: "cannon_fire" });

        if (hit) {
          const shots = Math.max(1, Math.floor(ally.ship.cannons / 2));
          const armorPass = 1 - enemyArmor;
          const armorPassCrew = 1 - enemyArmor * 0.3;
          const hullDelta = -CANNON_DAMAGE_HULL * shots * def.hullMul * distFactor * armorPass;
          const sailsDelta = -CANNON_DAMAGE_SAILS * shots * def.sailsMul * distFactor * armorPass;
          const crewDelta = -Math.round(CANNON_DAMAGE_CREW * shots * def.crewMul * distFactor * armorPassCrew);
          events.push({ type: "ShipDamaged", shipId: enemy.id, hullDelta, sailsDelta, crewDelta });
          const e = updatedEntities[enemyId];
          if (e?.ship) {
            updatedEntities[enemyId] = {
              ...e,
              ship: {
                ...e.ship,
                hullHp: Math.max(0, e.ship.hullHp + hullDelta),
                sailsHp: Math.max(0, e.ship.sailsHp + sailsDelta),
                crew: { ...e.ship.crew, current: Math.max(0, e.ship.crew.current + crewDelta) },
              },
            };
          }
        }
        // Set cooldown regardless of hit or miss, at this consort's own drill.
        const allyReload = effectiveReloadTicks(
          ally.ship.crew.current, ally.ship.crew.max,
          ally.ship.crew.morale, this.trainingFor(id, state),
        );
        updatedEntities[id] = {
          ...ally,
          ship: { ...ally.ship, cooldown: { ...ally.ship.cooldown, left: allyReload } },
        };
      }
    }

    // Surrender / battle-end checks
    const playerShip = updatedEntities[playerId]?.ship;
    const enemyShip = updatedEntities[enemyId]?.ship;

    if (playerShip && playerShip.hullHp <= 0) {
      events.push({ type: "BattleEnded", outcome: "lose" });
    } else if (enemyShip && enemyShip.hullHp <= 0) {
      events.push({ type: "BattleEnded", outcome: "win", loot: { gold: 50 } });
    } else if (enemyShip && this.shouldEnemySurrender(enemyShip)) {
      events.push({ type: "Surrender", shipId: state.enemyShipId });
      events.push({ type: "BattleEnded", outcome: "surrender", loot: { gold: 30 } });
    }

    const newState: CombatState = {
      ...state,
      time: { tick: state.time.tick + dtTicks },
      entities: updatedEntities,
      events,
    };

    return { state: newState, events };
  }

  /** Enemy strikes its colors when any of these is true:
   *    • hull   ≤ 10 % of max
   *    • sails  ≤ 10 % of max
   *    • crew   < 10 sailors (absolute — can't even fight a boarding)
   *  Sunk ships skip this check (battle ends differently). */
  private shouldEnemySurrender(ship: NonNullable<CombatEntityState["ship"]>): boolean {
    if (ship.hullHp <= 0) return false;
    if (ship.hullHp / ship.hullMax <= 0.10) return true;
    if (ship.sailsHp / ship.sailsMax <= 0.10) return true;
    if (ship.crew.current < 10) return true;
    return false;
  }

  private reduceCommand(
    state: CombatState,
    shipId: string,
    cmd: CombatCommand,
  ): { state: CombatState; events: CombatEvent[] } {
    const entity = state.entities[shipId];
    if (!entity?.ship) return { state, events: [] };

    const events: CombatEvent[] = [];

    switch (cmd.type) {
      case "SetSailLevel": {
        const lvl = clamp(cmd.value, 0, 1);
        return {
          state: {
            ...state,
            entities: {
              ...state.entities,
              [shipId]: { ...entity, sailLevel: lvl },
            },
          },
          events,
        };
      }

      case "Turn": {
        const shipClass = SHIP_CLASSES[entity.ship.classId as string];
        const baseTurn = shipClass?.turnRate ?? 0.4;
        // Wind affects steering: easiest on beam reach, hardest in irons or running with full sail.
        const windFactor = this.windTurnFactor(entity.heading, state.wind.dirRad, state.wind.strength);
        // Heavily-loaded sails also reduce maneuverability slightly (close-hauled with full sails is brutal).
        const sailPenalty = 1 - entity.sailLevel * 0.25;
        // Hull damage hurts maneuverability — a holed ship takes on water, the
        // rudder lags, the deck crew slows. Staged since v0.9.9: sound 1.0,
        // leaking 0.85, crippled 0.65, foundering 0.45.
        const hullPenalty = damageTurnMultiplier(entity.ship.hullHp, entity.ship.hullMax);
        const maxTurn = baseTurn * windFactor * sailPenalty * hullPenalty;
        const amount = clamp(cmd.amount, 0, maxTurn);
        const delta = cmd.dir === "left" ? -amount : amount;
        return {
          state: {
            ...state,
            entities: {
              ...state.entities,
              [shipId]: { ...entity, heading: normalizeHeading(entity.heading + delta) },
            },
          },
          events,
        };
      }

      case "SetAmmo": {
        // Switching ammo wastes the prior round in the barrels — both broadsides reload from zero.
        const ammoChanged = entity.ship.ammoType !== cmd.ammo;
        const reloadTicks = effectiveReloadTicks(
          entity.ship.crew.current, entity.ship.crew.max,
          entity.ship.crew.morale, this.trainingFor(shipId, state),
        );
        const newCooldown = ammoChanged
          ? { left: reloadTicks, right: reloadTicks }
          : entity.ship.cooldown;
        return {
          state: {
            ...state,
            entities: {
              ...state.entities,
              [shipId]: { ...entity, ship: { ...entity.ship, ammoType: cmd.ammo, cooldown: newCooldown } },
            },
          },
          events,
        };
      }

      case "FireCannons": {
        return this.applyFire(state, shipId, cmd.side);
      }

      case "AttemptBoarding": {
        return this.applyBoarding(state, shipId);
      }

      default:
        return { state, events };
    }
  }

  private applyBoarding(
    state: CombatState,
    shipId: string,
  ): { state: CombatState; events: CombatEvent[] } {
    const events: CombatEvent[] = [];
    const player = state.entities[shipId];
    const enemyId = state.enemyShipId as string;
    const enemy = state.entities[enemyId];
    if (!player?.ship || !enemy?.ship) return { state, events };

    const dist = vec2Dist(player.pos, enemy.pos);
    const precheck = canBoard(player.ship, enemy.ship, dist);
    if (!precheck.ok) {
      events.push({ type: "BoardingRejected", reason: precheck.reason });
      return { state, events };
    }

    const duelWin = this.pendingDuelWin;
    this.pendingDuelWin = null;
    const result = resolveBoarding(player.ship, enemy.ship, this.swordsmanship, duelWin ?? undefined);
    events.push({
      type: "BoardingResolved",
      captured: result.captured,
      playerCrewAfter: result.playerCrewAfter,
      enemyCrewAfter: result.enemyCrewAfter,
    });

    // Apply crew losses
    const newPlayerShip = {
      ...player.ship,
      crew: { ...player.ship.crew, current: result.playerCrewAfter },
    };
    const newEnemyShip = {
      ...enemy.ship,
      crew: { ...enemy.ship.crew, current: result.enemyCrewAfter },
    };

    if (result.captured) {
      events.push({ type: "BattleEnded", outcome: "captured", loot: { gold: 100, fraction: result.lootFraction } });
    } else if (result.playerCrewAfter <= 0) {
      events.push({ type: "BattleEnded", outcome: "lose" });
    }

    return {
      state: {
        ...state,
        entities: {
          ...state.entities,
          [shipId]: { ...player, ship: newPlayerShip },
          [enemyId]: { ...enemy, ship: newEnemyShip },
        },
      },
      events,
    };
  }

  /** Resolve a broadside: cooldown check, ammo-modulated damage, FX events. */
  private applyFire(
    state: CombatState,
    shipId: string,
    side: "left" | "right",
  ): { state: CombatState; events: CombatEvent[] } {
    const entity = state.entities[shipId];
    if (!entity?.ship) return { state, events: [] };
    const events: CombatEvent[] = [];

    const cooldown = side === "left" ? entity.ship.cooldown.left : entity.ship.cooldown.right;
    if (cooldown > 0) return { state, events };

    const ammo = entity.ship.ammoType ?? "round";
    const def = AMMO_DEFS[ammo];

    const targetId = shipId === (state.playerShipId as string) ? state.enemyShipId : state.playerShipId;
    const target = state.entities[targetId as string];

    // Arc check: broadside cannons can only fire to the side that matches the requested cannon
    // (left/right) AND within ±60° of perpendicular to the ship's heading. Bow/stern is a dead zone.
    if (target?.ship) {
      const dx = target.pos.x - entity.pos.x;
      const dy = target.pos.y - entity.pos.y;
      const d2 = Math.sqrt(dx * dx + dy * dy);
      if (d2 > 0) {
        const fx = Math.sin(entity.heading);
        const fy = -Math.cos(entity.heading);
        const rx = Math.cos(entity.heading);
        const ry = Math.sin(entity.heading);
        const fwdDot = (dx * fx + dy * fy) / d2;
        const rightDot = (dx * rx + dy * ry) / d2;
        const inDeadZone = Math.abs(fwdDot) > 0.5; // outside ±60° of perpendicular
        const wrongSide =
          (side === "right" && rightDot < 0) ||
          (side === "left" && rightDot > 0);
        if (inDeadZone || wrongSide) {
          // Silently refuse — no cooldown, no fire event. Player must turn broadside-on.
          return { state, events: [] };
        }
      }
    }

    const reloadTicks = effectiveReloadTicks(
      entity.ship.crew.current, entity.ship.crew.max,
      entity.ship.crew.morale, this.trainingFor(shipId, state),
    );
    const newCooldown = { ...entity.ship.cooldown };
    if (side === "left") newCooldown.left = reloadTicks;
    else newCooldown.right = reloadTicks;

    if (!target || !target.ship) {
      events.push({ type: "CannonFired", side, shipId: entity.id, ammo, hit: false, fromPos: entity.pos });
      events.push({ type: "Sound", id: "cannon_fire" });
      return {
        state: {
          ...state,
          entities: {
            ...state.entities,
            [shipId]: { ...entity, ship: { ...entity.ship, cooldown: newCooldown } },
          },
        },
        events,
      };
    }

    const dist = vec2Dist(entity.pos, target.pos);
    const baseRange = state.cannonRange ?? CANNON_RANGE;
    const effectiveRange = baseRange * def.rangeMul;
    if (dist > effectiveRange) {
      events.push({ type: "CannonFired", side, shipId: entity.id, ammo, hit: false, fromPos: entity.pos, targetPos: target.pos });
      events.push({ type: "Sound", id: "cannon_fire" });
      return {
        state: {
          ...state,
          entities: {
            ...state.entities,
            [shipId]: { ...entity, ship: { ...entity.ship, cooldown: newCooldown } },
          },
        },
        events,
      };
    }

    // Quadratic falloff + close-range bonus — point-blank shots are devastating
    const dRatio = dist / effectiveRange;
    let distFactor = Math.pow(1 - dRatio, 1.5);
    if (dRatio < 0.15) distFactor *= 1.6; // point-blank bonus (Sid Meier style)

    // Accuracy: very high close, drops off with range
    const accuracy = Math.max(0.15, 1 - 0.7 * dRatio);
    const hit = Math.random() < accuracy;

    events.push({ type: "CannonFired", side, shipId: entity.id, ammo, hit, fromPos: entity.pos, targetPos: target.pos });
    events.push({ type: "Sound", id: "cannon_fire" });

    if (!hit) {
      // Miss: only cooldown is set; no damage events
      return {
        state: {
          ...state,
          entities: {
            ...state.entities,
            [shipId]: { ...entity, ship: { ...entity.ship, cooldown: newCooldown } },
          },
        },
        events,
      };
    }

    // Number of cannons in this broadside (half the total cannons on the ship)
    const shots = Math.max(1, Math.floor(entity.ship.cannons / 2));
    // Target hull armor — taken straight from ShipClassDef (0..1).
    const targetClass = SHIP_CLASSES[target.ship.classId as string];
    const armor = targetClass?.armor ?? 0.3;
    const armorPass = 1 - armor;
    // Grape shot is anti-personnel — armor barely matters for crew kills (canister bursts above deck).
    const armorPassCrew = 1 - armor * 0.3;

    const hullDelta = -CANNON_DAMAGE_HULL * shots * def.hullMul * distFactor * armorPass;
    const sailsDelta = -CANNON_DAMAGE_SAILS * shots * def.sailsMul * distFactor * armorPass;
    const crewDelta = -Math.round(CANNON_DAMAGE_CREW * shots * def.crewMul * distFactor * armorPassCrew);

    const newTargetShip = {
      ...target.ship,
      hullHp: Math.max(0, target.ship.hullHp + hullDelta),
      sailsHp: Math.max(0, target.ship.sailsHp + sailsDelta),
      crew: {
        ...target.ship.crew,
        current: Math.max(0, target.ship.crew.current + crewDelta),
        morale: ammo === "grape"
          ? Math.max(0, target.ship.crew.morale - 0.08 * distFactor)
          : Math.max(0, target.ship.crew.morale - 0.02 * distFactor),
      },
    };

    events.push({
      type: "ShipDamaged",
      shipId: target.id,
      hullDelta,
      sailsDelta,
      crewDelta,
    });
    events.push({ type: "Sound", id: "cannon_hit" });

    return {
      state: {
        ...state,
        entities: {
          ...state.entities,
          [shipId]: { ...entity, ship: { ...entity.ship, cooldown: newCooldown } },
          [targetId as string]: { ...target, ship: newTargetShip },
        },
      },
      events,
    };
  }

  private runEnemyAI(
    enemy: CombatEntityState,
    player: CombatEntityState,
    _dtTicks: number,
    cannonRange: number,
  ): { entity: CombatEntityState; events: CombatEvent[] } {
    if (!enemy.ship) return { entity: enemy, events: [] };

    const events: CombatEvent[] = [];
    let updated = enemy;

    const dist = vec2Dist(enemy.pos, player.pos);
    const dx = player.pos.x - enemy.pos.x;
    const dy = player.pos.y - enemy.pos.y;
    const angleToPlayer = Math.atan2(dx, -dy);

    // Crew-ratio override (Phase B+) — overrides archetype.
    // Enemy w/ ≥1.5× player crew → press for boarding (close in fast, grape).
    // Enemy w/ ≤0.5× player crew → flee (max distance, chain shot).
    let crewMode: "boarder" | "fleeing" | "normal" = "normal";
    if (player.ship && enemy.ship.crew.current > 0) {
      const ratio = enemy.ship.crew.current / Math.max(1, player.ship.crew.current);
      if (ratio >= 1.5) crewMode = "boarder";
      else if (ratio <= 0.5) crewMode = "fleeing";
    }

    // Archetype-driven defaults
    let desiredDist = 120;
    let preferredAmmo: AmmoType = "round";
    if (this.archetype === "defensive") {
      desiredDist = Math.min(cannonRange * 0.9, cannonRange * 0.7);
      preferredAmmo = "chain";
    } else if (this.archetype === "tactical") {
      desiredDist = cannonRange * 0.4;
      preferredAmmo = dist < cannonRange * 0.3 ? "grape" : "round";
    } else {
      desiredDist = cannonRange * 0.45;
      preferredAmmo = "round";
    }

    // Apply crew-ratio override
    if (crewMode === "boarder") {
      desiredDist = 40; // get close enough to grapple
      preferredAmmo = dist < cannonRange * 0.3 ? "grape" : "round";
    } else if (crewMode === "fleeing") {
      desiredDist = cannonRange * 1.1; // beyond range = trying to escape
      preferredAmmo = "chain"; // shred player sails to widen the gap
    }

    // Broadside offset — keep enemy on our side
    const broadSideOffset = Math.PI / 2;
    const desiredHeading = normalizeHeading(angleToPlayer + broadSideOffset);
    const shipClass = SHIP_CLASSES[enemy.ship.classId as string];
    const turnRate = shipClass?.turnRate ?? 0.08;

    let headingDiff = desiredHeading - enemy.heading;
    while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;
    while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;

    const turnAmount = Math.min(Math.abs(headingDiff), turnRate);
    const newHeading = normalizeHeading(enemy.heading + Math.sign(headingDiff) * turnAmount);

    // Sail throttle 0..1 depends on how far we are from desired distance
    const sailLvl = dist > desiredDist * 1.2 ? 1.0 : dist < desiredDist * 0.6 ? 0.4 : 0.7;

    // Load preferred ammo (also resets cooldowns if changed)
    const ammoChanged = enemy.ship.ammoType !== preferredAmmo;
    const enemyReloadOnSwitch = effectiveReloadTicks(
      enemy.ship.crew.current, enemy.ship.crew.max,
      enemy.ship.crew.morale, this.enemyTraining,
    );
    const ship = ammoChanged
      ? { ...enemy.ship, ammoType: preferredAmmo, cooldown: { left: enemyReloadOnSwitch, right: enemyReloadOnSwitch } }
      : { ...enemy.ship, ammoType: preferredAmmo };

    updated = {
      ...enemy,
      heading: newHeading,
      sailLevel: sailLvl,
      ship,
    };

    // Fleeing AI: don't fire if intentionally running — focus on escape
    if (crewMode === "fleeing" && dist > cannonRange * 0.9) {
      return { entity: updated, events };
    }

    // Fire if in range and cooldown ready
    const def = AMMO_DEFS[preferredAmmo];
    const effectiveRange = cannonRange * def.rangeMul;
    if (dist <= effectiveRange && updated.ship!.cooldown.left <= 0) {
      const dRatio = dist / effectiveRange;
      let distFactor = Math.pow(1 - dRatio, 1.5);
      if (dRatio < 0.15) distFactor *= 1.6;
      const accuracy = Math.max(0.15, 1 - 0.7 * dRatio);
      const hit = Math.random() < accuracy;

      events.push({ type: "CannonFired", side: "left", shipId: enemy.id, ammo: preferredAmmo, hit, fromPos: enemy.pos, targetPos: player.pos });
      events.push({ type: "Sound", id: "cannon_fire" });

      if (hit && player.ship) {
        const shots = Math.max(1, Math.floor(enemy.ship.cannons / 2));
        const playerClass = SHIP_CLASSES[player.ship.classId as string];
        const armor = playerClass?.armor ?? 0.3;
        const armorPass = 1 - armor;
        const armorPassCrew = 1 - armor * 0.3;
        const hullDelta = -CANNON_DAMAGE_HULL * shots * def.hullMul * distFactor * armorPass;
        const sailsDelta = -CANNON_DAMAGE_SAILS * shots * def.sailsMul * distFactor * armorPass;
        const crewDelta = -Math.round(CANNON_DAMAGE_CREW * shots * def.crewMul * distFactor * armorPassCrew);
        events.push({
          type: "ShipDamaged",
          shipId: player.id,
          hullDelta,
          sailsDelta,
          crewDelta,
        });
      }

      const enemyReloadOnFire = effectiveReloadTicks(
        updated.ship!.crew.current, updated.ship!.crew.max,
        updated.ship!.crew.morale, this.enemyTraining,
      );
      updated = {
        ...updated,
        ship: {
          ...updated.ship!,
          cooldown: { ...updated.ship!.cooldown, left: enemyReloadOnFire },
        },
      };
    }

    return { entity: updated, events };
  }
}
