import { launchGame } from "./game/GameApp.ts";

// Ensure custom fonts are loaded before Phaser renders text
Promise.all([
  document.fonts.load('16px "Dancing Script"'),
  document.fonts.load('16px "Pirates"'),
]).then(() => {
  const game = launchGame("game-container");

  window.addEventListener("beforeunload", () => {
    game.destroy(true);
  });
});
