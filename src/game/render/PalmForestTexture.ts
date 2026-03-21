/**
 * Palm forest texture generator — ported from palm_forest_v3_dense.html.
 * Generates a tileable 512×512 canvas with dense palm forest.
 */

/* ── seeded rng ── */
function rng(seed: number): () => number {
  let s = (seed ^ 0xdeadbeef) >>> 0;
  return () => {
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b) >>> 0;
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b) >>> 0;
    s ^= s >>> 16;
    return (s >>> 0) / 0x100000000;
  };
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

const TYPES = [
  { nF: [9, 13], lLen: [0.82, 1.10], lW: [0.15, 0.19], lean: 0.32, tH: [1.0, 1.6] },
  { nF: [13, 20], lLen: [0.48, 0.70], lW: [0.20, 0.27], lean: 0.14, tH: [0.4, 0.80] },
  { nF: [10, 15], lLen: [0.68, 0.95], lW: [0.15, 0.21], lean: 0.24, tH: [0.80, 1.2] },
];
const YS_BASE = 0.72;

function frondColor(lightness: number, back: boolean): { fill: string; shade: string } {
  if (back) {
    const v = clamp(Math.floor(lightness * 30), 0, 30);
    return { fill: `rgb(${22 + v},${55 + v},${8 + v})`, shade: `rgb(12,32,5)` };
  }
  const r = clamp(48 + Math.floor(lightness * 40), 30, 110);
  const g = clamp(120 + Math.floor(lightness * 50), 80, 190);
  const b = clamp(18 + Math.floor(lightness * 20), 10, 55);
  return {
    fill: `rgb(${r},${g},${b})`,
    shade: `rgb(${Math.floor(r * 0.45)},${Math.floor(g * 0.45)},${Math.floor(b * 0.45)})`,
  };
}

function buildSprite(typeIdx: number, seed: number, scale: number) {
  const tp = TYPES[typeIdx];
  const r = rng(seed);
  const YS = YS_BASE * (0.66 + r() * 0.44);
  const crownR = (12 + r() * 6) * scale;
  const nF = tp.nF[0] + Math.floor(r() * (tp.nF[1] - tp.nF[0] + 1));
  const leanAng = r() * Math.PI * 2;
  const leanAmt = r() * tp.lean * crownR;
  const tH = crownR * lerp(tp.tH[0], tp.tH[1], r()) * lerp(0.62, 0.78, r());
  const tW = (1.8 + r() * 1.5) * scale;

  const pad = crownR * 1.5;
  const cw = Math.ceil(pad * 2 + Math.abs(leanAmt) * 2 + 8);
  const ch = Math.ceil(tH + pad * 2 + 8);
  const ax = Math.floor(cw / 2);
  const ay = ch - Math.floor(pad * 0.32);

  const oc = document.createElement("canvas");
  oc.width = cw;
  oc.height = ch;
  const c = oc.getContext("2d")!;

  const crX = ax + Math.cos(leanAng) * leanAmt;
  const crY = ay - tH;
  const curv = r() < 0.75 ? r() * 0.32 : 0.55 + r() * 0.45;
  const bendX = (r() - 0.5) * tH * (0.28 + curv * 1.5);
  const bendY = (r() - 0.5) * tH * (0.07 + curv * 0.3);
  const cpT = 0.28 + r() * 0.46;
  const cpX = lerp(ax, crX, cpT) + bendX;
  const cpY = lerp(ay, crY, cpT) + bendY;

  // Shadow
  const grad = c.createRadialGradient(
    ax + Math.cos(leanAng) * leanAmt * 0.08, ay + tW * 0.3, 0,
    ax + Math.cos(leanAng) * leanAmt * 0.08, ay + tW * 0.3, tW * 2.2,
  );
  grad.addColorStop(0, "rgba(0,8,0,0.62)");
  grad.addColorStop(0.5, "rgba(0,5,0,0.30)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  c.save();
  c.scale(1, 0.38);
  c.fillStyle = grad;
  c.beginPath();
  c.arc(ax + Math.cos(leanAng) * leanAmt * 0.08, (ay + tW * 0.3) / 0.38, tW * 2.2, 0, Math.PI * 2);
  c.fill();
  c.restore();

  // Trunk
  const pGrad = c.createLinearGradient(ax - tW, 0, ax + tW, 0);
  pGrad.addColorStop(0, "#1a0800");
  pGrad.addColorStop(0.25, "#5a3010");
  pGrad.addColorStop(0.52, "#9a5e28");
  pGrad.addColorStop(0.72, "#c07838");
  pGrad.addColorStop(0.88, "#8a4e1c");
  pGrad.addColorStop(1, "#2e1205");

  const drawTrunk = (style: string | CanvasGradient, lw: number, ox: number) => {
    c.beginPath();
    c.moveTo(ax + ox, ay);
    c.quadraticCurveTo(cpX + ox, cpY, crX + ox, crY);
    c.strokeStyle = style;
    c.lineWidth = lw;
    c.lineCap = "round";
    c.stroke();
  };
  drawTrunk("#0e0500", tW * 1.5, 0);
  drawTrunk(pGrad, tW * 0.95, 0);

  // Trunk rings
  const rings = Math.floor(tH / (7 * scale));
  for (let ri = 1; ri <= rings; ri++) {
    const t2 = ri / (rings + 1);
    const bx = (1 - t2) * (1 - t2) * ax + 2 * (1 - t2) * t2 * cpX + t2 * t2 * crX;
    const by = (1 - t2) * (1 - t2) * ay + 2 * (1 - t2) * t2 * cpY + t2 * t2 * crY;
    const dtx = 2 * (1 - t2) * (cpX - ax) + 2 * t2 * (crX - cpX);
    const dty = 2 * (1 - t2) * (cpY - ay) + 2 * t2 * (crY - cpY);
    const ln = Math.sqrt(dtx * dtx + dty * dty) || 1;
    const nx = -dty / ln, ny = dtx / ln, hw = tW * 0.44;
    c.beginPath();
    c.moveTo(bx + nx * hw, by + ny * hw);
    c.lineTo(bx - nx * hw, by - ny * hw);
    c.strokeStyle = "rgba(0,0,0,0.28)";
    c.lineWidth = scale * 0.8;
    c.stroke();
  }

  // Fronds
  const bRot = r() * Math.PI * 2;
  const sunAngle = -Math.PI * 0.65;
  interface Frond { angle: number; len: number; maxW: number; droop: number; curl: number; lightness: number; back: boolean; }
  const fronds: Frond[] = [];
  for (let i = 0; i < nF; i++) {
    const angle = bRot + (i / nF) * Math.PI * 2 + (r() - 0.5) * ((Math.PI * 2) / nF) * 0.42;
    const len = crownR * lerp(tp.lLen[0], tp.lLen[1], r());
    const maxW = len * lerp(tp.lW[0], tp.lW[1], r());
    const droop = len * YS * (0.07 + r() * 0.20);
    const curl = (r() - 0.5) * len * 0.11;
    const dotSun = Math.cos(angle - sunAngle);
    const lightness = clamp((dotSun + 1) * 0.5, 0, 1);
    const back = Math.sin(angle) < -0.08;
    const shadowMul = 0.55 + r() * 0.45;
    fronds.push({ angle, len, maxW, droop, curl, lightness: lightness * shadowMul, back });
  }
  fronds.sort((a, b) => Math.sin(a.angle) - Math.sin(b.angle));

  const ST = 14;
  for (const fr of fronds) {
    const { angle, len: fLen, maxW, droop, curl, lightness, back } = fr;
    const ca = Math.cos(angle), sa = Math.sin(angle) * YS;
    const pc = Math.cos(angle + Math.PI / 2), ps = Math.sin(angle + Math.PI / 2) * YS;
    const { fill: fillC, shade: shadeC } = frondColor(lightness, back);

    const ol = () => {
      c.beginPath();
      for (let i = 0; i <= ST; i++) {
        const t = i / ST, d = t * fLen, w = maxW * Math.sin(t * Math.PI * 0.90 + 0.08) * 0.5;
        const sag = t * t * droop, cu = t * t * curl;
        i === 0 ? c.moveTo(crX + ca * d + pc * (w + cu), crY + sa * d + ps * (w + cu) + sag)
                : c.lineTo(crX + ca * d + pc * (w + cu), crY + sa * d + ps * (w + cu) + sag);
      }
      c.lineTo(crX + ca * fLen * 1.03 + pc * curl, crY + sa * fLen * 1.03 + droop * 1.03);
      for (let i = ST; i >= 0; i--) {
        const t = i / ST, d = t * fLen, w = maxW * Math.sin(t * Math.PI * 0.90 + 0.08) * 0.5;
        const sag = t * t * droop, cu = t * t * curl;
        c.lineTo(crX + ca * d - pc * (w - cu * 0.18), crY + sa * d - ps * (w - cu * 0.18) + sag);
      }
      c.closePath();
    };

    ol(); c.fillStyle = shadeC; c.fill();
    ol(); c.save(); c.clip();
    c.fillStyle = fillC;
    c.beginPath();
    for (let i = 0; i <= ST; i++) {
      const t = i / ST, d = t * fLen, sag = t * t * droop, cu = t * t * curl, bW = maxW * 5;
      i === 0 ? c.moveTo(crX + ca * d + pc * (bW + cu), crY + sa * d + ps * (bW + cu) + sag)
              : c.lineTo(crX + ca * d + pc * (bW + cu), crY + sa * d + ps * (bW + cu) + sag);
    }
    for (let i = ST; i >= 0; i--) {
      const t = i / ST, d = t * fLen, sag = t * t * droop, cu = t * t * curl;
      c.lineTo(crX + ca * d + pc * cu * 0.1, crY + sa * d + sag);
    }
    c.closePath(); c.fill();

    c.beginPath();
    c.moveTo(crX + ca * 2 * scale, crY + sa * 2 * scale);
    c.quadraticCurveTo(crX + ca * (fLen * 0.52), crY + sa * (fLen * 0.52) + droop * 0.55, crX + ca * fLen + pc * curl, crY + sa * fLen + droop);
    c.strokeStyle = back ? "rgba(0,20,0,0.35)" : "rgba(0,40,0,0.28)";
    c.lineWidth = clamp(0.55 * scale, 0.3, 1.8);
    c.stroke();
    c.restore();
  }

  return { oc, ax, ay };
}

function drawForestFloor(ctx: CanvasRenderingContext2D, SIZE: number, seed: number): void {
  const baseGrad = ctx.createRadialGradient(SIZE * 0.4, SIZE * 0.35, 0, SIZE * 0.5, SIZE * 0.5, SIZE * 0.72);
  baseGrad.addColorStop(0, "#2e6b0f");
  baseGrad.addColorStop(0.5, "#246008");
  baseGrad.addColorStop(1, "#183d05");
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, SIZE, SIZE);

  const r0 = rng(seed + 77);
  for (let i = 0; i < SIZE * 0.8; i++) {
    const x = r0() * SIZE, y = r0() * SIZE;
    const rx = 4 + r0() * SIZE * 0.12, ry = 3 + r0() * SIZE * 0.07;
    const alpha = 0.04 + r0() * 0.18;
    const gr = ctx.createRadialGradient(x, y, 0, x, y, rx);
    gr.addColorStop(0, `rgba(0,8,0,${alpha})`);
    gr.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, r0() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  const r1 = rng(seed + 33);
  for (let i = 0; i < SIZE * 0.25; i++) {
    const x = r1() * SIZE, y = r1() * SIZE;
    const rs = 1 + r1() * SIZE * 0.018;
    const alpha = 0.03 + r1() * 0.09;
    const gr2 = ctx.createRadialGradient(x, y, 0, x, y, rs);
    gr2.addColorStop(0, `rgba(140,200,60,${alpha})`);
    gr2.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gr2;
    ctx.beginPath();
    ctx.arc(x, y, rs, 0, Math.PI * 2);
    ctx.fill();
  }

  const r2 = rng(seed + 55);
  for (let i = 0; i < SIZE * 0.4; i++) {
    const x = r2() * SIZE, y = r2() * SIZE;
    const s2 = 1.5 + r2() * SIZE * 0.022;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(r2() * Math.PI * 2);
    ctx.scale(1, 0.45 + r2() * 0.3);
    ctx.fillStyle = `rgba(${10 + Math.floor(r2() * 15)},${40 + Math.floor(r2() * 25)},5,${0.25 + r2() * 0.35})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, s2, s2 * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/**
 * Generate a tileable palm forest texture.
 * @param size Canvas size (512 recommended)
 * @param density Palms per pixel² (0.02 = dense jungle)
 * @param palmScale Scale of individual palms (1.0 default)
 * @param seed Random seed
 */
export function generatePalmForestTexture(
  size = 512,
  density = 0.015,
  palmScale = 1.0,
  seed = 42,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  drawForestFloor(ctx, size, seed);

  const N_SPRITES = 60;
  const sprites: { oc: HTMLCanvasElement; ax: number; ay: number }[] = [];
  for (let i = 0; i < N_SPRITES; i++) {
    sprites.push(buildSprite(i % 3, i * 811 + 5555 + seed, palmScale));
  }

  const N = Math.floor(size * size * density);
  const r = rng(seed);
  const palms: { x: number; y: number; s: number; sp: number }[] = [];
  for (let i = 0; i < N; i++) {
    palms.push({ x: r() * size, y: r() * size, s: 0.28 + r() * 0.75, sp: Math.floor(r() * N_SPRITES) });
  }
  palms.sort((a, b) => a.y - b.y);

  for (const p of palms) {
    const { oc, ax, ay } = sprites[p.sp];
    const dw = Math.round(oc.width * p.s), dh = Math.round(oc.height * p.s);
    const dx = Math.round(p.x - ax * p.s), dy = Math.round(p.y - ay * p.s);
    for (const ox of [0, size, -size]) {
      for (const oy of [0, size, -size]) {
        const nx = dx + ox, ny = dy + oy;
        if (nx + dw < 0 || nx > size || ny + dh < 0 || ny > size) continue;
        ctx.drawImage(oc, nx, ny, dw, dh);
      }
    }
  }

  return canvas;
}
