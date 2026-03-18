/**
 * Visual style selection — persisted in localStorage.
 *
 * "basic"      → OSM coastlines, procedural rendering
 * "buccaneer"  → Buccaneer Edition (coming soon)
 * "corsair"    → Corsair Edition (coming soon)
 */

const STORAGE_KEY = "pc_asset_pack";
const VALID_PACKS = ["basic", "buccaneer", "corsair"] as const;
export type AssetPackId = (typeof VALID_PACKS)[number];

/** Ordered list for UI display. */
export const PACK_LIST: readonly AssetPackId[] = VALID_PACKS;

let currentPack: AssetPackId = "basic";

export function initAssetPack(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (VALID_PACKS as readonly string[]).includes(stored)) {
      currentPack = stored as AssetPackId;
    }
  } catch {
    // localStorage unavailable
  }
}

export function getAssetPack(): AssetPackId {
  return currentPack;
}

export function setAssetPack(pack: AssetPackId): void {
  currentPack = pack;
  try {
    localStorage.setItem(STORAGE_KEY, pack);
  } catch {
    // localStorage unavailable
  }
}

/**
 * Returns the asset path prefix for pack-specific assets.
 * All packs currently use the same OSM procedural rendering — no extra assets.
 */
export function getPackPrefix(): string | null {
  return null;
}

/** Whether the current pack uses parchment UI panels. */
export function usesParchmentUI(): boolean {
  return false;
}
