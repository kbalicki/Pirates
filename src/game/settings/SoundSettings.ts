/**
 * Per-channel sound volume settings (0-10 scale).
 * 0 = muted, 10 = full volume.
 * Stored in localStorage; defaults to 5 for each channel.
 */

export type SoundChannel = "wind" | "seagulls" | "music";

const STORAGE_KEY: Record<SoundChannel, string> = {
  wind: "pc_vol_wind",
  seagulls: "pc_vol_seagulls",
  music: "pc_vol_music",
};

const DEFAULT_LEVEL = 5;
export const SOUND_MAX = 10;
export const SOUND_MIN = 0;

const levels: Record<SoundChannel, number> = {
  wind: DEFAULT_LEVEL,
  seagulls: DEFAULT_LEVEL,
  music: DEFAULT_LEVEL,
};

export function initSoundSettings(): void {
  for (const ch of Object.keys(levels) as SoundChannel[]) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY[ch]);
      if (raw !== null) {
        const v = parseInt(raw, 10);
        if (Number.isFinite(v) && v >= SOUND_MIN && v <= SOUND_MAX) {
          levels[ch] = v;
        }
      }
    } catch {
      // localStorage unavailable
    }
  }
}

export function getSoundLevel(channel: SoundChannel): number {
  return levels[channel];
}

export function setSoundLevel(channel: SoundChannel, level: number): void {
  const clamped = Math.max(SOUND_MIN, Math.min(SOUND_MAX, Math.round(level)));
  levels[channel] = clamped;
  try {
    localStorage.setItem(STORAGE_KEY[channel], String(clamped));
  } catch {
    // localStorage unavailable
  }
}

/** Convert 0-10 setting to 0..1 volume gain. */
export function getSoundGain(channel: SoundChannel): number {
  return levels[channel] / SOUND_MAX;
}
