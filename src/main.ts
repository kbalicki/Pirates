import { launchGame } from "./game/GameApp.ts";

// Launch Pirates Chronicles
const game = launchGame("game-container");

// Handle window cleanup
window.addEventListener("beforeunload", () => {
  game.destroy(true);
});
