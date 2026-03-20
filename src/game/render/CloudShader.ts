/**
 * Volumetric cloud shader — inspired by spite/DgQzLv codepen.
 * Reference: https://codepen.io/spite/pen/DgQzLv
 *
 * FBM noise-based clouds rendered as fullscreen overlay.
 * Each cloud region has random 25-75% transparency.
 * No rotation — 2D top-down view emulating 3D depth.
 */

export const CLOUD_FRAG_SHADER = `
precision mediump float;

uniform float time;
uniform vec2 resolution;
uniform vec2 camera;
uniform float zoom;
uniform vec2 wind;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1, 0)), f.x),
    mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 6; i++) {
    v += a * noise(p);
    p = rot * p * 2.0 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  uv.y = 1.0 - uv.y;

  // World position from camera
  vec2 worldPos = camera + (uv - 0.5) * resolution / zoom;

  // Cloud layer coordinates — drift with wind
  vec2 p = worldPos * 0.0015 + wind * time * 0.015;

  // Primary cloud shape — large features
  float shape = fbm(p);

  // Detail layer — smaller features for texture
  float detail = fbm(p * 3.0 + vec2(42.0, 17.0));

  // Combined density — HIGH threshold so only peaks form clouds
  float density = shape * 0.65 + detail * 0.35;

  // Cloud mask: only where density is high (sparse clouds, not full coverage)
  // Threshold 0.52 means ~30-40% of area has clouds
  float cloudMask = smoothstep(0.52, 0.72, density);

  // Skip fully transparent pixels early
  if (cloudMask < 0.01) {
    gl_FragColor = vec4(0.0);
    return;
  }

  // Per-cloud-region random alpha (25-75%)
  // Use low-frequency noise as "cloud ID" for consistent alpha per cloud blob
  float cloudId = noise(worldPos * 0.0005 + vec2(100.0, 200.0));
  float alphaVariation = 0.25 + cloudId * 0.50; // 0.25 to 0.75

  // Lighting: top of cloud brighter (sun), bottom darker (shadow)
  float light = 0.80 + 0.20 * smoothstep(0.5, 0.7, shape);

  // Cloud color: white with slight gray/blue variation in shadows
  vec3 col = mix(
    vec3(0.78, 0.80, 0.85),  // shadow (cool gray-blue)
    vec3(1.0, 1.0, 1.0),      // highlight (pure white)
    light
  );

  // Edge softness — clouds fade at edges
  float edgeSoft = smoothstep(0.0, 0.15, cloudMask);

  // Shadow on ground beneath cloud (offset slightly)
  vec2 shadowP = (worldPos + vec2(8.0, 12.0)) * 0.0015 + wind * time * 0.015;
  float shadowShape = fbm(shadowP);
  float shadowDetail = fbm(shadowP * 3.0 + vec2(42.0, 17.0));
  float shadowDensity = shadowShape * 0.65 + shadowDetail * 0.35;
  float shadowMask = smoothstep(0.52, 0.72, shadowDensity) * 0.08;

  // Final: cloud + ground shadow
  float finalAlpha = cloudMask * edgeSoft * alphaVariation;

  // Where no cloud but shadow exists, darken ground
  if (finalAlpha < 0.01 && shadowMask > 0.01) {
    gl_FragColor = vec4(0.0, 0.0, 0.02, shadowMask);
    return;
  }

  gl_FragColor = vec4(col, finalAlpha);
}
`;

export const CLOUD_SHADER_KEY = "cloud_volumetric";
