import Phaser from "phaser";

// Utility to sort display list children by depth (y + offset)
export function depthSort(container: Phaser.GameObjects.Container | Phaser.Scene): void {
  const children = container instanceof Phaser.Scene
    ? container.children.list
    : container.list;

  children.sort((a, b) => ((a as Phaser.GameObjects.Sprite).depth ?? 0) - ((b as Phaser.GameObjects.Sprite).depth ?? 0));
}
