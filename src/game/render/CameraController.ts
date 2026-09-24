// Type-only: this controller touches a camera's fields and nothing of
// Phaser's runtime, which is what lets `cameraZoom.test.ts` drive it
// against a plain object instead of a browser (v0.97.0).
import type Phaser from "phaser";
import type { Vec2 } from "../../core/model/WorldState.ts";
import { lerp } from "../../core/services/Geometry.ts";
import { getZoomValue, stepZoomLevel } from "../settings/ZoomSetting.ts";

const ZOOM_LERP = 0.15;

export class CameraController {
  private camera: Phaser.Cameras.Scene2D.Camera;
  private targetPos: Vec2 = { x: 0, y: 0 };

  constructor(camera: Phaser.Cameras.Scene2D.Camera) {
    this.camera = camera;
    this.camera.setZoom(getZoomValue());
  }

  setTarget(pos: Vec2): void {
    this.targetPos = pos;
  }

  snapTo(pos: Vec2): void {
    this.targetPos = pos;
    this.camera.scrollX = pos.x - this.camera.width / 2;
    this.camera.scrollY = pos.y - this.camera.height / 2;
  }

  setBounds(x: number, y: number, width: number, height: number): void {
    this.camera.setBounds(x, y, width, height);
  }

  /** One step along the ladder the quartermaster's screen lists (v0.97.0). */
  adjustZoom(delta: number): void {
    stepZoomLevel(delta < 0 ? 1 : -1);
  }

  update(): void {
    // Direct follow — entity interpolation provides smoothness,
    // no camera lerp needed (was causing compound delay/jitter)
    this.camera.scrollX = this.targetPos.x - this.camera.width / 2;
    this.camera.scrollY = this.targetPos.y - this.camera.height / 2;

    /*
     * The zoom the player chose, every frame, from the one place it is kept.
     *
     * Until v0.97.0 this aimed at a `zoomTarget` field set in the constructor
     * and moved only by the mouse wheel. The quartermaster's screen wrote the
     * setting and then poked `cameras.main.setZoom` itself, and this line
     * **undid it on the next frame**: measured, thirteen of the fourteen steps
     * were back at 6× within one second of play, and the fourteenth was 6×
     * already. `* Działa natychmiast` was true for as long as the map stayed
     * paused behind the menu.
     */
    const currentZoom = this.camera.zoom;
    const target = getZoomValue();
    const diff = Math.abs(currentZoom - target);
    if (diff > 0.05) {
      this.camera.setZoom(lerp(currentZoom, target, ZOOM_LERP));
    } else if (diff > 0.001) {
      this.camera.setZoom(target);
    }
  }

  shake(duration: number = 100, intensity: number = 0.005): void {
    this.camera.shake(duration, intensity);
  }
}
