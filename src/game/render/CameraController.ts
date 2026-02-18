import Phaser from "phaser";
import type { Vec2 } from "../../core/model/WorldState.ts";
import { lerp } from "../../core/services/Geometry.ts";

const CAMERA_LERP = 0.08;
const DEFAULT_ZOOM = 1.5;

export class CameraController {
  private camera: Phaser.Cameras.Scene2D.Camera;
  private targetPos: Vec2 = { x: 0, y: 0 };

  constructor(camera: Phaser.Cameras.Scene2D.Camera) {
    this.camera = camera;
    this.camera.setZoom(DEFAULT_ZOOM);
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

  setZoom(zoom: number): void {
    this.camera.setZoom(zoom);
  }

  update(): void {
    // Smooth follow with lerp
    const cx = lerp(this.camera.scrollX + this.camera.width / 2, this.targetPos.x, CAMERA_LERP);
    const cy = lerp(this.camera.scrollY + this.camera.height / 2, this.targetPos.y, CAMERA_LERP);

    this.camera.scrollX = cx - this.camera.width / 2;
    this.camera.scrollY = cy - this.camera.height / 2;
  }

  shake(duration: number = 100, intensity: number = 0.005): void {
    this.camera.shake(duration, intensity);
  }
}
