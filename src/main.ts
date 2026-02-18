import { launchGame } from "./game/GameApp.ts";

// Ensure custom font is loaded before Phaser renders text
document.fonts.load('16px "Treasure Map Deadhand"').then(() => {
  const game = launchGame("game-container");

  window.addEventListener("beforeunload", () => {
    game.destroy(true);
  });
});
