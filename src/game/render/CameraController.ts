import Phaser from "phaser";
import type { Vec2 } from "../../core/model/WorldState.ts";
import { lerp } from "../../core/services/Geometry.ts";
import { getZoomValue } from "../settings/ZoomSetting.ts";

const ZOOM_LERP = 0.15;
const ZOOM_MIN = 1;
const ZOOM_MAX = 12;

export class CameraController {
  private camera: Phaser.Cameras.Scene2D.Camera;
  private targetPos: Vec2 = { x: 0, y: 0 };
  private zoomTarget: number;

  constructor(camera: Phaser.Cameras.Scene2D.Camera) {
    this.camera = camera;
    this.zoomTarget = getZoomValue();
    this.camera.setZoom(this.zoomTarget);
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
    this.zoomTarget = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
    this.camera.setZoom(this.zoomTarget);
  }

  /** Adjust zoom by mouse-wheel delta — snaps to integer zoom levels (1,2,3...12). */
  adjustZoom(delta: number): void {
    const current = Math.round(this.zoomTarget);
    if (delta < 0) {
      this.zoomTarget = Math.min(current + 1, ZOOM_MAX);
    } else {
      this.zoomTarget = Math.max(current - 1, ZOOM_MIN);
    }
    // Ensure integer
    this.zoomTarget = Math.round(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this.zoomTarget)));
  }

  update(): void {
    // Direct follow — entity interpolation provides smoothness,
    // no camera lerp needed (was causing compound delay/jitter)
    this.camera.scrollX = this.targetPos.x - this.camera.width / 2;
    this.camera.scrollY = this.targetPos.y - this.camera.height / 2;

    // Smooth zoom with snap to integer when close
    const currentZoom = this.camera.zoom;
    const diff = Math.abs(currentZoom - this.zoomTarget);
    if (diff > 0.05) {
      this.camera.setZoom(lerp(currentZoom, this.zoomTarget, ZOOM_LERP));
    } else if (diff > 0.001) {
      // Snap to exact integer target
      this.camera.setZoom(this.zoomTarget);
    }
  }

  shake(duration: number = 100, intensity: number = 0.005): void {
    this.camera.shake(duration, intensity);
  }
}
