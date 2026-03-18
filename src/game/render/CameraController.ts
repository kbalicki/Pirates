import Phaser from "phaser";
import type { Vec2 } from "../../core/model/WorldState.ts";
import { lerp } from "../../core/services/Geometry.ts";
import { getZoomValue, ZOOM_VALUES } from "../settings/ZoomSetting.ts";

const CAMERA_LERP = 0.08;
const ZOOM_LERP = 0.10;
const ZOOM_MIN = ZOOM_VALUES.far;
const ZOOM_MAX = ZOOM_VALUES.close;
/** Multiplicative step per scroll notch (e.g. 1.15 = 15% per notch). */
const SCROLL_ZOOM_FACTOR = 1.15;

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

  /** Adjust zoom by mouse-wheel delta (positive = zoom in, negative = zoom out). */
  adjustZoom(delta: number): void {
    if (delta < 0) {
      this.zoomTarget *= SCROLL_ZOOM_FACTOR;
    } else {
      this.zoomTarget /= SCROLL_ZOOM_FACTOR;
    }
    this.zoomTarget = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this.zoomTarget));
  }

  update(): void {
    // Smooth follow with lerp
    const cx = lerp(this.camera.scrollX + this.camera.width / 2, this.targetPos.x, CAMERA_LERP);
    const cy = lerp(this.camera.scrollY + this.camera.height / 2, this.targetPos.y, CAMERA_LERP);

    this.camera.scrollX = cx - this.camera.width / 2;
    this.camera.scrollY = cy - this.camera.height / 2;

    // Smooth zoom
    const currentZoom = this.camera.zoom;
    if (Math.abs(currentZoom - this.zoomTarget) > 0.001) {
      this.camera.setZoom(lerp(currentZoom, this.zoomTarget, ZOOM_LERP));
    }
  }

  shake(duration: number = 100, intensity: number = 0.005): void {
    this.camera.shake(duration, intensity);
  }
}
