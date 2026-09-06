import type { Vec2 } from "../model/WorldState.ts";

/**
 * The Caribbean's currents, as the one thing on this map that never stops.
 *
 * This is not decoration and it is not a hazard. It is the reason these waters
 * have a *direction*: the sea comes in past the Lesser Antilles, runs west along
 * the Spanish Main, turns north through the Yucatán Channel, loops through the
 * Gulf, and pours out between Florida and Cuba at four knots. Every treasure
 * fleet that ever sailed home rode that last stretch, and every ship that
 * wanted to go the other way went round the outside of the islands instead.
 *
 * So a passage west along the Main is fast and the same passage east is a
 * grind; the Straits of Florida are a moving road north and a wall south. That
 * asymmetry is the feature, and it is the historical shape of the whole map.
 *
 * ## `flowsToward`, not "where it comes from"
 *
 * A wind is named for where it blows *from* — `WeatherState.windDirRad` is the
 * bearing a ship steers to be in irons. A current is named for where it takes
 * you. They are opposite conventions and mixing them would give a map that is
 * wrong by 180° everywhere and looks plausible, so the field is called
 * `flowsToward` and nothing here is called a direction.
 */
export type CurrentDef = {
  id: string;
  /** The band's core. World units. */
  rect: { x: number; y: number; w: number; h: number };
  /**
   * Compass heading the **water moves toward** (0 = N, clockwise), *not* where
   * it comes from. See the note above.
   */
  flowsToward: number;
  /** World units per tick at the core. A fast frigate makes 0.25. */
  strength: number;
  /** i18n key for the chart. */
  nameKey: string;
};

/** How far outside its rect a band still has any pull, in world units. */
export const CURRENT_FEATHER = 120;

const N = 0;
const NNE = Math.PI * 0.125;
const ENE = Math.PI * 0.375;
const E = Math.PI * 0.5;
const W = Math.PI * 1.5;
const WNW = Math.PI * 1.625;

/**
 * Strengths in world units per tick. One knot is about 0.021 here — the
 * benchmark frigate makes 0.25 at twelve knots — so these run from two knots on
 * the Main to four in the Straits, which is what they are.
 */
export const CURRENTS: CurrentDef[] = [
  {
    // In past Trinidad and west along the Spanish Main, under the lee of the
    // whole South American coast: Cumaná, Curaçao, Santa Marta, Cartagena.
    id: "caribbean",
    rect: { x: 1400, y: 1930, w: 1400, h: 230 },
    flowsToward: W,
    strength: 0.042,
    nameKey: "current.caribbean",
  },
  {
    // Turning up past the Mosquito Coast toward the Yucatán.
    id: "cayman",
    rect: { x: 950, y: 1750, w: 600, h: 400 },
    flowsToward: WNW,
    strength: 0.040,
    nameKey: "current.cayman",
  },
  {
    // North through the channel between Yucatán and the west end of Cuba.
    id: "yucatan",
    rect: { x: 880, y: 1100, w: 300, h: 660 },
    flowsToward: N,
    strength: 0.062,
    nameKey: "current.yucatan",
  },
  {
    // The loop across the southern Gulf, back toward Florida.
    id: "gulf_loop",
    rect: { x: 700, y: 850, w: 560, h: 320 },
    flowsToward: E,
    strength: 0.042,
    nameKey: "current.gulf_loop",
  },
  {
    // The Straits: between the Keys and Havana, and the strongest water on the
    // chart. Four knots against a sloop making six is most of the argument.
    id: "florida",
    rect: { x: 1240, y: 860, w: 420, h: 200 },
    flowsToward: ENE,
    strength: 0.083,
    nameKey: "current.florida",
  },
  {
    // And away north-east past the Bahamas — the road home to Europe.
    id: "gulf_stream",
    rect: { x: 1400, y: 350, w: 300, h: 560 },
    flowsToward: NNE,
    strength: 0.075,
    nameKey: "current.gulf_stream",
  },
];

/** Distance from a point to a rectangle, 0 inside it. */
export function distToRect(p: Vec2, r: { x: number; y: number; w: number; h: number }): number {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h));
  return Math.hypot(dx, dy);
}
