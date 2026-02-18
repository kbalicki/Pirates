/**
 * Caribbean landmass polygon definitions for map rendering and collision.
 *
 * Each landmass is defined as an array of Vec2 points forming a closed polygon.
 * Coordinates use the same system as cities.ts:
 *   x = (98 - lon) / 40 * 3200
 *   y = (30 - lat) / 23 * 2400
 *
 * Continental coastlines extend polygons to map edge boundaries (0 or 3200/2400).
 */

import type { Vec2 } from "../model/WorldState.ts";

export type LandmassDef = {
  id: string;
  polygon: Vec2[];
};

function g(lon: number, lat: number): Vec2 {
  return {
    x: Math.round((98 - lon) / 40 * 3200),
    y: Math.round((30 - lat) / 23 * 2400),
  };
}

export const LANDMASSES: LandmassDef[] = [
  // ===== CUBA =====
  // Widened at Puerto Principe area (lon ~77.9, lat ~21.4)
  {
    id: "cuba",
    polygon: [
      g(84.9, 21.9), g(84.3, 22.7), g(83.5, 23.1), g(82.4, 23.2),
      g(81.5, 23.1), g(80.5, 22.8), g(79.8, 22.4), g(79.0, 22.0),
      g(78.0, 21.7), g(77.5, 21.0), g(76.2, 20.2), g(75.0, 20.0),
      g(74.1, 20.2), g(74.1, 19.9), g(75.0, 19.7), g(76.2, 19.9),
      g(77.0, 20.3), g(78.5, 21.2), g(79.8, 21.8), g(81.0, 22.2),
      g(82.0, 22.5), g(83.2, 22.5), g(84.0, 22.2), g(84.8, 21.6),
    ],
  },

  // ===== HISPANIOLA =====
  // Extended north coast for Port de Paix, south coast for Petit Goave/Leogane
  {
    id: "hispaniola",
    polygon: [
      g(74.4, 19.9), g(73.6, 20.1), g(72.6, 20.1), g(72.3, 19.5),
      g(71.7, 19.8), g(71.0, 19.7), g(70.0, 19.8), g(69.5, 19.6),
      g(68.4, 18.6), g(68.3, 18.2), g(69.0, 18.2), g(69.9, 18.5),
      g(70.5, 18.3), g(71.0, 18.2), g(71.6, 18.3), g(72.0, 18.4),
      g(72.8, 18.4), g(73.4, 18.2), g(73.7, 18.5), g(74.4, 19.4),
    ],
  },

  // ===== TORTUGA =====
  // Small island off northern Hispaniola
  {
    id: "tortuga_island",
    polygon: [
      g(73.1, 20.2), g(72.6, 20.2), g(72.4, 20.0), g(72.6, 19.9),
      g(73.0, 19.9), g(73.1, 20.1),
    ],
  },

  // ===== JAMAICA =====
  {
    id: "jamaica",
    polygon: [
      g(78.4, 18.5), g(77.8, 18.5), g(77.0, 18.3), g(76.3, 18.0),
      g(76.2, 17.8), g(76.8, 17.7), g(77.5, 17.8), g(78.0, 18.0),
      g(78.4, 18.2),
    ],
  },

  // ===== PUERTO RICO =====
  // Extended north for San Juan
  {
    id: "puerto_rico",
    polygon: [
      g(67.2, 18.7), g(66.5, 18.7), g(65.8, 18.3), g(65.6, 18.0),
      g(66.0, 17.9), g(66.8, 17.9), g(67.2, 18.2),
    ],
  },

  // ===== FLORIDA (southern tip, extends to map top) =====
  {
    id: "florida",
    polygon: [
      g(82.0, 30.0), g(80.2, 30.0), g(80.0, 28.0), g(80.2, 26.5),
      g(80.5, 25.8), g(81.0, 25.3), g(81.8, 24.6), g(82.8, 24.8),
      g(83.0, 25.3), g(82.0, 26.0), g(81.5, 27.0), g(81.5, 28.0),
    ],
  },

  // ===== YUCATAN PENINSULA =====
  // Extended west coast for Campeche (lon ~90.5, lat ~19.8)
  {
    id: "yucatan",
    polygon: [
      g(92.0, 18.5), g(91.5, 18.0), g(90.5, 17.8), g(89.2, 17.8),
      g(88.0, 17.9), g(87.5, 18.3), g(87.0, 18.5), g(86.8, 19.0),
      g(86.8, 20.0), g(87.0, 21.0), g(87.5, 21.5), g(89.0, 21.6),
      g(90.5, 21.3), g(91.0, 20.5), g(91.0, 20.0), g(91.5, 19.0),
    ],
  },

  // ===== CENTRAL AMERICA COAST (Belize to Panama) =====
  // Extended north for Vera Cruz, east for Belize, wider Panama coast
  {
    id: "central_america",
    polygon: [
      g(98.0, 19.5), g(96.5, 19.5), g(95.5, 19.0),
      g(92.0, 18.5), g(91.5, 18.0), g(90.5, 17.8),
      g(89.2, 17.2), g(88.0, 17.7), g(87.8, 16.0),
      g(87.5, 14.0), g(87.0, 13.5),
      g(86.2, 12.5), g(84.8, 12.3), g(84.5, 11.2), g(83.8, 10.5),
      g(83.0, 9.5), g(82.5, 9.0), g(81.5, 8.5), g(80.5, 8.2),
      g(79.8, 8.5), g(79.3, 9.3), g(79.5, 9.8), g(80.0, 9.8),
      g(80.5, 9.5), g(81.5, 9.2), g(82.5, 9.5),
      g(83.5, 10.2), g(84.5, 10.8), g(85.5, 11.5),
      g(86.5, 12.8), g(87.5, 13.5), g(88.0, 14.5),
      g(88.5, 15.5), g(89.0, 16.5), g(89.5, 17.0),
      g(98.0, 17.0),
    ],
  },

  // ===== SOUTH AMERICA COAST (Venezuela/Colombia) =====
  // Northern coast pushed north to include coastal cities
  {
    id: "south_america",
    polygon: [
      g(79.8, 9.8), g(79.3, 9.3), g(78.5, 8.5), g(77.5, 8.0),
      g(76.5, 7.5), g(75.5, 7.8), g(75.0, 8.5), g(75.5, 10.0),
      g(75.5, 10.4), g(74.5, 11.4), g(73.5, 11.5), g(73.0, 11.7),
      g(72.5, 11.5), g(72.0, 11.2), g(71.5, 10.8), g(71.0, 10.5),
      g(70.5, 10.7), g(70.0, 10.5), g(69.0, 10.2),
      g(68.2, 10.7), g(67.2, 10.7), g(66.0, 10.7),
      g(65.0, 10.2), g(64.5, 10.6), g(63.0, 10.2),
      g(62.0, 10.4), g(61.0, 10.0), g(60.5, 10.2), g(60.0, 9.5),
      g(58.0, 8.0), g(58.0, 7.0),
      g(60.0, 7.0), g(62.0, 7.0), g(64.0, 7.0), g(66.0, 7.0),
      g(68.0, 7.0), g(70.0, 7.0), g(72.0, 7.0), g(74.0, 7.0),
      g(76.0, 7.0), g(78.0, 7.0), g(80.0, 7.0),
    ],
  },

  // ===== BAHAMAS (selected islands) =====
  // New Providence / Andros area — extended east for Nassau
  {
    id: "bahamas_andros",
    polygon: [
      g(78.5, 25.2), g(77.0, 25.2), g(77.0, 24.6), g(77.5, 24.0),
      g(77.8, 23.8), g(78.2, 24.0), g(78.5, 24.8),
    ],
  },
  // Great Bahama Bank / Eleuthera area — extended east
  {
    id: "bahamas_eleuthera",
    polygon: [
      g(77.0, 25.5), g(76.0, 25.2), g(75.8, 24.8), g(76.0, 24.5),
      g(76.5, 24.5), g(76.8, 25.0), g(77.0, 25.3),
    ],
  },
  // Grand Bahama
  {
    id: "bahamas_grand",
    polygon: [
      g(79.0, 26.8), g(78.5, 26.7), g(78.0, 26.5), g(78.2, 26.3),
      g(78.7, 26.4), g(79.0, 26.6),
    ],
  },

  // ===== LESSER ANTILLES (selected islands) =====
  // Guadeloupe — expanded
  {
    id: "guadeloupe",
    polygon: [
      g(62.0, 16.6), g(61.6, 16.5), g(61.2, 16.1), g(61.0, 15.9),
      g(61.2, 15.8), g(61.5, 16.0), g(61.8, 16.2), g(62.0, 16.4),
    ],
  },
  // Dominica
  {
    id: "dominica",
    polygon: [
      g(61.5, 15.6), g(61.3, 15.4), g(61.2, 15.2), g(61.4, 15.2),
      g(61.5, 15.4),
    ],
  },
  // Martinique
  {
    id: "martinique_island",
    polygon: [
      g(61.2, 14.9), g(61.0, 14.7), g(60.9, 14.4), g(61.0, 14.4),
      g(61.2, 14.6),
    ],
  },
  // St. Lucia
  {
    id: "st_lucia",
    polygon: [
      g(61.1, 14.1), g(60.9, 13.9), g(60.9, 13.7), g(61.0, 13.7),
      g(61.1, 13.9),
    ],
  },
  // Barbados
  {
    id: "barbados_island",
    polygon: [
      g(59.7, 13.3), g(59.5, 13.1), g(59.5, 12.9), g(59.7, 13.0),
    ],
  },
  // Grenada
  {
    id: "grenada",
    polygon: [
      g(61.8, 12.2), g(61.6, 12.0), g(61.6, 11.8), g(61.8, 12.0),
    ],
  },
  // Antigua — expanded
  {
    id: "antigua_island",
    polygon: [
      g(62.1, 17.3), g(61.7, 17.1), g(61.6, 16.9), g(61.8, 16.9),
      g(62.1, 17.1),
    ],
  },
  // St. Kitts & Nevis — expanded to include both islands
  {
    id: "st_kitts_island",
    polygon: [
      g(62.9, 17.5), g(62.4, 17.3), g(62.4, 17.0), g(62.6, 16.9),
      g(62.9, 17.1), g(62.9, 17.3),
    ],
  },
  // St. Eustatius — new
  {
    id: "st_eustatius_island",
    polygon: [
      g(63.1, 17.6), g(62.8, 17.5), g(62.7, 17.3), g(62.9, 17.3),
      g(63.1, 17.5),
    ],
  },
  // St. Martin — new
  {
    id: "st_martin_island",
    polygon: [
      g(63.3, 18.3), g(63.0, 18.2), g(62.9, 18.0), g(63.1, 17.9),
      g(63.3, 18.1),
    ],
  },

  // ===== TRINIDAD =====
  {
    id: "trinidad_island",
    polygon: [
      g(61.9, 10.8), g(61.5, 10.7), g(61.0, 10.3), g(60.9, 10.1),
      g(61.3, 10.1), g(61.7, 10.3), g(61.9, 10.6),
    ],
  },

  // ===== CURAÇAO =====
  {
    id: "curacao_island",
    polygon: [
      g(69.2, 12.4), g(68.8, 12.2), g(68.7, 12.0), g(69.0, 12.0),
      g(69.2, 12.2),
    ],
  },

  // ===== BERMUDA =====
  {
    id: "bermuda_island",
    polygon: [
      g(65.0, 29.7), g(64.7, 29.5), g(64.5, 29.3), g(64.7, 29.2),
      g(65.0, 29.4),
    ],
  },

  // ===== MARGARITA =====
  {
    id: "margarita_island",
    polygon: [
      g(64.2, 11.2), g(63.8, 11.1), g(63.6, 10.9), g(63.8, 10.8),
      g(64.1, 10.9), g(64.2, 11.1),
    ],
  },

  // ===== SANTA CATALINA (Old Providence) =====
  {
    id: "santa_catalina_island",
    polygon: [
      g(81.6, 13.6), g(81.3, 13.5), g(81.2, 13.3), g(81.4, 13.2),
      g(81.6, 13.4),
    ],
  },

  // ===== MONTSERRAT =====
  {
    id: "montserrat_island",
    polygon: [
      g(62.4, 16.8), g(62.1, 16.7), g(62.1, 16.5), g(62.3, 16.5),
      g(62.4, 16.7),
    ],
  },
];
