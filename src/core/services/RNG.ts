import type { RngState } from "../model/WorldState.ts";

// Mulberry32 - simple, fast, deterministic PRNG
// Produces values in [0, 1)
export function rngNext(rng: RngState): { value: number; state: RngState } {
  let t = (rng.state + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const raw = ((t ^ (t >>> 14)) >>> 0);
  const value = raw / 4294967296;
  return { value, state: { seed: rng.seed, state: raw } };
}

export function rngNextInt(rng: RngState, min: number, max: number): { value: number; state: RngState } {
  const { value, state } = rngNext(rng);
  return { value: min + Math.floor(value * (max - min + 1)), state };
}

export function rngNextFloat(rng: RngState, min: number, max: number): { value: number; state: RngState } {
  const { value, state } = rngNext(rng);
  return { value: min + value * (max - min), state };
}

export function createRng(seed: number): RngState {
  return { seed, state: seed };
}
