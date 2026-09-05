/**
 * MapEventMarkerRenderer — the chart says something is happening there.
 *
 * Draws one mark per town for the world events the player has been told about
 * (`MapEventSystem.knownPortEvents`). The mark is a coloured pin above the town
 * with the event named beside it, and a broken ring round any harbour that is
 * shut — a hurricane or a plague can close a door the captain was planning to
 * walk through, and that is the one fact worth a ring of its own.
 *
 * ## Everything here is in screen pixels
 *
 * Same rule, and the same reason, as `ExpeditionCourseRenderer`: the chart is
 * drawn in world units, so a mark with fixed world dimensions grows with the
 * zoom until it covers the island it is about. The camera runs from 1.5× to
 * 12×, an eightfold range. Sizes below are screen pixels and are divided by the
 * zoom before use; the text objects get `setScale(1 / zoom)`, exactly as the
 * city labels do in `MainMapScene`.
 *
 * ## Not drawn at overview zoom
 *
 * Below zoom 2 the city icons themselves are hidden and forty-five towns fit on
 * one screen. Marks there would be a carpet of words over the Caribbean rather
 * than a chart, so they fade in over the same range the icons do.
 */

import Phaser from "phaser";
import type { WorldState } from "../../core/model/WorldState.ts";
import { knownPortEvents, type PortEventMark, type MarkValence } from "../../core/systems/MapEventSystem.ts";
import { PORTS } from "../../core/data/ports.ts";
import { txt } from "../ui/textStyle.ts";
import { t } from "../../core/i18n/index.ts";

/** Above the port markers' graphics (500) but under their labels (600). */
const MARK_DEPTH = 550;
const LABEL_DEPTH = 601;

/** Screen pixels — see the header. */
const PIN_R = 4.5;
/** Screen pixels of air between the town sprite and the pin above it. */
const PIN_GAP = 8;
/** Screen pixels the shut-harbour ring stands off the town sprite. */
const RING_STANDOFF = 5;
const RING_DASH = 5;
const RING_GAP = 4;
const LABEL_PX = 12;

/**
 * Half the width of the town sprite, in world units.
 *
 * The town icons are the one thing on this chart drawn at a fixed *world* size
 * (`CityIconRenderer` scales them to 22 / 15 / 10 world units by population),
 * so they grow eightfold across the zoom range while every annotation stays the
 * same size on screen. A pin floated a fixed number of screen pixels above the
 * town therefore sits clear of a village at z2 and buried inside Havana at z12
 * — which is exactly what the first cut of this did. Anything that has to clear
 * the sprite has to be measured off the sprite.
 */
function townRadius(portKey: string): number {
  const pop = PORTS[portKey]?.population;
  return pop === "large" || pop === "capital" ? 11 : pop === "medium" ? 7.5 : 5;
}

/**
 * One question, one colour: is this worth sailing towards or away from?
 *
 * Red and green are the obvious pair and the wrong one on a chart already
 * carrying four faction colours, two of which are red. These are the ink
 * colours the rest of the map annotations use — a rust for trouble, a gold for
 * an opportunity, a slate for a change of circumstance.
 */
const VALENCE_COLOR: Record<MarkValence, number> = {
  bad: 0xb03a2e,
  good: 0xd4a017,
  neutral: 0x6b7a8f,
};

export type EventMarkerResult = {
  gfx: Phaser.GameObjects.Graphics;
  labels: Phaser.GameObjects.Text[];
  /** What was drawn, in order, so a redraw can be skipped. */
  drawnKeys: string[];
  drawnZoom: number;
  drawnVisible: boolean;
};

/**
 * A mark's identity for staleness purposes: which town, which event, whether
 * the door is shut, and how many days are left — the last because the label
 * counts them down.
 */
function markKey(m: PortEventMark): string {
  return `${m.portKey}:${m.eventId}:${m.closed ? "x" : "o"}:${m.daysLeft}:${m.extra}`;
}

function dashedCircle(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  r: number,
  scale: number,
): void {
  const circumference = 2 * Math.PI * r;
  const step = (RING_DASH + RING_GAP) * scale;
  const dashAngle = (RING_DASH * scale / circumference) * Math.PI * 2;
  const stepAngle = (step / circumference) * Math.PI * 2;
  for (let a = 0; a < Math.PI * 2; a += stepAngle) {
    g.beginPath();
    g.arc(cx, cy, r, a, Math.min(Math.PI * 2, a + dashAngle), false);
    g.strokePath();
  }
}

/**
 * Draw every mark the player's chart carries.
 *
 * Returns the objects so the caller can destroy them on the next redraw. As
 * with the expedition courses there is no incremental update — this is at most
 * a handful of pins, and an event that lifted, spread or shut a harbour would
 * otherwise each need their own diff.
 *
 * @param positions Coast-snapped port positions from `PortMarkerRenderer`. The
 *   raw `CITIES[key].pos` can sit a little inland or offshore of where the town
 *   is actually drawn, and a pin that does not sit over its own icon is worse
 *   than no pin.
 */
export function drawEventMarkers(
  scene: Phaser.Scene,
  world: WorldState,
  zoom: number,
  positions: Map<string, { x: number; y: number }>,
): EventMarkerResult {
  const gfx = scene.add.graphics();
  gfx.setDepth(MARK_DEPTH);
  const labels: Phaser.GameObjects.Text[] = [];
  const drawnKeys: string[] = [];
  const scale = 1 / Math.max(0.1, zoom);
  // The city icons fade in from zoom 2 to 3; the marks follow them, or they
  // would be words hanging over an empty sea.
  const alpha = zoom < 2 ? 0 : zoom < 3 ? zoom - 2 : 1;
  const visible = alpha > 0.01;

  if (!visible) {
    gfx.setVisible(false);
    return { gfx, labels, drawnKeys, drawnZoom: zoom, drawnVisible: false };
  }

  for (const mark of knownPortEvents(world)) {
    const pos = positions.get(mark.portKey);
    if (!pos) continue;
    drawnKeys.push(markKey(mark));

    const color = VALENCE_COLOR[mark.valence];
    const radius = townRadius(mark.portKey);
    const pinX = pos.x;
    const pinY = pos.y - radius - PIN_GAP * scale;

    // A shut harbour gets a broken ring round the town itself — the pin says
    // what is happening, the ring says he cannot go in while it does. It stands
    // off the sprite rather than sitting at a fixed screen radius, or a capital
    // swallows it whole at close zoom.
    if (mark.closed) {
      gfx.lineStyle(1.6 * scale, VALENCE_COLOR.bad, 0.85 * alpha);
      dashedCircle(gfx, pos.x, pos.y, radius + RING_STANDOFF * scale, scale);
    }

    // The pin: a disc on a short stem, so it reads as something pushed into the
    // chart above the town rather than as part of the town sprite.
    gfx.lineStyle(1.2 * scale, 0x2b2b2b, 0.8 * alpha);
    gfx.beginPath();
    gfx.moveTo(pos.x, pos.y - radius * 0.5);
    gfx.lineTo(pinX, pinY);
    gfx.strokePath();
    gfx.fillStyle(color, 0.95 * alpha);
    gfx.fillCircle(pinX, pinY, PIN_R * scale);
    gfx.lineStyle(0.9 * scale, 0x2b2b2b, 0.9 * alpha);
    gfx.strokeCircle(pinX, pinY, PIN_R * scale);

    // The name of the thing, above the pin. `mapevent.closed` replaces it when
    // the door is shut, because that outranks whatever shut it: the captain
    // does not need to know it was the weather to know he is not getting in.
    const name = mark.closed ? t("mapevent.closed") : t("mapevent." + mark.type);
    const suffix = mark.extra > 0 ? " " + t("mapevent.more", { count: mark.extra }) : "";
    const label = scene.add.text(
      pinX, pinY - (PIN_R + 2) * scale,
      name + suffix,
      {
        ...txt(LABEL_PX, { bold: true, color: "#" + color.toString(16).padStart(6, "0") }),
        stroke: "#1a1a1a",
        strokeThickness: 3,
      },
    );
    label.setOrigin(0.5, 1);
    label.setScale(scale);
    label.setAlpha(alpha);
    label.setDepth(LABEL_DEPTH);
    labels.push(label);
  }

  return { gfx, labels, drawnKeys, drawnZoom: zoom, drawnVisible: true };
}

/** True when what is on screen no longer matches what the world says. */
export function markersStale(
  prev: EventMarkerResult | null,
  world: WorldState,
  zoom: number,
): boolean {
  if (!prev) return true;
  if (prev.drawnZoom !== zoom) return true;
  // Visibility is a function of the zoom alone, and the zoom has not moved:
  // nothing was drawn and nothing would be. Without this the empty `drawnKeys`
  // of an invisible pass compares unequal to a live event list every frame.
  if (!prev.drawnVisible) return false;
  const now = knownPortEvents(world).map(markKey);
  if (now.length !== prev.drawnKeys.length) return true;
  return now.some((k, i) => k !== prev.drawnKeys[i]);
}

export function clearEventMarkers(prev: EventMarkerResult | null): void {
  if (!prev) return;
  prev.gfx.destroy();
  for (const label of prev.labels) label.destroy();
}
