import { shipClassId } from "../model/ids.ts";
import type { ShipClassId } from "../model/ids.ts";

export type ShipClassDef = {
  id: ShipClassId;
  name: string;
  nameKey: string;         // i18n key for ship name
  speedBase: number;       // world units per tick at full sail, no wind modifier
  turnRate: number;        // rad per tick
  hullMax: number;
  sailsMax: number;
  cannons: number;
  cargoCap: number;
  crewMax: number;
  crewMin: number;         // minimum crew to operate
  buyPrice: number;
  sprite: string;          // sprite key
  /** Minimum angle to wind in degrees. Below this = dead zone (in irons). */
  minWindAngle: number;
  /** Mast height in meters — affects spyglass range (future). */
  mastHeight: number;
  /** Rig type description key for display. */
  rigType: string;
  /** Tonnage for display. */
  tonnage: number;
  /** Draft in meters (how deep ship sits). */
  draft: number;
};

export const SHIP_PINNACE = shipClassId("pinnace");
export const SHIP_SLOOP = shipClassId("sloop");
export const SHIP_BARQUE = shipClassId("barque");
export const SHIP_BRIGANTINE = shipClassId("brigantine");
export const SHIP_FLUYT = shipClassId("fluyt");
export const SHIP_FRIGATE = shipClassId("frigate");
export const SHIP_FAST_GALLEON = shipClassId("fast_galleon");
export const SHIP_GALLEON = shipClassId("galleon");
export const SHIP_MERCHANTMAN = shipClassId("merchantman");

export const SHIP_CLASSES: Record<string, ShipClassDef> = {
  pinnace: {
    id: SHIP_PINNACE,
    name: "Pinnace",
    nameKey: "ship.pinnace",
    speedBase: 0.167,      // 8 kn max
    turnRate: 0.84,
    hullMax: 30,
    sailsMax: 30,
    cannons: 4,
    cargoCap: 20,
    crewMax: 15,
    crewMin: 4,
    buyPrice: 200,
    sprite: "ship_sloop",  // shared sprite for now
    minWindAngle: 30,      // fore-and-aft — best upwind
    mastHeight: 10,
    rigType: "Fore-and-aft",
    tonnage: 30,
    draft: 1.0,
  },
  sloop: {
    id: SHIP_SLOOP,
    name: "Sloop",
    nameKey: "ship.sloop",
    speedBase: 0.208,      // 10 kn max
    turnRate: 0.72,
    hullMax: 60,
    sailsMax: 50,
    cannons: 8,
    cargoCap: 40,
    crewMax: 30,
    crewMin: 8,
    buyPrice: 500,
    sprite: "ship_sloop",
    minWindAngle: 35,      // fore-and-aft — sails close to wind
    mastHeight: 15,
    rigType: "Fore-and-aft",
    tonnage: 50,
    draft: 1.5,
  },
  barque: {
    id: SHIP_BARQUE,
    name: "Barque",
    nameKey: "ship.barque",
    speedBase: 0.188,      // 9 kn max
    turnRate: 0.54,
    hullMax: 70,
    sailsMax: 60,
    cannons: 12,
    cargoCap: 80,
    crewMax: 40,
    crewMin: 12,
    buyPrice: 800,
    sprite: "ship_sloop",  // shared sprite for now
    minWindAngle: 45,      // mixed rig
    mastHeight: 20,
    rigType: "Mixed",
    tonnage: 100,
    draft: 2.0,
  },
  brigantine: {
    id: SHIP_BRIGANTINE,
    name: "Brigantine",
    nameKey: "ship.brigantine",
    speedBase: 0.229,      // 11 kn max
    turnRate: 0.60,
    hullMax: 80,
    sailsMax: 70,
    cannons: 16,
    cargoCap: 60,
    crewMax: 50,
    crewMin: 15,
    buyPrice: 1200,
    sprite: "ship_brigantine",
    minWindAngle: 40,      // mixed rig — decent upwind
    mastHeight: 22,
    rigType: "Mixed",
    tonnage: 120,
    draft: 2.5,
  },
  fluyt: {
    id: SHIP_FLUYT,
    name: "Fluyt",
    nameKey: "ship.fluyt",
    speedBase: 0.125,      // 6 kn max
    turnRate: 0.42,
    hullMax: 90,
    sailsMax: 70,
    cannons: 12,
    cargoCap: 180,
    crewMax: 40,
    crewMin: 15,
    buyPrice: 1500,
    sprite: "ship_merchantman",  // shared sprite for now
    minWindAngle: 55,      // square rig, cargo focus
    mastHeight: 22,
    rigType: "Square",
    tonnage: 200,
    draft: 4.0,
  },
  frigate: {
    id: SHIP_FRIGATE,
    name: "Frigate",
    nameKey: "ship.frigate",
    speedBase: 0.250,      // 12 kn max (BENCHMARK)
    turnRate: 0.48,
    hullMax: 120,
    sailsMax: 90,
    cannons: 28,
    cargoCap: 80,
    crewMax: 80,
    crewMin: 25,
    buyPrice: 3000,
    sprite: "ship_frigate",
    minWindAngle: 50,      // square rig — poor upwind
    mastHeight: 30,
    rigType: "Square",
    tonnage: 300,
    draft: 4.0,
  },
  fast_galleon: {
    id: SHIP_FAST_GALLEON,
    name: "Fast Galleon",
    nameKey: "ship.fast_galleon",
    speedBase: 0.188,      // 9 kn max
    turnRate: 0.36,
    hullMax: 150,
    sailsMax: 100,
    cannons: 24,
    cargoCap: 100,
    crewMax: 100,
    crewMin: 30,
    buyPrice: 4500,
    sprite: "ship_galleon",  // shared sprite for now
    minWindAngle: 55,      // square rig
    mastHeight: 32,
    rigType: "Square",
    tonnage: 400,
    draft: 4.5,
  },
  galleon: {
    id: SHIP_GALLEON,
    name: "Galleon",
    nameKey: "ship.galleon",
    speedBase: 0.167,      // 8 kn max
    turnRate: 0.30,
    hullMax: 180,
    sailsMax: 120,
    cannons: 36,
    cargoCap: 150,
    crewMax: 120,
    crewMin: 40,
    buyPrice: 6000,
    sprite: "ship_galleon",
    minWindAngle: 60,      // heavy square rig — worst upwind
    mastHeight: 35,
    rigType: "Square",
    tonnage: 500,
    draft: 5.5,
  },
  merchantman: {
    id: SHIP_MERCHANTMAN,
    name: "Merchantman",
    nameKey: "ship.merchantman",
    speedBase: 0.104,      // 5 kn max
    turnRate: 0.24,
    hullMax: 100,
    sailsMax: 80,
    cannons: 12,
    cargoCap: 250,
    crewMax: 60,
    crewMin: 20,
    buyPrice: 2000,
    sprite: "ship_merchantman",
    minWindAngle: 60,      // square rig, heavy cargo
    mastHeight: 25,
    rigType: "Square",
    tonnage: 400,
    draft: 5.0,
  },
};
