import { shipClassId } from "../model/ids.ts";
import type { ShipClassId } from "../model/ids.ts";

export type ShipClassDef = {
  id: ShipClassId;
  name: string;
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
};

export const SHIP_SLOOP = shipClassId("sloop");
export const SHIP_BRIGANTINE = shipClassId("brigantine");
export const SHIP_FRIGATE = shipClassId("frigate");
export const SHIP_GALLEON = shipClassId("galleon");
export const SHIP_MERCHANTMAN = shipClassId("merchantman");

export const SHIP_CLASSES: Record<string, ShipClassDef> = {
  sloop: {
    id: SHIP_SLOOP,
    name: "Sloop",
    speedBase: 0.6,
    turnRate: 0.24,
    hullMax: 60,
    sailsMax: 50,
    cannons: 8,
    cargoCap: 40,
    crewMax: 30,
    crewMin: 8,
    buyPrice: 500,
    sprite: "ship_sloop",
  },
  brigantine: {
    id: SHIP_BRIGANTINE,
    name: "Brigantine",
    speedBase: 0.55,
    turnRate: 0.20,
    hullMax: 80,
    sailsMax: 70,
    cannons: 16,
    cargoCap: 60,
    crewMax: 50,
    crewMin: 15,
    buyPrice: 1200,
    sprite: "ship_brigantine",
  },
  frigate: {
    id: SHIP_FRIGATE,
    name: "Frigate",
    speedBase: 0.5,
    turnRate: 0.16,
    hullMax: 120,
    sailsMax: 90,
    cannons: 28,
    cargoCap: 80,
    crewMax: 80,
    crewMin: 25,
    buyPrice: 3000,
    sprite: "ship_frigate",
  },
  galleon: {
    id: SHIP_GALLEON,
    name: "Galleon",
    speedBase: 0.38,
    turnRate: 0.10,
    hullMax: 180,
    sailsMax: 120,
    cannons: 36,
    cargoCap: 150,
    crewMax: 120,
    crewMin: 40,
    buyPrice: 6000,
    sprite: "ship_galleon",
  },
  merchantman: {
    id: SHIP_MERCHANTMAN,
    name: "Merchantman",
    speedBase: 0.32,
    turnRate: 0.12,
    hullMax: 100,
    sailsMax: 80,
    cannons: 12,
    cargoCap: 200,
    crewMax: 60,
    crewMin: 20,
    buyPrice: 2000,
    sprite: "ship_merchantman",
  },
};
