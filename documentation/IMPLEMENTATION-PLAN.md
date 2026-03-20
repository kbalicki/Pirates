# IMPLEMENTATION PLAN -- Pirates' Chronicles

## Comprehensive Task Plan for documentation/IMPLEMENTATION-PLAN.md

Below is the full document content.

---

# Pirates' Chronicles -- Implementation Plan

**Generated: 2026-03-19**
**Codebase version: v0.8.4.1 (commit 76c3556)**
**Architecture: Phaser 3 browser game, TypeScript, immutable state pattern**

---

## Architecture Overview

The game follows a strict core/render separation:

- **Core layer** (`src/core/`): Pure TypeScript, no Phaser dependency. Contains `WorldEngine` (game loop), `WorldState` (immutable state), systems (`NavigationSystem`, `NpcAiSystem`, `WeatherSystem`, etc.), data definitions (`ships.ts`, `cities.ts`, `factions.ts`, `wind.ts`), and services (`Geometry.ts`, `RNG.ts`).
- **Render layer** (`src/game/`): Phaser 3 scenes (`MainMapScene`, `UIOverlayScene`, `OptionsMenuScene`, `SeaBattleScene`, etc.), renderers (`WorldRenderer`, `CloudRenderer`, `CameraController`), input handling (`InputMapper`, `CommandQueue`).
- **State flow**: `InputMapper` produces `WorldCommand[]` into `CommandQueue`. `WorldEngine.apply()` takes commands + dtTicks, returns new `WorldState` + `WorldEvent[]` + `Transition[]`. Renderers read `WorldState` to sync visuals.
- **Map**: 3200x2400 pixels, Mercator projection, ~45 Caribbean cities, polygon-based landmasses from `caribbean_geo.json`.
- **Tick rate**: 20 ticks/second. `gameSpeed` multiplier scales effective delta (0.6/1.2/2.4).

---

## Task 1: Tune Cloud Speed to Match Map Scale and Wind Strength

### What
Clouds currently move too fast relative to the ship and map. The constant `CLOUD_BASE_SPEED = 0.6` in `CloudRenderer` needs to be reduced. The map is 3200x2400 px and a ship moves at ~2.5 units/tick max. Clouds should feel like a slow background layer, not racing across the screen.

### Files to Modify
- `c:/GIT/PiratesChronicles/src/game/render/CloudRenderer.ts` -- adjust `CLOUD_BASE_SPEED` and the speed calculation in `update()`

### Implementation Steps
1. In `CloudRenderer.ts`, reduce `CLOUD_BASE_SPEED` from `0.6` to approximately `0.08`--`0.12`. This is ~5-8x slower.
2. Optionally scale cloud speed by camera zoom so clouds feel natural at all zoom levels. In the `update()` method (line 62), the speed formula is: `const speed = CLOUD_BASE_SPEED * windStrength * cloud.speedMultiplier;`. Consider adding a zoom factor: `const zoomScale = 1 / Math.sqrt(this.scene.cameras.main.zoom);` and multiply speed by it.
3. Verify that at wind strength 1.0 (maximum), clouds still move at a visible but gentle pace -- roughly 1/10th of ship speed.
4. Consider adding a separate constant `CLOUD_SPEED_RANGE = [0.05, 0.15]` for more explicit tuning.

### Data Model Changes
None.

### Dependencies
None.

### Testing
- Run the game at different zoom levels (z1 through z14).
- Raise sails to full speed and observe cloud movement relative to ship.
- Clouds should drift lazily -- a cloud should take 30-60 seconds to cross the visible viewport at default zoom.
- Verify clouds still spawn and despawn correctly (no accumulation).

---

## Task 2: Fix Jerky Camera Follow

### What
The camera stutters when following the player ship. `CameraController.update()` uses `lerp(current, target, 0.08)` which can produce sub-pixel jitter. The issue is likely: (a) lerp factor too high causing oscillation at low speeds, (b) integer rounding of scrollX/scrollY, or (c) the camera update running at render framerate while game state updates at 20hz tick rate, creating mismatches.

### Files to Modify
- `c:/GIT/PiratesChronicles/src/game/render/CameraController.ts` -- improve lerp behavior
- `c:/GIT/PiratesChronicles/src/game/scenes/MainMapScene.ts` -- potentially pass delta time to camera

### Implementation Steps
1. In `CameraController.ts`, change the `update()` method to accept a `delta: number` parameter representing milliseconds since last frame.
2. Replace the fixed-rate lerp with a frame-rate-independent exponential smoothing:
   ```
   const factor = 1 - Math.pow(1 - CAMERA_LERP, delta / 16.67);
   ```
   This ensures smooth behavior regardless of frame rate.
3. Add a snap threshold: if the distance between current and target is less than 0.5 pixels, snap directly to target to prevent endless sub-pixel oscillation:
   ```
   if (Math.abs(cx - this.targetPos.x) < 0.5 && Math.abs(cy - this.targetPos.y) < 0.5) {
     this.camera.scrollX = this.targetPos.x - this.camera.width / 2;
     this.camera.scrollY = this.targetPos.y - this.camera.height / 2;
   }
   ```
4. In `MainMapScene.update()`, pass `delta` to `this.cameraCtrl.update(delta)` (line 1106).
5. Consider rounding final scrollX/scrollY to avoid sub-pixel rendering artifacts: `Math.round(cx - this.camera.width / 2)`.
6. Reduce `CAMERA_LERP` from `0.08` to `0.06` for smoother motion.

### Data Model Changes
None.

### Dependencies
None.

### Testing
- Sail at various speeds (sail level 0.34, 0.68, 1.0) and observe camera smoothness.
- Test at low frame rates (throttle in dev tools to 30fps) to confirm frame-rate independence.
- Zoom in and out while moving -- camera should not jump.
- Stop the ship -- camera should settle without micro-vibration.

---

## Task 3: Ship Sails in Bow Direction with Wind Physics

### What
Currently the ship moves in the direction of `entity.heading` with wind affecting speed via `windSpeedModifier()`. The task is to ensure: (a) the ship always moves in the direction its bow faces (already the case via `headingToVec(entity.heading)`), and (b) wind angle affects speed with a more realistic polar speed curve -- beating into wind should be very slow, beam reach fastest, running with wind slightly less fast than beam reach.

### Files to Modify
- `c:/GIT/PiratesChronicles/src/core/systems/WeatherSystem.ts` -- refine `windSpeedModifier()` for a more realistic polar curve
- `c:/GIT/PiratesChronicles/src/core/systems/NavigationSystem.ts` -- confirm heading-based movement (already correct)
- `c:/GIT/PiratesChronicles/src/core/data/ships.ts` -- optionally add per-class `sailProfile` data

### Implementation Steps
1. In `WeatherSystem.ts`, replace the current `windSpeedModifier()` (line 95-108) with a more realistic polar speed curve. The current formula `0.8 - 0.5 * Math.cos(windAngle)` gives: into-wind = 0.3, beam = 0.8, running = 1.3. A better curve should model:
   - **No-go zone** (0-30 degrees from wind): factor 0.1-0.2 (barely moving, "in irons")
   - **Close hauled** (30-60 degrees): factor 0.4-0.6
   - **Beam reach** (60-100 degrees): factor 1.0-1.2 (fastest point of sail)
   - **Broad reach** (100-150 degrees): factor 0.9-1.1
   - **Running** (150-180 degrees): factor 0.7-0.9 (slower due to turbulence behind sails)
2. Implement using a piecewise function or a lookup table with interpolation:
   ```typescript
   const POLAR_POINTS = [
     { angle: 0, factor: 0.1 },     // dead into wind
     { angle: 30, factor: 0.2 },    // no-go zone edge
     { angle: 45, factor: 0.5 },    // close hauled
     { angle: 70, factor: 1.0 },    // close reach
     { angle: 90, factor: 1.2 },    // beam reach (max)
     { angle: 120, factor: 1.1 },   // broad reach
     { angle: 150, factor: 0.9 },   // broad reach
     { angle: 180, factor: 0.75 },  // running
   ];
   ```
3. Optionally add `polarSpeedProfile` to `ShipClassDef` in `ships.ts` so different ship classes have different sailing characteristics (sloops better upwind, galleons better downwind).
4. The visual heading already matches movement direction via `headingToVec(entity.heading)` in `NavigationSystem.ts` line 41. No change needed there.

### Data Model Changes
- Optional: Add `polarProfile?: number[]` to `ShipClassDef` in `src/core/data/ships.ts`

### Dependencies
None. This change affects both player and NPC ships through the shared `windSpeedModifier()` call.

### Testing
- Sail directly into the wind: ship should barely move.
- Turn 90 degrees to the wind: speed should be maximum.
- Sail downwind: good speed but not maximum.
- Check NPC ships behave sensibly with the new curve.
- Verify no regression in embark/disembark grace period movement.

---

## Task 4: Wave Pixels Under Moving Ship (White/Blue Shimmer)

### What
Add a visual wake effect: small animated white/blue pixels around the ship hull when it is moving. This creates a sense of speed and water interaction.

### Files to Modify
- `c:/GIT/PiratesChronicles/src/game/render/WakeRenderer.ts` -- **new file**: manages per-entity wake particles
- `c:/GIT/PiratesChronicles/src/game/render/WorldRenderer.ts` -- integrate wake rendering in `sync()`
- `c:/GIT/PiratesChronicles/src/game/scenes/MainMapScene.ts` -- create and update WakeRenderer

### Implementation Steps
1. Create `WakeRenderer` class that maintains a pool of small graphics objects (1-2px circles or rectangles) per entity.
2. In `sync()`, for each ship entity that is sailing and has `vel` magnitude > 0.1:
   - Compute the stern position: `shipPos - headingVec * 5` (behind the ship).
   - Spawn 2-4 particles per frame at random offsets (+-3px) from stern position.
   - Each particle: white (0xffffff) or light blue (0xaaddff), alpha 0.5-0.8, lifetime 300-600ms.
   - Animate: drift backward (opposite heading), fade alpha to 0, slight scale increase.
3. Use Phaser's built-in particle emitter for performance: `scene.add.particles(x, y, 'wake_pixel', config)`. Generate a 2x2 white pixel texture at startup.
4. Scale particle emission rate with ship speed: more particles at full sail, fewer at slow speed.
5. For the player ship only initially (to limit performance impact). Can extend to visible NPC ships later.
6. Set particle depth to `entity.pos.y - 1` so they appear under the ship sprite.

### Data Model Changes
None (purely visual).

### Dependencies
None.

### Testing
- Sail at various speeds: particles should increase with speed.
- Stop the ship: particles should fade and stop spawning.
- Zoom in close: wake should be visible as distinct pixels.
- Performance: verify no frame drops with 30 NPC ships visible.

---

## Task 5: Controls Manual Tab in SPACE Menu

### What
Add a new tab to the `OptionsMenuScene` showing all keyboard controls. Currently tabs are: cabin, captain, calendar, options, save, map, settings. Add "controls" as a new tab.

### Files to Modify
- `c:/GIT/PiratesChronicles/src/game/scenes/OptionsMenuScene.ts` -- add "controls" tab
- `c:/GIT/PiratesChronicles/src/core/i18n/locales/en.ts` -- add translation keys
- `c:/GIT/PiratesChronicles/src/core/i18n/locales/pl.ts` -- add Polish translations

### Implementation Steps
1. In `OptionsMenuScene.ts`, add `"controls"` to the `TabId` type and the `ALL_TABS` array. Insert it after "settings" or before "settings" (UI design choice -- recommend after "map").
2. Add a new tab entry in the `tabs` array in `create()`:
   ```typescript
   { id: "controls", labelKey: "menu.tab_controls" }
   ```
3. Add the keyboard shortcut mapping (EIGHT key) in the keyboard bindings section.
4. Add `case "controls": this.renderControls(); break;` to the `switchTab()` method.
5. Implement `renderControls()` method that displays a formatted list:
   - **Sailing**: W/Up = Raise sails, S/Down = Lower sails, A/Left = Turn left, D/Right = Turn right
   - **On Land**: WASD/Arrows = Walk in direction
   - **General**: SPACE = Captain's Cabin menu, E = Interact/Embark, ESC = Pause, V = Toggle fog, G = Grid, L = Embark (from land)
   - **Mouse**: Left-click hold = Steer toward cursor, Scroll = Zoom
   - **Battle**: Q = Fire left cannons, E = Fire right cannons, ESC = Disengage
   - **Menu**: 1-7 = Switch tabs, Left/Right arrows = Previous/Next tab, PgUp/PgDn = Scroll
6. Add all translation keys to `en.ts` and `pl.ts`.

### Data Model Changes
None.

### Dependencies
None.

### Testing
- Open SPACE menu, navigate to the Controls tab.
- Verify all keyboard shortcuts listed match actual game behavior.
- Test keyboard navigation (number key, arrows) to reach the tab.
- Verify scrolling works if content exceeds the visible area.

---

## Task 6: NPC Ships -- Faction Flags Instead of Color Tint

### What
Currently NPC ships are tinted with their faction color (line 141-145 in `WorldRenderer.ts`). This makes ships look unnatural. Replace tint with a small flag sprite attached to the ship, similar to how cities have faction flags.

### Files to Modify
- `c:/GIT/PiratesChronicles/src/game/render/WorldRenderer.ts` -- remove tint, add flag sprite management
- `c:/GIT/PiratesChronicles/src/game/scenes/MainMapScene.ts` -- flag textures already generated in `generateFlagTextures()` (textures: `flag_england`, `flag_spain`, `flag_france`, `flag_netherlands`, `flag_pirates`)

### Implementation Steps
1. In `WorldRenderer.ts`, add a new `Map<string, Phaser.GameObjects.Image>` called `flagSprites` alongside `entitySprites`.
2. In the NPC section of `sync()` (around line 141), remove the `sprite.setTint(factionDef.color)` call.
3. Instead, for each NPC ship entity that has a `ship.factionId`:
   - If no flag sprite exists for this entity, create one: `scene.add.image(0, 0, "flag_" + factionKey)`.
   - Set flag scale to 0.4-0.5 (flags are 16x12 native).
   - Position the flag at an offset from the ship sprite: approximately (shipX + 4, shipY - 8) -- above and to the right of the mast.
   - Set flag depth to `entity.pos.y + entity.depthOffset + 0.1` (slightly above ship).
   - Match the flag's alpha to the ship's alpha (for fog-of-war fade).
4. When an NPC entity is removed, destroy its flag sprite in the cleanup loop.
5. Optionally add a slight waving animation (tween angle -3 to +3 degrees) similar to port flags.

### Data Model Changes
None.

### Dependencies
Flag textures already exist from `MainMapScene.generateFlagTextures()`.

### Testing
- Zoom in to see NPC ships: each should show a small flag matching its faction.
- Verify flag moves with the ship and fades with fog-of-war.
- Check performance with 30 NPC ships (each with a flag image).
- Confirm no leftover tint on ship sprites.

---

## Task 7: NPC Hostile Factions Cannot Sail Between Enemy Ports

### What
NPCs currently pick destination ports randomly (weighted by faction and population). A Spanish navy ship could pick an English port as its destination, which is unrealistic. Ships should only sail to ports where their faction is welcome, or at least not hostile.

### Files to Modify
- `c:/GIT/PiratesChronicles/src/core/systems/NpcAiSystem.ts` -- filter port targets by diplomacy
- `c:/GIT/PiratesChronicles/src/core/systems/NpcSpawnSystem.ts` -- filter destination port selection
- `c:/GIT/PiratesChronicles/src/core/data/factions.ts` -- use `relations` data (already defined)

### Implementation Steps
1. Create a helper function `canDockAt(shipFactionId: string, portFactionId: string): boolean` in a new utility or in `NpcAiSystem.ts`:
   ```typescript
   function canDockAt(shipFaction: string, portFaction: string): boolean {
     if (shipFaction === portFaction) return true;
     if (shipFaction === "pirates") return portFaction === "pirates"; // pirates only dock at pirate ports (Tortuga area)
     const rel = FACTIONS[shipFaction]?.relations[portFaction] ?? 0;
     return rel > -50; // threshold: hostile nations refuse entry
   }
   ```
2. In `NpcSpawnSystem.ts`, modify `pickDestinationPort()` (line 105-130) to add a filter: `if (key === originKey) continue;` already exists -- add `if (!canDockAt(factionId, port.factionId as string)) continue;`.
3. In `NpcAiSystem.ts`, apply the same filter when an NPC picks a new `targetPortId` in:
   - `updatePortToPort()` (line 93): filter `portKeys` to only friendly/neutral ports.
   - `updateNavy()` (line 152): already filters to own faction ports, but add the diplomacy check as fallback.
4. For pirate behavior, keep the current logic (pirates lurk near wealthy ports regardless of faction).

### Data Model Changes
None (uses existing `FACTIONS[key].relations`).

### Dependencies
None.

### Testing
- Observe NPC ships: Spanish navy should only sail to Spanish ports.
- English traders can visit English and Dutch ports (relations +10) but not Spanish ports (relations -30 is above -50, so borderline -- verify threshold).
- Adjust threshold if needed based on playtesting.
- Pirates should still patrol near any wealthy port.

---

## Task 8: NPC Metadata -- Ship Type, Faction, Crew, Cannons, Origin/Destination

### What
Enrich NPC entities with meaningful metadata so they can be inspected and used for future encounter/battle systems. NPC entities already have `ship.classId`, `ship.factionId`, `ship.crew`, `ship.cannons`, and `ai.targetPortId`. This task is about adding `originPortId` and ensuring all fields are properly set.

### Files to Modify
- `c:/GIT/PiratesChronicles/src/core/model/EntityState.ts` -- add `originPortId` to `AiData`
- `c:/GIT/PiratesChronicles/src/core/systems/NpcSpawnSystem.ts` -- set `originPortId` on spawn
- `c:/GIT/PiratesChronicles/src/core/systems/NpcAiSystem.ts` -- preserve origin through AI updates

### Implementation Steps
1. In `EntityState.ts`, add `originPortId?: PortId` to the `AiData` type (line 22-28).
2. In `NpcSpawnSystem.ts`, when building `npcEntity` (line 269-303), add `originPortId: portKey as unknown as PortId` to the `ai` object.
3. Ensure crew count varies by behavior: traders at 60-80% crew, navy at 80-100%, pirates at 70-90%.
4. Optionally add a `name` field to `AiData` for ship naming (e.g., "HMS Victory", "Santa Maria") -- generate procedurally from faction + ship class.
5. Add `cargoValue?: number` to `AiData` for future encounter reward calculation. Set based on origin/destination trade goods.

### Data Model Changes
- Add to `AiData` in `c:/GIT/PiratesChronicles/src/core/model/EntityState.ts`:
  ```typescript
  originPortId?: PortId;
  shipName?: string;
  cargoValue?: number;
  ```

### Dependencies
None.

### Testing
- Inspect NPC entity data in browser devtools (`worldState.entities`).
- Verify all NPC ships have valid `originPortId` and `targetPortId`.
- Confirm crew/cannons match the ship class definition.

---

## Task 9: Smooth Coastlines at Max Zoom

### What
At high zoom levels (z10+), the polygon-based coastlines look angular/jagged. Apply curve subdivision (Chaikin or Catmull-Rom) to smooth the visual coastline rendering without changing collision polygons.

### Files to Modify
- `c:/GIT/PiratesChronicles/src/game/scenes/MainMapScene.ts` -- modify `createTilemap()` to use subdivided polygons for rendering
- `c:/GIT/PiratesChronicles/src/core/services/Geometry.ts` -- add Chaikin/Catmull-Rom subdivision utility

### Implementation Steps
1. In `Geometry.ts`, add a `chaikinSubdivide(polygon: Vec2[], iterations: number): Vec2[]` function:
   ```typescript
   export function chaikinSubdivide(polygon: Vec2[], iterations: number = 2): Vec2[] {
     let pts = polygon;
     for (let iter = 0; iter < iterations; iter++) {
       const result: Vec2[] = [];
       for (let i = 0; i < pts.length; i++) {
         const p0 = pts[i];
         const p1 = pts[(i + 1) % pts.length];
         result.push({ x: 0.75 * p0.x + 0.25 * p1.x, y: 0.75 * p0.y + 0.25 * p1.y });
         result.push({ x: 0.25 * p0.x + 0.75 * p1.x, y: 0.25 * p0.y + 0.75 * p1.y });
       }
       pts = result;
     }
     return pts;
   }
   ```
2. In `MainMapScene.createTilemap()` (line 257-278), when drawing landmass polygons for rendering, use `chaikinSubdivide(lm.polygon, 2)` instead of `lm.polygon` directly. Apply this ONLY for the visual fill and coastline stroke, NOT for the collision `landGrid`.
3. Use 2 iterations of Chaikin subdivision. This quadruples vertex count per iteration (so 2 iterations = 16x vertices), which is fine for rendering but not for collision.
4. Keep the `landGrid` and `terrainQuery` using the original unsubdivided polygons from `LANDMASSES` for exact collision.

### Data Model Changes
None.

### Dependencies
None.

### Testing
- Zoom to maximum (z14) and inspect coastlines. Should appear smooth and curved.
- Verify collision still works correctly (ship hitting land at expected points).
- Check rendering performance -- each landmass will have 16x more vertices. If there are 200+ landmasses, ensure no frame drop.
- Compare minimap (in SPACE menu map tab) -- it uses original polygons, should remain unchanged.

---

## Task 10: City Forts System -- 0-3 Forts per City, Logic + Visual

### What
Each city can have 0-3 fort structures that affect defense, trade safety, and visual appearance. Larger cities with forts should be harder to attack and provide safer trade.

### Files to Modify
- `c:/GIT/PiratesChronicles/src/core/data/cities.ts` -- add `forts: number` (0-3) to `CityDef`
- `c:/GIT/PiratesChronicles/src/core/model/WorldState.ts` -- add `forts` to `PortRuntimeState` (dynamic, can change)
- `c:/GIT/PiratesChronicles/src/game/scenes/MainMapScene.ts` -- render fort icons near cities based on fort count
- `c:/GIT/PiratesChronicles/src/core/systems/NpcSpawnSystem.ts` -- cities with more forts spawn more navy ships

### Implementation Steps
1. Add `forts: number` to `CityDef` in `cities.ts`. Set default values based on city type:
   - `type: "fort"` cities: 2-3 forts (they ARE forts)
   - `population: "capital"/"large"` cities: 1-2 forts
   - `population: "medium"` cities: 0-1 forts
   - `population: "small"` and `type: "outpost"`: 0 forts
2. Add `forts: number` to `PortRuntimeState` in `WorldState.ts`. Initialize from `CityDef.forts` at game start. This allows forts to be built/destroyed during gameplay.
3. In `MainMapScene.drawPortMarkers()`, for each port with `forts > 0`, draw small fort icons (reuse the `drawFort` method at smaller scale) at offsets around the city. Position 1 fort to the right, 2nd to the left, 3rd behind.
4. In `NpcSpawnSystem.ts`, modify `POP_SHIP_WEIGHT` to factor in forts: a city with 3 forts spawns more navy ships. Modify `pickBehavior()` to increase navy probability for high-fort cities.
5. For future: forts affect port attack difficulty (Task 21), cannon range during port battle, and pirate approach risk.

### Data Model Changes
- Add `forts: number` to `CityDef` in `c:/GIT/PiratesChronicles/src/core/data/cities.ts`
- Add `forts: number` to `PortRuntimeState` in `c:/GIT/PiratesChronicles/src/core/model/WorldState.ts`

### Dependencies
None (visual only for now; combat system in Task 20 uses this data).

### Testing
- Verify fort icons appear near cities that have forts defined.
- Check that fort cities spawn more navy ships.
- Verify save/load preserves fort count in `PortRuntimeState`.

---

## Task 11: NPC Coast Avoidance Except Target Port

### What
NPCs should avoid sailing close to land EXCEPT when approaching their target port. Currently, coast avoidance triggers universally. When an NPC hits land, `findOpenSeaHeading()` redirects it away, but this often prevents NPCs from reaching their destination port if it requires sailing through a narrow channel.

### Files to Modify
- `c:/GIT/PiratesChronicles/src/core/engine/WorldEngine.ts` -- modify NPC coast avoidance logic (lines 170-226)
- `c:/GIT/PiratesChronicles/src/core/systems/NpcAiSystem.ts` -- provide port proximity info

### Implementation Steps
1. In `WorldEngine.ts`, in the NPC navigation loop (line 171-226), before applying coast avoidance, check if the NPC is within `DOCK_RADIUS * 2` (110 units) of its target port water position. If so, skip the coast avoidance redirect and allow normal `updateNavigation()` to handle movement.
2. Add a helper function:
   ```typescript
   function isNearTargetPort(entity: EntityState): boolean {
     if (!entity.ai?.targetPortId) return false;
     const waterPos = getPortWaterPos(entity.ai.targetPortId as string);
     const dx = entity.pos.x - waterPos.x;
     const dy = entity.pos.y - waterPos.y;
     return Math.sqrt(dx * dx + dy * dy) < 110;
   }
   ```
3. In the coast avoidance section (line 178), add: `if (isNearTargetPort(entity)) continue;` to skip the coast avoidance cooldown handling when near the target port.
4. Similarly, in the land collision detection (line 213), when an NPC hits land and is near its target port, instead of redirecting to open sea, either let it dock (if within dock radius) or reduce the avoidance aggressiveness (try only small heading corrections of 15-30 degrees instead of full `findOpenSeaHeading`).
5. Import `getPortWaterPos` from `PortWaterPositions.ts` in `WorldEngine.ts`.

### Data Model Changes
None.

### Dependencies
None.

### Testing
- Observe NPC ships approaching ports through narrow channels (e.g., Port-de-Paix near Tortuga).
- NPCs should successfully dock at their target port without being deflected.
- NPCs not near a target port should still avoid coastlines normally.
- Verify no NPC ships get stuck in infinite coast-avoidance loops.

---

## Task 12: NPC Wind Physics (Slower Upwind, Tacking)

### What
Apply the same wind speed modifier to NPC ships as the player has. Currently `updateNavigation()` already applies `windSpeedModifier()` to all entities including NPCs (line 36-38). However, NPCs don't intelligently respond to unfavorable wind angles. They should tack (zigzag) when sailing into the wind.

### Files to Modify
- `c:/GIT/PiratesChronicles/src/core/systems/NpcAiSystem.ts` -- add tacking behavior when heading is into the wind
- `c:/GIT/PiratesChronicles/src/core/model/EntityState.ts` -- optionally add `tackState` to `AiData`

### Implementation Steps
1. Wind physics already apply to NPCs via `updateNavigation()` calling `windSpeedModifier()`. The key improvement is NPC heading adjustment.
2. In `NpcAiSystem.ts`, after computing the target heading in `updatePortToPort()` and other navigation functions, check the wind angle:
   ```typescript
   const windAngle = Math.abs(normalizeHeading(heading - world.weather.windDirRad));
   const effectiveAngle = windAngle > Math.PI ? TWO_PI - windAngle : windAngle;
   ```
3. If `effectiveAngle < Math.PI / 6` (30 degrees -- in the no-go zone), the NPC should tack:
   - Add a `tackDirection: 1 | -1` field to `AiData` that flips periodically.
   - Instead of heading directly at the target, offset by 45-60 degrees: `heading + tackDirection * Math.PI / 3`.
   - Every 60-120 AI ticks (3-6 seconds), flip the tack direction.
4. If `effectiveAngle` is between 30-60 degrees (close hauled), allow the direct heading but accept slower speed (already handled by physics).
5. Add `tackDirection?: number` and `tackTimer?: number` to `AiData`.

### Data Model Changes
- Add to `AiData` in `c:/GIT/PiratesChronicles/src/core/model/EntityState.ts`:
  ```typescript
  tackDirection?: number;  // 1 or -1
  tackTimer?: number;       // ticks until next tack switch
  ```

### Dependencies
- Task 3 (refined wind physics) should be done first so the polar speed curve is realistic.

### Testing
- Set wind from the east. Observe NPCs trying to sail east -- they should zigzag.
- NPCs sailing with the wind or across the wind should sail straight.
- Tacking NPCs should still make progress toward their destination (net movement in target direction).

---

## Task 13: NPC Encounter Event on Close Approach

### What
When the player ship sails very close to an NPC ship, trigger an encounter dialog (e.g., "You have been spotted by a Spanish Navy frigate! Fight / Flee / Parley"). The existing `EncounterSystem.ts` handles zone-based random encounters. This task adds proximity-based NPC encounters.

### Files to Modify
- `c:/GIT/PiratesChronicles/src/core/engine/WorldEngine.ts` -- check proximity to NPC ships after navigation updates
- `c:/GIT/PiratesChronicles/src/core/model/Events.ts` -- add `NpcEncounter` event type
- `c:/GIT/PiratesChronicles/src/game/scenes/MainMapScene.ts` -- handle encounter events (pause, show dialog)
- `c:/GIT/PiratesChronicles/src/game/scenes/NpcEncounterScene.ts` -- **new file**: encounter dialog scene

### Implementation Steps
1. In `Events.ts`, add a new event type:
   ```typescript
   | { type: "NpcEncounter"; npcEntityId: EntityId; npcFaction: string; npcBehavior: string }
   ```
2. In `WorldEngine.ts`, after NPC navigation updates (after line 226), add a proximity check:
   ```typescript
   const ENCOUNTER_RADIUS = 25;
   for (const [id, entity] of Object.entries(updatedEntities)) {
     if (id === playerShipId) continue;
     if (entity.kind !== "ship" || !entity.ai) continue;
     const dist = vec2Dist(playerEntity.pos, entity.pos);
     if (dist < ENCOUNTER_RADIUS) {
       allEvents.push({
         type: "NpcEncounter",
         npcEntityId: entity.id,
         npcFaction: entity.ship?.factionId as string,
         npcBehavior: entity.ai.behavior,
       });
       break; // one encounter per tick
     }
   }
   ```
3. Add a cooldown: track `lastEncounterTick` in `WorldState.worldFlags` or a new field. Don't trigger encounters within 200 ticks (10 seconds) of the last one.
4. Create `NpcEncounterScene.ts` as a Phaser overlay scene (similar to `PortApproachScene`) showing:
   - NPC ship type and faction
   - Options: "Engage" (start `SeaBattleScene`), "Flee" (boost speed, NPC may chase), "Hail" (dialogue -- neutral/friendly only)
5. In `MainMapScene.ts`, handle the `NpcEncounter` event in `applyEvents` or in the transition handler.

### Data Model Changes
- Add `NpcEncounter` to `WorldEvent` union in `c:/GIT/PiratesChronicles/src/core/model/Events.ts`
- Optionally add `lastEncounterTick: number` to `WorldState`

### Dependencies
- Task 8 (NPC metadata) provides enriched data for the encounter dialog.
- Task 20 (naval battle) provides the battle scene to transition to.

### Testing
- Sail close to an NPC ship: encounter dialog should appear.
- Choose "Engage": should transition to `SeaBattleScene`.
- Choose "Flee": should resume map with speed boost.
- Verify cooldown prevents rapid re-triggering.
- Friendly faction NPCs should offer "Hail" option.

---

## Task 14: Advanced Wind System -- Regional Zones, Seasonal Variation, Ship Physics

### What
Replace the global wind with a zone-based system. The Caribbean has distinct wind patterns: Trade Winds (NE 10-25N), Doldrums (0-10N near equator -- though mostly off-map), Gulf of Mexico variable winds. Add Perlin noise for local variation and per-ship-class polar speed curves.

### Files to Modify
- `c:/GIT/PiratesChronicles/src/core/data/wind.ts` -- add regional wind zone definitions
- `c:/GIT/PiratesChronicles/src/core/systems/WeatherSystem.ts` -- `updateWeather()` returns per-zone wind; add zone query function
- `c:/GIT/PiratesChronicles/src/core/model/WorldState.ts` -- change `WeatherState` to support regional wind data
- `c:/GIT/PiratesChronicles/src/core/systems/NavigationSystem.ts` -- query wind at ship position
- `c:/GIT/PiratesChronicles/src/core/engine/WorldEngine.ts` -- pass position-based wind to navigation
- `c:/GIT/PiratesChronicles/src/core/data/ships.ts` -- add polar speed profiles per ship class
- `c:/GIT/PiratesChronicles/src/core/services/PerlinNoise.ts` -- **new file**: simple 2D Perlin noise

### Implementation Steps
1. Define wind regions in `wind.ts`:
   ```typescript
   export type WindRegion = {
     id: string;
     latRange: [number, number]; // in game Y coordinates
     baseDirection: number;
     baseStrength: number;
     variance: number;
   };
   export const WIND_REGIONS: WindRegion[] = [
     { id: "trade_winds", latRange: [600, 1800], baseDirection: Math.PI * 0.35, baseStrength: 0.55, variance: 0.2 },
     { id: "gulf_variable", latRange: [200, 800], baseDirection: Math.PI * 0.5, baseStrength: 0.35, variance: 0.4 },
     { id: "south_caribbean", latRange: [1800, 2400], baseDirection: Math.PI * 0.45, baseStrength: 0.5, variance: 0.25 },
   ];
   ```
2. Create `PerlinNoise.ts` with a simple 2D noise function seeded from `world.rng`:
   - Use a hash-based approach (no need for full Perlin -- simplex or value noise suffices).
   - Sample at `(x/500, y/500, time.tick/2000)` for slowly varying local wind perturbation.
3. Add a function `getWindAt(pos: Vec2, weather: WeatherState, tick: number): { dir: number, strength: number }` that:
   - Determines the base region from `pos.y`.
   - Blends with the global `weather.windDirRad` / `weather.windStrength`.
   - Adds Perlin noise perturbation (+-15 degrees direction, +-0.1 strength).
4. In `NavigationSystem.updateNavigation()`, replace `weather.windDirRad` / `weather.windStrength` with `getWindAt(entity.pos, weather, tick)`. This requires passing `tick` to `updateNavigation()`.
5. In `WorldEngine.ts`, pass `newTime.tick` through to navigation calls.
6. In `ships.ts`, add optional `polarProfile` array to each `ShipClassDef`:
   - Sloops: excellent upwind (factor 0.4 at 30 degrees)
   - Galleons: poor upwind (factor 0.15 at 30 degrees) but good running (0.95 at 180 degrees)
7. Update `windSpeedModifier()` to accept an optional polar profile and interpolate from it.

### Data Model Changes
- Add `WindRegion[]` to `c:/GIT/PiratesChronicles/src/core/data/wind.ts`
- Optionally add `windZones?: Record<string, { dir: number; strength: number }>` to `WeatherState` for pre-computed zone winds
- Add `polarProfile?: number[]` to `ShipClassDef`

### Dependencies
- Task 3 (basic wind physics refinement) should be completed first.

### Testing
- Sail from the Gulf of Mexico to the Lesser Antilles: wind should change character.
- Wind compass should still show the wind at the player's position (update `UIOverlayScene` to use position-based wind).
- NPC ships should experience the same zone-based wind at their positions.
- Performance: Perlin noise should not cause noticeable CPU load.

---

## Task 15: 3-Level Sail Sprites with Gradual Animation

### What
Ship sprites should visually change based on `sailLevel`: 0 = furled (no sails visible), 0.34 = quarter sails, 0.68 = half sails, 1.0 = full sails. Currently all ships use the same sprite frame regardless of sail level.

### Files to Modify
- `c:/GIT/PiratesChronicles/src/game/render/WorldRenderer.ts` -- select sail frame based on `sailLevel`
- `c:/GIT/PiratesChronicles/public/assets/` -- create or generate sail variant spritesheets (future asset work)
- For the procedural/classic pack: modify the ship spritesheet to include multiple sail states

### Implementation Steps
1. Define sail levels as discrete states: `FURLED` (0), `HALF` (0.5), `FULL` (1.0). Map continuous `sailLevel` to nearest state.
2. For the procedural ("classic") asset pack:
   - The current sailship spritesheet has 8 directional frames. Add 2 more rows: one for half-sails, one for furled sails.
   - Total frames: 8 directions x 3 sail states = 24 frames.
   - Alternatively, overlay a separate "sails" sprite on top of a "hull" sprite to keep them independent.
3. In `WorldRenderer.sync()`, after computing `DIR8_TO_FRAME[dir8]`, offset the frame by sail state:
   ```typescript
   const sailState = entity.sailLevel > 0.7 ? 2 : entity.sailLevel > 0.2 ? 1 : 0;
   const frame = DIR8_TO_FRAME[dir8] + sailState * 8;
   ```
4. For smooth transitions, use Phaser tweens to cross-fade between sail states (set old sail alpha to 0 while new sail alpha goes to 1 over 300ms).
5. As a simpler first pass (no new art): adjust the ship sprite's vertical scale based on sail level (full sails = normal scale, furled = slightly shorter). This gives a visual hint without new sprites.

### Data Model Changes
None.

### Dependencies
- New sail sprite assets need to be created (either AI-generated or procedural). Can be done as a follow-up with placeholder scaling initially.

### Testing
- Press W three times to go from 0 to full sails. Ship sprite should visually change each time.
- Press S to lower sails. Ship should progressively furl.
- NPC ships at different sail levels should also show correct sprites.

---

## Task 16: Replace Calendar Spam with World Events

### What
Currently, every day that passes generates a log entry "Day X passed" (`event.day_passed` in `WorldEngine.ts` line 73-78). These entries flood the event log with meaningless data. Replace with meaningful world events: trade price changes, faction wars/truces, governor changes, storms, pirate sightings.

### Files to Modify
- `c:/GIT/PiratesChronicles/src/core/engine/WorldEngine.ts` -- remove day-passed spam, add world event generation
- `c:/GIT/PiratesChronicles/src/core/systems/WorldEventSystem.ts` -- **new file**: generates periodic world events
- `c:/GIT/PiratesChronicles/src/core/model/WorldState.ts` -- add world event tracking
- `c:/GIT/PiratesChronicles/src/core/i18n/locales/en.ts` -- add event message translations
- `c:/GIT/PiratesChronicles/src/core/i18n/locales/pl.ts` -- add Polish translations

### Implementation Steps
1. Remove the "Day X passed" log entry from `WorldEngine.ts` (lines 72-78).
2. Create `WorldEventSystem.ts` with a function `generateWorldEvents(world: WorldState, oldDay: number, newDay: number): WorldState`:
   - Called when `oldTime.day !== newTime.day`.
   - Randomly (using `world.rng`) generate 0-2 events per day:
     - **Trade price fluctuation**: pick a random port, adjust a random commodity price by +-10-30%. Log: "Sugar prices surge in Havana".
     - **Faction relations change**: small random shifts in faction relations. Log: "England and Spain sign a temporary truce".
     - **Storm warning**: during hurricane season (Jun-Nov), announce approaching storms. Log: "A great storm approaches the Lesser Antilles".
     - **Pirate sighting**: Log: "Pirates spotted near the Windward Passage".
     - **New ship launched**: a port with shipyard level 3+ launches a new navy ship. Log: "A new frigate sets sail from Cartagena".
3. Each event should modify world state where appropriate (price changes affect `PortRuntimeState.prices`, relation changes affect `FACTIONS` or a runtime override).
4. Keep `addLogEntry()` for recording these events in the event log shown in the Calendar tab.
5. Optionally add a "toast" notification for important events so the player sees them on the map.

### Data Model Changes
- Potentially add `factionRelations: Record<string, Record<string, number>>` to `WorldState` for runtime relation overrides (currently static in `factions.ts`).

### Dependencies
None.

### Testing
- Play for several game days. Event log (Calendar tab) should show varied events instead of "Day X" entries.
- Verify trade prices actually change when price events fire.
- Verify events use proper i18n keys.

---

## Task 17: Realistic Water with Waves and Underwater Reef Map

### What
Add animated water tiles and visible reef/shallow water hazards on the map. Currently the water is a flat dark blue background (line 252-254 in `MainMapScene.createTilemap()`). Terrain types `"reef"` and `"shallow"` exist in `NavigationSystem.ts` but are never returned by the terrain query (which only returns `"sea"` or `"land"`).

### Files to Modify
- `c:/GIT/PiratesChronicles/src/game/scenes/MainMapScene.ts` -- add animated water shader or tile animation, render reef/shallow areas
- `c:/GIT/PiratesChronicles/src/game/render/WaterRenderer.ts` -- **new file**: animated water rendering
- `c:/GIT/PiratesChronicles/src/core/data/geography.ts` -- optionally add reef polygon data
- `c:/GIT/PiratesChronicles/src/core/systems/NavigationSystem.ts` -- terrain query already handles reef/shallow

### Implementation Steps
1. Create `WaterRenderer.ts`:
   - Use a Phaser TileSprite with a procedurally generated water texture (16x16 tile with subtle wave pattern).
   - Animate by scrolling `tilePositionX/Y` with wind direction (partially exists at line 1127-1132).
   - Add a second overlay TileSprite with wave highlights (lighter blue/white) at a different scroll speed for depth effect.
2. For reef visualization:
   - Define reef zones as polygon data in `geography.ts` or a separate `reefs.json` file.
   - Render reef areas with a distinct color (brown/tan with transparency) overlaid on the water.
   - Add a slight shimmer animation (alpha oscillation 0.3-0.5).
3. For shallow water:
   - Render a lighter blue zone around coastlines (within 20-40px of land polygons).
   - Use a gradient or separate polygon offset.
4. Update the terrain query in `createTerrainQuery()` to return `"reef"` and `"shallow"` for appropriate zones.
5. The `NavigationSystem` already handles reef (slow + hull damage) and shallow (0.6x speed) -- these just need terrain data to trigger.

### Data Model Changes
- Optionally add `reefs: Vec2[][]` and `shallows: Vec2[][]` to geography data.

### Dependencies
None (can be done incrementally).

### Testing
- Sail through reef areas: ship should slow down and take hull damage (already coded).
- Sail through shallow areas: ship should slow to 60% speed (already coded).
- Visual: water should have visible animation/movement.
- Reefs should be visible as distinct colored zones on the map.

---

## Task 18: Skill System -- 5 Captain Skills + Progression

### What
The 5 skills (Fencing, Gunnery, Navigation, Medicine, Charm) are defined in `CaptainState.ts` and set during character creation, but never change during gameplay. Implement XP-based skill progression.

### Files to Modify
- `c:/GIT/PiratesChronicles/src/core/model/CaptainState.ts` -- add XP tracking per skill
- `c:/GIT/PiratesChronicles/src/core/systems/SkillSystem.ts` -- **new file**: XP gain and level-up logic
- `c:/GIT/PiratesChronicles/src/core/model/WorldState.ts` -- `CaptainProfile` already in state
- `c:/GIT/PiratesChronicles/src/core/engine/WorldEngine.ts` -- award XP on relevant actions
- `c:/GIT/PiratesChronicles/src/game/scenes/OptionsMenuScene.ts` -- show XP progress in Captain tab

### Implementation Steps
1. In `CaptainState.ts`, add XP tracking:
   ```typescript
   export type CaptainProfile = {
     nationality: string;
     skills: CaptainSkills;
     skillXp: CaptainSkills; // XP accumulated per skill
     startAge: number;
   };
   ```
   Initialize `skillXp` to all zeros.
2. Create `SkillSystem.ts` with functions:
   - `addSkillXp(captain: CaptainProfile, skill: SkillId, amount: number): CaptainProfile` -- adds XP and checks for level-up.
   - XP thresholds: skill 1->2 requires 100 XP, 2->3 requires 200, etc. Formula: `threshold = level * 100`.
   - Max skill level is 10 (from `SKILL_MAX`).
3. Define XP sources (in `WorldEngine` or specific systems):
   - **Fencing**: XP from winning duels (Task 22).
   - **Gunnery**: XP from hitting enemy ships with cannons (in `CombatEngine`).
   - **Navigation**: XP from sailing distance (accumulate distance traveled per day, award XP per 100 units).
   - **Medicine**: XP from surviving crew illness events (Task 16 world events), healing crew.
   - **Charm**: XP from successful trade deals, recruiting crew, parley encounters.
4. In `OptionsMenuScene.renderCaptain()`, add XP progress bars next to skill bars. Show `xp / threshold` as a secondary bar.
5. When a skill levels up, generate a `WorldEvent` of type `Toast`: "Navigation skill increased to 7!".

### Data Model Changes
- Add `skillXp: CaptainSkills` to `CaptainProfile` in `c:/GIT/PiratesChronicles/src/core/model/CaptainState.ts`

### Dependencies
- Task 19 (RPG traits) defines what the skills DO.
- Can be implemented independently; effects can be added later.

### Testing
- Sail for a while: Navigation XP should accumulate.
- Trigger a trade: Charm XP should accumulate.
- Check Captain tab shows XP progress.
- Level up: skill value should increase, toast should appear.
- Save/load: XP values should persist.

---

## Task 19: RPG Traits Affect Gameplay

### What
Each skill should have concrete gameplay effects. Currently skills are display-only. Implement modifier systems that read skill values and affect game mechanics.

### Files to Modify
- `c:/GIT/PiratesChronicles/src/core/systems/NavigationSystem.ts` -- Navigation skill affects speed
- `c:/GIT/PiratesChronicles/src/core/systems/CombatSystem.ts` -- Gunnery affects accuracy/damage
- `c:/GIT/PiratesChronicles/src/core/systems/EconomySystem.ts` -- Charm affects trade prices
- `c:/GIT/PiratesChronicles/src/core/systems/CrewConsumptionSystem.ts` -- Medicine affects morale/health
- `c:/GIT/PiratesChronicles/src/core/services/SkillModifiers.ts` -- **new file**: centralized skill modifier calculations

### Implementation Steps
1. Create `SkillModifiers.ts` with modifier functions:
   ```typescript
   export function navigationSpeedBonus(level: number): number {
     return 1 + (level - 5) * 0.03; // skill 5 = 1.0x, skill 10 = 1.15x
   }
   export function gunneryAccuracy(level: number): number {
     return 0.4 + level * 0.06; // skill 5 = 0.7, skill 10 = 1.0
   }
   export function gunneryDamageMultiplier(level: number): number {
     return 0.8 + level * 0.04; // skill 5 = 1.0x, skill 10 = 1.2x
   }
   export function charmPriceModifier(level: number): number {
     return 1 - (level - 5) * 0.02; // skill 10 = 0.90 (10% cheaper)
   }
   export function medicineMoraleDecayRate(level: number): number {
     return 1 - (level - 5) * 0.05; // skill 10 = 0.75x morale decay
   }
   ```
2. In `NavigationSystem.ts` `updateNavigation()`, multiply `baseSpeed` by `navigationSpeedBonus(captain.skills.navigation)`. Requires passing `captain` skills through `WorldEngine`.
3. In `CombatSystem.ts`, apply `gunneryAccuracy()` to hit chance and `gunneryDamageMultiplier()` to damage rolls.
4. In `EconomySystem.ts` `executeBuy()` and `executeSell()`, apply `charmPriceModifier()` to prices.
5. In `CrewConsumptionSystem.ts`, apply `medicineMoraleDecayRate()` to morale loss rate.
6. Fencing skill effects are implemented in the Duel scene (Task 22).

### Data Model Changes
None (reads existing `captain.skills`).

### Dependencies
- Task 18 (skill progression) is a prerequisite for meaningful progression.
- Can implement modifiers before progression (skills set at character creation still matter).

### Testing
- Create a character with high Navigation: ship should move noticeably faster.
- Create a character with high Charm: trade prices should be better.
- Compare combat damage with different Gunnery levels.

---

## Task 20: Naval Battle Scene

### What
A real-time ship combat scene. The existing `SeaBattleScene.ts` and `CombatEngine.ts` provide a basic framework with WASD movement, Q/E cannon firing, and hull/sails damage. This task expands it into a full naval battle system.

### Files to Modify
- `c:/GIT/PiratesChronicles/src/game/scenes/SeaBattleScene.ts` -- expand UI, add boarding, victory conditions
- `c:/GIT/PiratesChronicles/src/core/engine/CombatEngine.ts` -- improve AI, add boarding mechanics
- `c:/GIT/PiratesChronicles/src/core/model/CombatState.ts` -- add boarding state
- `c:/GIT/PiratesChronicles/src/core/systems/CombatSystem.ts` -- expand combat constants
- `c:/GIT/PiratesChronicles/src/core/model/Commands.ts` -- add `AttemptBoard` command
- `c:/GIT/PiratesChronicles/src/core/engine/WorldEngine.ts` -- apply battle results to world state

### Implementation Steps
1. **Enemy AI in combat**: In `CombatEngine.ts`, add AI behavior for the enemy ship:
   - Circle the player trying to maintain broadside range.
   - Fire cannons when player is in range and broadside angle.
   - Flee when hull < 20% or crew < 30%.
   - Attempt to board when very close and crew advantage.
2. **Boarding**: Add `AttemptBoard` command. When ships are within 30px and both have crew:
   - Compare crew counts with modifiers (fencing skill, morale).
   - Roll outcome: attacker wins, defender wins, or stalemate.
   - Winner captures the enemy ship.
3. **Victory conditions**:
   - Enemy hull = 0: ship sinks, loot floating cargo.
   - Enemy crew = 0: ship surrendered, can board and capture.
   - Boarding victory: capture ship and cargo.
   - Player hull = 0: game over / rescue event.
   - Disengage: both ships separate, back to map.
4. **Loot system**: After winning, transfer gold/cargo from enemy to player. Add the enemy ship to player's fleet (future feature, for now just take cargo).
5. **Battle results in world state**: In `SeaBattleScene.showBattleResult()`, apply changes:
   - Update player ship hull/sails/crew damage in `WorldState`.
   - Remove defeated NPC from `entities`.
   - Add gold/cargo to player.
   - Add reputation effects (sinking a Spanish ship = -rep with Spain, +rep with pirates).
6. **Visual improvements**: Add cannon smoke particles, splash effects for misses, ship debris when sinking.

### Data Model Changes
- Add `AttemptBoard` to `CombatCommand` in `Commands.ts`.
- Add `boarding: boolean; boardingProgress: number` to `CombatState`.

### Dependencies
- Existing `SeaBattleScene.ts` and `CombatEngine.ts` provide the foundation.
- Task 13 (NPC encounter) provides the trigger to enter battle.

### Testing
- Engage an NPC ship via encounter dialog.
- Fire cannons: enemy should take damage.
- Enemy AI should fire back and maneuver.
- Reduce enemy hull to 0: victory screen with loot.
- Return to map: player damage should persist, NPC should be removed.
- Test boarding when ships are close.

---

## Task 21: Land Battle Scene

### What
Attacking or defending cities with troops. This is a new combat mode separate from naval battles. The player leads their crew ashore to assault a city, or defends a friendly city from attack.

### Files to Modify
- `c:/GIT/PiratesChronicles/src/game/scenes/LandBattleScene.ts` -- **new file**: land battle scene
- `c:/GIT/PiratesChronicles/src/core/engine/LandBattleEngine.ts` -- **new file**: land combat logic
- `c:/GIT/PiratesChronicles/src/core/model/LandBattleState.ts` -- **new file**: land battle state
- `c:/GIT/PiratesChronicles/src/core/model/Commands.ts` -- add land battle commands
- `c:/GIT/PiratesChronicles/src/game/scenes/PortApproachScene.ts` -- add "Attack" option for hostile ports

### Implementation Steps
1. **Design**: Top-down tactical view. Player crew vs. city garrison. Grid or free-form movement. Units: swordsmen, musketeers, cannoneers. City forts provide defensive bonuses (Task 10).
2. **LandBattleState**: Define state:
   ```typescript
   type LandBattleState = {
     arena: { width: number; height: number };
     attackerUnits: BattleUnit[];
     defenderUnits: BattleUnit[];
     fortifications: Fortification[];
     phase: "deploy" | "combat" | "result";
   };
   ```
3. **Entry point**: In `PortApproachScene.ts`, when the player approaches a hostile port, add "Attack" option. This launches `LandBattleScene` with the player's crew vs. city garrison (based on city population and forts).
4. **Combat mechanics**: Simplified -- auto-resolve with dice rolls modified by:
   - Crew count ratio
   - Fort count (each fort adds +20% defense)
   - Fencing skill of captain
   - Morale
5. **Visual**: For MVP, show a text-based battle report with animated progress bar. Future: animated unit sprites on a grid.
6. **Outcomes**: Win = plunder city gold, take control (change faction), reputation effects. Lose = crew losses, retreat to ship.

### Data Model Changes
- New `LandBattleState` type.
- New `LandBattleCommand` type.
- Add `garrison: number` to `PortRuntimeState` (derived from population).

### Dependencies
- Task 10 (city forts) provides defense data.
- Task 18 (skills) provides fencing skill modifier.

### Testing
- Approach a hostile port, select "Attack".
- Battle should resolve based on crew/fort balance.
- Victory: city changes faction, gold rewarded.
- Defeat: crew reduced, returned to map.

---

## Task 22: Duel Scene

### What
Sword fighting mini-game against enemy captains. Triggered during boarding (Task 20) or special encounters. Classic Pirates! feature.

### Files to Modify
- `c:/GIT/PiratesChronicles/src/game/scenes/DuelScene.ts` -- **new file**: duel mini-game
- `c:/GIT/PiratesChronicles/src/core/model/DuelState.ts` -- **new file**: duel state
- `c:/GIT/PiratesChronicles/src/core/model/Commands.ts` -- add duel commands
- `c:/GIT/PiratesChronicles/src/core/i18n/locales/en.ts` -- duel UI text

### Implementation Steps
1. **Design**: Side-view 2D duel. Two sprites facing each other. Three actions: High attack, Mid attack, Low attack. Defender must match the attack zone to block. Timing-based: press the right key within a window.
2. **DuelState**:
   ```typescript
   type DuelState = {
     playerHp: number;
     enemyHp: number;
     playerStamina: number;
     enemyStamina: number;
     phase: "ready" | "player_attack" | "enemy_attack" | "result";
     fencingSkill: number;
   };
   ```
3. **Duel commands**: `{ type: "Attack"; zone: "high" | "mid" | "low" }`, `{ type: "Block"; zone: "high" | "mid" | "low" }`.
4. **Skill effect**: Fencing skill (1-10) affects:
   - Attack window duration: higher skill = wider timing window.
   - Damage dealt: skill 5 = 10 damage, skill 10 = 15 damage.
   - Enemy reaction speed: at higher skill, enemy AI is slower to react.
5. **Visual**: Use simple animated sprites. Player on left, enemy on right. Show attack zone indicators (high/mid/low) with timed prompts.
6. **Integration**: Triggered from boarding victory in `SeaBattleScene` or from NPC encounter "Challenge" option. Result affects boarding outcome.
7. **Outcomes**: Win = capture enemy captain (ransom for gold), bonus loot. Lose = player wounded, retreat.

### Data Model Changes
- New `DuelState` type.
- New `DuelCommand` type in `Commands.ts`.

### Dependencies
- Task 20 (naval battle) triggers duels during boarding.
- Task 18 (fencing skill) provides skill level.

### Testing
- Enter a duel from boarding.
- Attack and block correctly: enemy should take damage.
- Fail to block: player takes damage.
- Win: bonus rewards.
- Fencing skill should visibly affect difficulty.

---

## Task 23: ComfyUI API Docs in ai-assets Subproject

### What
Document the ComfyUI workflow for generating game assets. Existing docs in `ai-assets/docs/` (WORKFLOW.md, TRAINING.md, ASSET-SPEC.md) are partially written in Polish. Expand with English API documentation.

### Files to Modify
- `c:/GIT/PiratesChronicles/ai-assets/docs/COMFYUI-API.md` -- **new file**: ComfyUI API integration docs
- `c:/GIT/PiratesChronicles/ai-assets/docs/WORKFLOW.md` -- expand existing workflow docs
- `c:/GIT/PiratesChronicles/ai-assets/README.md` -- update links

### Implementation Steps
1. Document the ComfyUI API endpoints:
   - `POST /prompt` -- submit a workflow for execution
   - `GET /history/{prompt_id}` -- check status
   - `GET /view?filename={name}` -- retrieve generated image
2. Document the specific workflows for each asset type:
   - Ship spritesheets (8-directional, transparent background)
   - City sprites (small/medium/large variants)
   - Cloud textures
   - UI elements (parchment panels, buttons)
3. Document the post-processing pipeline:
   - Nearest-neighbor downscale
   - Background removal (alpha matting)
   - Palette reduction (32-color Amiga palette)
   - Spritesheet assembly (ImageMagick montage)
4. Provide example API calls with `curl` commands.
5. Document model/LoRA requirements: base model (SD1.5 or SDXL), LoRA for pixel art style, negative prompt patterns.
6. Add a scripts section documenting any automation scripts in the `ai-assets/` directory.

### Data Model Changes
None.

### Dependencies
None.

### Testing
- Follow the documentation to generate a sample asset using ComfyUI API.
- Verify all API endpoints documented are correct.
- Ensure the post-processing steps produce game-ready assets.

---

## Implementation Priority and Sequencing

### Phase 1: Quick Wins (1-2 days each)
1. **Task 1**: Tune cloud speed (5-minute constant change)
2. **Task 2**: Fix jerky camera (small refactor)
3. **Task 5**: Controls manual tab (UI only)
4. **Task 6**: NPC faction flags (rendering change)
5. **Task 7**: NPC hostile faction port filtering (AI filter)
6. **Task 8**: NPC metadata (data enrichment)

### Phase 2: Core Systems (3-5 days each)
7. **Task 3**: Ship wind physics refinement
8. **Task 9**: Smooth coastlines
9. **Task 11**: NPC coast avoidance near ports
10. **Task 12**: NPC wind physics / tacking
11. **Task 4**: Wake effect particles
12. **Task 10**: City forts system

### Phase 3: World Systems (1 week each)
13. **Task 16**: Replace calendar spam with world events
14. **Task 14**: Advanced regional wind system
15. **Task 17**: Realistic water / reef visualization
16. **Task 15**: Sail level sprites
17. **Task 13**: NPC encounter on close approach

### Phase 4: RPG / Combat (1-2 weeks each)
18. **Task 18**: Skill XP progression
19. **Task 19**: RPG traits affect gameplay
20. **Task 20**: Naval battle expansion
21. **Task 22**: Duel scene
22. **Task 21**: Land battle scene

### Phase 5: Documentation
23. **Task 23**: ComfyUI API docs (any time)

### Dependency Graph
```
Task 3 (wind physics) --> Task 12 (NPC wind) --> Task 14 (advanced wind)
Task 8 (NPC metadata) --> Task 13 (NPC encounters) --> Task 20 (naval battle)
Task 10 (forts) --> Task 21 (land battle)
Task 18 (skills) --> Task 19 (skill effects)
Task 18 (skills) --> Task 22 (duel -- fencing)
Task 20 (naval battle) --> Task 22 (duel -- boarding trigger)
```

---

### Critical Files for Implementation
- `c:/GIT/PiratesChronicles/src/core/engine/WorldEngine.ts` - Central game loop; most tasks touch this file for integration (wind, NPC encounters, events, skill XP)
- `c:/GIT/PiratesChronicles/src/core/systems/NavigationSystem.ts` - Ship movement and wind physics; Tasks 3, 12, 14, 19 modify speed calculations here
- `c:/GIT/PiratesChronicles/src/game/render/WorldRenderer.ts` - Entity rendering; Tasks 4, 6, 15 add visual features here
- `c:/GIT/PiratesChronicles/src/core/model/EntityState.ts` - Entity data model; Tasks 8, 12 extend AiData; Tasks 13, 20 interact with entity state
- `c:/GIT/PiratesChronicles/src/game/scenes/OptionsMenuScene.ts` - SPACE menu; Tasks 5, 18 add new tabs and UI content here