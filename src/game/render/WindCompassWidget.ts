import Phaser from "phaser";
import { UI_FONT, TEXT_RES } from "../ui/textStyle.ts";

// ---- Constants ---------------------------------------------------------- //

const DARK_BROWN = "#5C3A1E";
const DARK_BROWN_NUM = 0x5c3a1e;
const PARCHMENT = "#D4BE8A";
const LABEL_COLOR = "#3A2510";
const NORTH_RED = "#C0392B";
const NORTH_RED_NUM = 0xc0392b;
const NEEDLE_WHITE_NUM = 0xe8e0d0;
const INNER_RING_NUM = 0x8b6b3f;
const CENTER_DOT_NUM = 0x3a2510;
const TICK_COLOR_NUM = 0x5c3a1e;

const NEEDLE_TEX_KEY = "__windCompassNeedle";
const DISC_TEX_KEY = "__windCompassDisc";

// Cardinal direction labels in clockwise order starting from N
const CARDINALS: { label: string; angle: number; color: string }[] = [
  { label: "N", angle: 0, color: NORTH_RED },
  { label: "E", angle: Math.PI / 2, color: LABEL_COLOR },
  { label: "S", angle: Math.PI, color: LABEL_COLOR },
  { label: "W", angle: (3 * Math.PI) / 2, color: LABEL_COLOR },
];

// 8 intercardinal tick angles (NE, SE, SW, NW and the 4 cardinals — we only
// draw ticks for the intercardinals since cardinals have letters).
const INTERCARDINAL_ANGLES = [
  Math.PI / 4,
  (3 * Math.PI) / 4,
  (5 * Math.PI) / 4,
  (7 * Math.PI) / 4,
];

// 8 secondary ticks (NNE, ENE, ESE, SSE, SSW, WSW, WNW, NNW)
const SECONDARY_TICK_ANGLES = [
  Math.PI / 8,
  (3 * Math.PI) / 8,
  (5 * Math.PI) / 8,
  (7 * Math.PI) / 8,
  (9 * Math.PI) / 8,
  (11 * Math.PI) / 8,
  (13 * Math.PI) / 8,
  (15 * Math.PI) / 8,
];

const COMPASS_LABELS = [
  "N", "NNE", "NE", "ENE",
  "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW",
  "W", "WNW", "NW", "NNW",
];

function radToCompassLabel(rad: number): string {
  // Phaser convention: 0 = up/north, clockwise positive
  let deg = ((rad * 180) / Math.PI) % 360;
  if (deg < 0) deg += 360;
  const idx = Math.round(deg / 22.5) % 16;
  return COMPASS_LABELS[idx];
}

function strengthToKnots(s: number): number {
  return Math.round(s * 40);
}

// ---- Widget ------------------------------------------------------------- //

/**
 * A fully procedural wind-compass widget for Phaser 3.
 *
 * The disc and needle are generated on an off-screen canvas so no external
 * image assets are needed.  Call `updateWind()` every frame.
 */
export class WindCompassWidget {
  private scene: Phaser.Scene;
  private disc: Phaser.GameObjects.Image;
  private needle: Phaser.GameObjects.Image;
  private windLabel: Phaser.GameObjects.Text;
  private size: number;
  private currentAngle = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, size: number) {
    this.scene = scene;
    this.size = size;

    // ---------- Generate textures (once per game) ---------- //
    if (!scene.textures.exists(DISC_TEX_KEY)) {
      this.generateDiscTexture(size);
    }
    if (!scene.textures.exists(NEEDLE_TEX_KEY)) {
      this.generateNeedleTexture(size);
    }

    // ---------- Create game objects ---------- //
    // Textures are drawn at 2x resolution for crispness; scale to target size.
    const texScale = size / (size * 2); // 0.5
    this.disc = scene.add.image(x, y, DISC_TEX_KEY);
    this.disc.setScale(texScale);
    this.disc.setDepth(10);

    this.needle = scene.add.image(x, y, NEEDLE_TEX_KEY);
    this.needle.setScale(texScale);
    this.needle.setDepth(20);

    this.windLabel = scene.add.text(x, y + size / 2 + 6, "Calm", {
      fontFamily: UI_FONT,
      fontSize: "12px",
      color: "#cccccc",
      resolution: TEXT_RES,
      stroke: "#000000",
      strokeThickness: 2,
    });
    this.windLabel.setOrigin(0.5, 0);
    this.windLabel.setDepth(30);
  }

  // ---- Public API ------------------------------------------------------- //

  /** Update needle rotation and wind-speed label.  Called every frame. */
  updateWind(dirRad: number, strength: number): void {
    // Smooth needle rotation via shortest-path interpolation
    const target = dirRad;
    let diff = target - this.currentAngle;
    // Normalise diff to [-PI, PI]
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;

    // Lerp 10% per frame for smooth feel
    this.currentAngle += diff * 0.1;
    this.needle.setRotation(this.currentAngle);

    const knots = strengthToKnots(strength);
    if (knots === 0) {
      this.windLabel.setText("Calm");
    } else {
      const label = radToCompassLabel(dirRad);
      this.windLabel.setText(`${knots} kn ${label}`);
    }
  }

  /** Reposition after a window resize. */
  reposition(x: number, y: number): void {
    this.disc.setPosition(x, y);
    this.needle.setPosition(x, y);
    this.windLabel.setPosition(x, y + this.size / 2 + 6);
  }

  /** Clean up game objects. */
  destroy(): void {
    this.disc.destroy();
    this.needle.destroy();
    this.windLabel.destroy();
  }

  // ---- Texture generation ----------------------------------------------- //

  private generateDiscTexture(size: number): void {
    // We draw at 2x for crisp rendering, then let Phaser scale down
    const res = 2;
    const s = size * res;
    const half = s / 2;

    const canvas = document.createElement("canvas");
    canvas.width = s;
    canvas.height = s;
    const ctx = canvas.getContext("2d")!;

    // -- Outer ring (dark brown filled circle) ----------------------------- //
    ctx.beginPath();
    ctx.arc(half, half, half - 1, 0, Math.PI * 2);
    ctx.fillStyle = DARK_BROWN;
    ctx.fill();

    // -- Inner parchment fill ---------------------------------------------- //
    const innerR = half - s * 0.06;
    ctx.beginPath();
    ctx.arc(half, half, innerR, 0, Math.PI * 2);
    ctx.fillStyle = PARCHMENT;
    ctx.fill();

    // -- Decorative inner circle ------------------------------------------- //
    const decoR = half * 0.55;
    ctx.beginPath();
    ctx.arc(half, half, decoR, 0, Math.PI * 2);
    ctx.strokeStyle = this.numToHex(INNER_RING_NUM);
    ctx.lineWidth = 1.2 * res;
    ctx.stroke();

    // -- Secondary ticks (16-point, thinner) ------------------------------- //
    for (const angle of SECONDARY_TICK_ANGLES) {
      const outerTick = innerR - 1;
      const innerTick = innerR - s * 0.05;
      const cosA = Math.cos(angle - Math.PI / 2);
      const sinA = Math.sin(angle - Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(half + cosA * innerTick, half + sinA * innerTick);
      ctx.lineTo(half + cosA * outerTick, half + sinA * outerTick);
      ctx.strokeStyle = this.numToHex(TICK_COLOR_NUM);
      ctx.lineWidth = 1 * res;
      ctx.stroke();
    }

    // -- Intercardinal ticks (NE, SE, SW, NW — longer) --------------------- //
    for (const angle of INTERCARDINAL_ANGLES) {
      const outerTick = innerR - 1;
      const innerTick = innerR - s * 0.10;
      const cosA = Math.cos(angle - Math.PI / 2);
      const sinA = Math.sin(angle - Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(half + cosA * innerTick, half + sinA * innerTick);
      ctx.lineTo(half + cosA * outerTick, half + sinA * outerTick);
      ctx.strokeStyle = this.numToHex(TICK_COLOR_NUM);
      ctx.lineWidth = 1.8 * res;
      ctx.stroke();
    }

    // -- Cardinal labels (N, E, S, W) -------------------------------------- //
    const labelR = half * 0.72;
    const fontSize = Math.round(s * 0.16);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const c of CARDINALS) {
      const cosA = Math.cos(c.angle - Math.PI / 2);
      const sinA = Math.sin(c.angle - Math.PI / 2);
      const lx = half + cosA * labelR;
      const ly = half + sinA * labelR;

      ctx.font = `bold ${fontSize}px 'Dancing Script', cursive`;
      ctx.fillStyle = c.color;
      ctx.fillText(c.label, lx, ly);
    }

    // -- Center dot -------------------------------------------------------- //
    ctx.beginPath();
    ctx.arc(half, half, s * 0.035, 0, Math.PI * 2);
    ctx.fillStyle = this.numToHex(CENTER_DOT_NUM);
    ctx.fill();

    // -- Add to Phaser textures -------------------------------------------- //
    this.scene.textures.addCanvas(DISC_TEX_KEY, canvas);

    // The image will be the native canvas size; scale to requested size
    // (Phaser Image defaults to 1:1 pixel mapping, so we need scale factor)
    // We'll handle this by setting displaySize after creation.
    // Actually, let's just mark the right size — the Image will auto-use it.
  }

  private generateNeedleTexture(size: number): void {
    const res = 2;
    const s = size * res;
    const half = s / 2;

    const canvas = document.createElement("canvas");
    canvas.width = s;
    canvas.height = s;
    const ctx = canvas.getContext("2d")!;

    // The needle is a diamond / kite shape centered in the canvas.
    // Top half (points north) = red, bottom half (points south) = silver/white.
    const needleLen = half * 0.82;   // from center to tip
    const needleWidth = half * 0.16; // half-width at the widest point

    // --- North (red) half — triangle pointing up --- //
    ctx.beginPath();
    ctx.moveTo(half, half - needleLen);           // tip (north)
    ctx.lineTo(half - needleWidth, half);         // left middle
    ctx.lineTo(half + needleWidth, half);         // right middle
    ctx.closePath();
    ctx.fillStyle = this.numToHex(NORTH_RED_NUM);
    ctx.fill();
    // subtle dark edge
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // --- South (white/silver) half — triangle pointing down --- //
    ctx.beginPath();
    ctx.moveTo(half, half + needleLen);           // tip (south)
    ctx.lineTo(half - needleWidth, half);         // left middle
    ctx.lineTo(half + needleWidth, half);         // right middle
    ctx.closePath();
    ctx.fillStyle = this.numToHex(NEEDLE_WHITE_NUM);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // --- Center circle overlay --- //
    ctx.beginPath();
    ctx.arc(half, half, s * 0.04, 0, Math.PI * 2);
    ctx.fillStyle = this.numToHex(DARK_BROWN_NUM);
    ctx.fill();

    this.scene.textures.addCanvas(NEEDLE_TEX_KEY, canvas);
  }

  private numToHex(n: number): string {
    return "#" + n.toString(16).padStart(6, "0");
  }
}
