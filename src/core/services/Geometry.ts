import type { Vec2, HeadingRad } from "../model/WorldState.ts";
import type { LandmassDef } from "../data/geography.ts";

export const TWO_PI = Math.PI * 2;

export function vec2(x: number, y: number): Vec2 {
  return { x, y };
}

export function vec2Add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function vec2Sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function vec2Scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

export function vec2Length(v: Vec2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

export function vec2Normalize(v: Vec2): Vec2 {
  const len = vec2Length(v);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

export function vec2Dist(a: Vec2, b: Vec2): number {
  return vec2Length(vec2Sub(a, b));
}

export function vec2Dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function headingToVec(heading: HeadingRad): Vec2 {
  // heading=0 is North (up), increases clockwise
  return { x: Math.sin(heading), y: -Math.cos(heading) };
}

export function vecToHeading(v: Vec2): HeadingRad {
  const h = Math.atan2(v.x, -v.y);
  return normalizeHeading(h);
}

export function normalizeHeading(h: HeadingRad): HeadingRad {
  let r = h % TWO_PI;
  if (r < 0) r += TWO_PI;
  return r;
}

export function headingDiff(from: HeadingRad, to: HeadingRad): number {
  let diff = to - from;
  while (diff > Math.PI) diff -= TWO_PI;
  while (diff < -Math.PI) diff += TWO_PI;
  return diff;
}

// Convert heading to one of 8 directions (0=N, 1=NE, 2=E, ... 7=NW)
export function headingToDir8(heading: HeadingRad): number {
  const step = TWO_PI / 8;
  const normalized = normalizeHeading(heading + step / 2);
  return Math.floor(normalized / step) % 8;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function pointInRect(p: Vec2, rect: { x: number; y: number; w: number; h: number }): boolean {
  return p.x >= rect.x && p.x < rect.x + rect.w && p.y >= rect.y && p.y < rect.y + rect.h;
}

/**
 * Fast point-in-landmass test with bbox pre-check.
 */
export function pointInLandmass(point: Vec2, lm: LandmassDef): boolean {
  if (lm.bbox) {
    if (point.x < lm.bbox.minX || point.x > lm.bbox.maxX ||
        point.y < lm.bbox.minY || point.y > lm.bbox.maxY) return false;
  }
  return pointInPolygon(point, lm.polygon);
}

/**
 * Ray-casting point-in-polygon test.
 */
export function pointInPolygon(point: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect =
      ((yi > point.y) !== (yj > point.y)) &&
      (point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Chaikin subdivision: smooths a closed polygon by cutting corners. */
export function chaikinSmooth(pts: Vec2[], iterations = 2): Vec2[] {
  let cur = pts;
  for (let iter = 0; iter < iterations; iter++) {
    const next: Vec2[] = [];
    const n = cur.length;
    for (let i = 0; i < n; i++) {
      const p0 = cur[i];
      const p1 = cur[(i + 1) % n];
      next.push({ x: 0.75 * p0.x + 0.25 * p1.x, y: 0.75 * p0.y + 0.25 * p1.y });
      next.push({ x: 0.25 * p0.x + 0.75 * p1.x, y: 0.25 * p0.y + 0.75 * p1.y });
    }
    cur = next;
  }
  return cur;
}
