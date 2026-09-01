import type Phaser from "phaser";
import { launchGame } from "./game/GameApp.ts";

let game: Phaser.Game | undefined;

// Ensure custom fonts are loaded before Phaser renders text
Promise.all([
  document.fonts.load('16px "Dancing Script"'),
  document.fonts.load('16px "Pirates"'),
]).then(() => {
  game = launchGame("game-container");

  window.addEventListener("beforeunload", () => {
    game?.destroy(true);
  });
});

// Vite hot-reloads this module on every save under src/. Without a dispose hook
// the previous Phaser.Game keeps running behind the new one: two scene trees,
// two sets of keyboard listeners, and the canvas you can see is not the one your
// keys reach. It reads as "the controls stopped working" and only a hard reload
// clears it. Tear the old game down before the new module boots one.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game?.destroy(true);
    game = undefined;
    document.getElementById("game-container")?.replaceChildren();
  });
}
