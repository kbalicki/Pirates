/**
 * Port/City type definition and data re-export.
 *
 * CityDef is the canonical type. PortDef is an alias for backwards compatibility.
 * CITIES is the canonical data source. PORTS is an alias for backwards compatibility.
 *
 * All existing imports of { PORTS, PortDef } from "./ports.ts" continue to work.
 */

import type { CityDef } from "./cities.ts";
import { CITIES } from "./cities.ts";

export type PortDef = CityDef;
export const PORTS: Record<string, PortDef> = CITIES;
