import { factionId } from "../model/ids.ts";
import type { FactionId } from "../model/ids.ts";

export type FactionDef = {
  id: FactionId;
  name: string;
  color: number; // hex color for UI
  defaultReputation: number; // starting rep for new game
  relations: Record<string, number>; // factionId -> relation (-100..100)
};

export const FACTION_SPAIN = factionId("spain");
export const FACTION_ENGLAND = factionId("england");
export const FACTION_FRANCE = factionId("france");
export const FACTION_NETHERLANDS = factionId("netherlands");
export const FACTION_PIRATES = factionId("pirates");

export const FACTIONS: Record<string, FactionDef> = {
  spain: {
    id: FACTION_SPAIN,
    name: "Spain",
    color: 0xcc0000,
    defaultReputation: 0,
    relations: {
      england: -30,
      france: -20,
      netherlands: -10,
      pirates: -80,
    },
  },
  england: {
    id: FACTION_ENGLAND,
    name: "England",
    color: 0x0044cc,
    defaultReputation: 0,
    relations: {
      spain: -30,
      france: -10,
      netherlands: 10,
      pirates: -60,
    },
  },
  france: {
    id: FACTION_FRANCE,
    name: "France",
    color: 0x2244aa,
    defaultReputation: 0,
    relations: {
      spain: -20,
      england: -10,
      netherlands: 0,
      pirates: -50,
    },
  },
  netherlands: {
    id: FACTION_NETHERLANDS,
    name: "Netherlands",
    color: 0xff8800,
    defaultReputation: 0,
    relations: {
      spain: -10,
      england: 10,
      france: 0,
      pirates: -40,
    },
  },
  pirates: {
    id: FACTION_PIRATES,
    name: "Pirates",
    color: 0x333333,
    defaultReputation: -20,
    relations: {
      spain: -80,
      england: -60,
      france: -50,
      netherlands: -40,
    },
  },
};
