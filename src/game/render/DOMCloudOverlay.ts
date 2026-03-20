/**
 * DOM-based volumetric clouds — exact technique from codepen spite/DgQzLv.
 * Reference: https://codepen.io/spite/pen/DgQzLv
 *
 * Uses HTML divs with CSS 3D transforms over the Phaser canvas.
 * Each cloud = base div with multiple rotated/translated child layers.
 * Hybrid approach: Phaser renders game, DOM renders clouds on top.
 */

// Cloud texture: organic cloud shape made of many overlapping soft blobs
const CLOUD_TEX = (() => {
  const s = 256;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const ctx = c.getContext("2d")!;

  // Many overlapping radial gradients at random positions = organic cloud shape
  const blobs = [
    { x: 0.5, y: 0.5, r: 0.4, a: 0.6 },   // center
    { x: 0.35, y: 0.45, r: 0.3, a: 0.5 },  // left
    { x: 0.65, y: 0.45, r: 0.32, a: 0.5 },  // right
    { x: 0.45, y: 0.35, r: 0.25, a: 0.4 },  // top
    { x: 0.55, y: 0.6, r: 0.28, a: 0.35 },  // bottom
    { x: 0.3, y: 0.55, r: 0.2, a: 0.3 },   // lower-left
    { x: 0.7, y: 0.5, r: 0.22, a: 0.3 },   // right edge
    { x: 0.5, y: 0.3, r: 0.18, a: 0.25 },  // top tuft
    { x: 0.4, y: 0.65, r: 0.15, a: 0.2 },  // bottom wisp
    { x: 0.6, y: 0.35, r: 0.2, a: 0.3 },   // top-right
  ];

  for (const b of blobs) {
    const cx = b.x * s, cy = b.y * s, r = b.r * s;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, `rgba(255,255,255,${b.a})`);
    grad.addColorStop(0.4, `rgba(255,255,255,${b.a * 0.6})`);
    grad.addColorStop(0.7, `rgba(255,255,255,${b.a * 0.2})`);
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);
  }

  return c.toDataURL();
})();

interface CloudData {
  el: HTMLDivElement;
  x: number;
  y: number;
  speed: number;
}

export class DOMCloudOverlay {
  private container: HTMLDivElement;
  private clouds: CloudData[] = [];
  private mapW: number;
  private mapH: number;

  constructor(mapWidth: number, mapHeight: number, numClouds = 30) {
    this.mapW = mapWidth;
    this.mapH = mapHeight;

    // Create container over phaser canvas
    this.container = document.createElement("div");
    this.container.id = "cloud-overlay";
    this.container.style.cssText = `
      position: absolute; left: 0; top: 0; right: 0; bottom: 0;
      pointer-events: none; overflow: hidden; z-index: 5;
    `;
    document.body.appendChild(this.container);

    // Spawn clouds
    for (let i = 0; i < numClouds; i++) {
      this.spawnCloud(
        Math.random() * mapWidth,
        Math.random() * mapHeight,
        0.25 + Math.random() * 0.5, // alpha 25-75%
      );
    }
  }

  private spawnCloud(worldX: number, worldY: number, alpha: number): void {
    const base = document.createElement("div");
    base.className = "cloud-base";
    base.style.cssText = `
      position: absolute; left: 0; top: 0;
      width: 20px; height: 20px;
      transform-style: preserve-3d;
    `;

    // 6-10 layers per cloud — tightly packed
    const numLayers = 6 + Math.floor(Math.random() * 5);
    const baseSize = 120 + Math.random() * 100; // 120-220px

    for (let i = 0; i < numLayers; i++) {
      const layer = document.createElement("div");
      const lSize = baseSize * (0.6 + Math.random() * 0.6);
      const offsetX = (Math.random() - 0.5) * baseSize * 0.3;
      const offsetY = (Math.random() - 0.5) * baseSize * 0.2;
      const zOffset = i * 5;
      const layerAlpha = alpha * (0.15 + Math.random() * 0.25); // much lower alpha per layer

      layer.style.cssText = `
        position: absolute;
        width: ${lSize}px; height: ${lSize}px;
        margin-left: ${-lSize / 2 + offsetX}px;
        margin-top: ${-lSize / 2 + offsetY}px;
        background-image: url(${CLOUD_TEX});
        background-size: cover;
        opacity: ${layerAlpha};
        transform: translateZ(${zOffset}px);
      `;
      base.appendChild(layer);
    }

    this.container.appendChild(base);
    this.clouds.push({
      el: base,
      x: worldX,
      y: worldY,
      speed: 0.3 + Math.random() * 0.5,
    });
  }

  /** Update cloud positions based on camera and wind */
  update(
    camScrollX: number, camScrollY: number,
    camZoom: number, camW: number, camH: number,
    windDirRad: number, windStrength: number,
  ): void {
    const dx = Math.sin(windDirRad + Math.PI) * windStrength * 0.1;
    const dy = -Math.cos(windDirRad + Math.PI) * windStrength * 0.1;

    for (const cloud of this.clouds) {
      // Move with wind
      cloud.x += dx * cloud.speed;
      cloud.y += dy * cloud.speed;

      // Wrap around map
      if (cloud.x < -200) cloud.x += this.mapW + 400;
      if (cloud.x > this.mapW + 200) cloud.x -= this.mapW + 400;
      if (cloud.y < -200) cloud.y += this.mapH + 400;
      if (cloud.y > this.mapH + 200) cloud.y -= this.mapH + 400;

      // World → screen position
      const sx = (cloud.x - camScrollX) * camZoom;
      const sy = (cloud.y - camScrollY) * camZoom;

      // Cull if off-screen
      if (sx < -400 || sx > camW + 400 || sy < -400 || sy > camH + 400) {
        cloud.el.style.display = "none";
      } else {
        cloud.el.style.display = "";
        cloud.el.style.left = `${sx}px`;
        cloud.el.style.top = `${sy}px`;
        // Scale: moderate so clouds look natural
        const scale = Math.max(0.3, camZoom * 0.25);
        cloud.el.style.transform = `scale(${scale})`;
      }
    }
  }

  destroy(): void {
    this.container.remove();
    this.clouds = [];
  }
}
