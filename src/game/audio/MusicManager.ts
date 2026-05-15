import type Phaser from "phaser";
import { getSoundGain } from "../settings/SoundSettings.ts";

/**
 * Known music track identifiers.
 * Add new entries here as audio assets become available.
 * Tracks with null asset keys are stubs for future content.
 */
export type MusicTrack =
  | "menu"
  | "sailing"
  | "port"
  | "tavern"
  | "battle"
  | "none";

/** Maps logical track names to Phaser audio asset keys. */
const TRACK_ASSETS: Record<MusicTrack, string | null> = {
  menu: "pirate_theme",
  sailing: null,
  port: null,
  tavern: null,
  battle: null,
  none: null,
};

/** Whether each track should loop when playing. */
const TRACK_LOOP: Record<MusicTrack, boolean> = {
  menu: false,
  sailing: true,
  port: true,
  tavern: true,
  battle: true,
  none: false,
};

export class MusicManager {
  private game: Phaser.Game;
  private currentTrack: MusicTrack = "none";
  private currentSound: Phaser.Sound.BaseSound | null = null;

  constructor(game: Phaser.Game) {
    this.game = game;
  }

  /** Switch to a different music track. Stops current track first. */
  play(track: MusicTrack, volume = 0.5): void {
    if (track === this.currentTrack && this.currentSound) return;

    this.stop();

    const assetKey = TRACK_ASSETS[track];
    if (!assetKey || !this.game.cache.audio.exists(assetKey)) {
      this.currentTrack = track;
      return;
    }

    this.currentTrack = track;
    const finalVolume = volume * getSoundGain("music");
    const sound = this.game.sound.add(assetKey, {
      loop: TRACK_LOOP[track],
      volume: finalVolume,
    });
    this.currentSound = sound;

    if (this.game.sound.locked) {
      this.game.sound.once("unlocked", () => {
        if (this.currentSound === sound) {
          (sound as Phaser.Sound.WebAudioSound).play();
        }
      });
    } else {
      (sound as Phaser.Sound.WebAudioSound).play();
    }
  }

  /** Stop current music. */
  stop(): void {
    if (this.currentSound) {
      this.currentSound.stop();
      this.currentSound.destroy();
      this.currentSound = null;
    }
    this.currentTrack = "none";
  }

  /** Get the currently playing track identifier. */
  getCurrent(): MusicTrack {
    return this.currentTrack;
  }
}
