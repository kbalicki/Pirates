import type { FactionId } from "../model/ids.ts";
import { factionId } from "../model/ids.ts";

export type ZoneKind = "piracy" | "patrol" | "trade_wind" | "storm_prone";

export type MapZoneDef = {
  zoneId: string;
  kind: ZoneKind;
  risk: number; // 0..1
  rect: { x: number; y: number; w: number; h: number }; // world units
  windDirBias?: number;
  windStrengthBias?: number;
  factionId?: FactionId;
};

/**
 * Zone rectangles updated for real Caribbean map (3200×2400).
 *
 * Coordinate reference (approx):
 *   Havana ~(1248, 720)   Cuba area
 *   Port Royal ~(1696, 1264)  Jamaica
 *   Nassau ~(1656, 522)   Bahamas
 *   Cartagena ~(1800, 2043)  South America coast
 *   Lesser Antilles ~(2800-3100, 1300-1800)
 *   Vera Cruz ~(152, 1126)  Gulf of Mexico west
 */
export const MAP_ZONES: MapZoneDef[] = [
  // Windward Passage — between Cuba and Hispaniola, classic piracy hotspot
  {
    zoneId: "windward_passage",
    kind: "piracy",
    risk: 0.6,
    rect: { x: 1600, y: 800, w: 500, h: 400 },
  },
  // Spanish Main — waters off the northern coast of South America
  {
    zoneId: "spanish_main",
    kind: "patrol",
    risk: 0.3,
    rect: { x: 1400, y: 1700, w: 1200, h: 600 },
    factionId: factionId("spain"),
  },
  // Trade winds belt — broad east-west band across the Caribbean
  {
    zoneId: "trade_winds_north",
    kind: "trade_wind",
    risk: 0.1,
    rect: { x: 400, y: 400, w: 2400, h: 500 },
    windDirBias: Math.PI * 0.75,
    windStrengthBias: 0.7,
  },
  // Hurricane alley — eastern Caribbean, Lesser Antilles approach
  {
    zoneId: "hurricane_alley",
    kind: "storm_prone",
    risk: 0.4,
    rect: { x: 2600, y: 1000, w: 600, h: 800 },
  },
  // Straits of Florida — busy shipping lane, Spanish patrols
  {
    zoneId: "straits_of_florida",
    kind: "patrol",
    risk: 0.25,
    rect: { x: 1100, y: 300, w: 600, h: 400 },
    factionId: factionId("spain"),
  },
  // Gulf of Mexico — western area near Vera Cruz and Campeche
  {
    zoneId: "gulf_of_mexico",
    kind: "trade_wind",
    risk: 0.15,
    rect: { x: 0, y: 400, w: 600, h: 800 },
    windDirBias: Math.PI * 0.5,
    windStrengthBias: 0.5,
  },
];
