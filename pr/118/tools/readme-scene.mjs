// The picture the fake camera sees in tools/readme-shots.mjs: a lake at the end of the afternoon, drawn in code
// so the README's photos belong to nobody else. scene(t) returns a W x H RGB buffer; t in [0, 1) moves the boat.
// Run directly to write a preview: node tools/readme-scene.mjs out.ppm

export const W = 960, H = 720;

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/* cheap value noise, fixed seed: soft clouds and the ripples on the water */
function noise1(x) { const i = Math.floor(x), f = x - i, h = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }; return h(i) + (h(i + 1) - h(i)) * f * f * (3 - 2 * f); }
function noise2(x, y) {
  const h = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = h(i, j), b = h(i + 1, j), c = h(i, j + 1), d = h(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y) => noise2(x, y) * 0.55 + noise2(x * 2.1, y * 2.1) * 0.3 + noise2(x * 4.3, y * 4.3) * 0.15;

const HORIZON = 0.6 * H;                       /* where the water starts */
const SUN = { x: 0.66 * W, y: 0.3 * H, r: 0.065 * H };
const far = (x) => 0.44 * H - 70 * noise1(x / 140) - 40 * noise1(x / 55 + 9) - 90 * Math.exp(-(((x - 0.22 * W) / 120) ** 2));
const near = (x) => 0.53 * H - 35 * noise1(x / 80 + 3) - 55 * Math.exp(-(((x - 0.3 * W) / 90) ** 2));
const trees = (x) => HORIZON - 8 - 22 * Math.abs(Math.sin(x / 13)) * noise1(x / 30) - 14 * noise1(x / 9);

/* the pagoda on the near hill: seven tiers, each roof wider than the wall under it */
const PAGODA = { x: 0.3 * W, base: near(0.3 * W) + 6, tier: 15 };
function pagoda(x, y) {
  const dx = Math.abs(x - PAGODA.x), top = PAGODA.base - PAGODA.tier * 7;
  if (y < top - 22) return false;
  if (y < top) return dx < 1.5;                                            /* the spire */
  if (y > PAGODA.base) return false;
  const k = Math.floor((PAGODA.base - y) / PAGODA.tier), f = ((PAGODA.base - y) % PAGODA.tier) / PAGODA.tier;
  const wall = 16 - k * 1.6, roof = wall + 9 - f * 6;
  return f > 0.62 ? dx < roof : dx < wall;
}

function sky(x, y) {
  const k = y / HORIZON;
  let c = mix([92, 132, 190], [236, 184, 140], smooth(0.15, 1, k));      /* blue overhead, warm at the horizon */
  const d = Math.hypot(x - SUN.x, y - SUN.y);
  c = mix(c, [255, 222, 170], 0.55 * Math.exp(-((d / (SUN.r * 3.2)) ** 2)));
  if (d < SUN.r) c = mix([255, 244, 214], c, smooth(SUN.r - 2, SUN.r, d));
  const cl = smooth(0.55, 0.78, fbm(x / 170, y / 45)) * smooth(0.05, 0.25, k) * (1 - smooth(0.7, 0.95, k));
  return mix(c, [248, 226, 214], cl * 0.8);
}

function land(x, y) {
  if (pagoda(x, y)) return [44, 38, 46];
  if (y > trees(x)) return mix([34, 58, 40], [22, 40, 30], noise2(x / 6, y / 6));
  if (y > near(x)) return mix([66, 96, 70], [48, 76, 56], (y - near(x)) / 60);
  if (y > far(x)) return mix([128, 136, 168], [104, 120, 150], (y - far(x)) / 120);
  return null;
}

function boat(x, y, t) {
  const bx = 0.18 * W + t * 0.5 * W, by = HORIZON + 0.16 * H;
  const dx = x - bx, dy = y - by;
  if (dy > -6 && dy < 6 && Math.abs(dx) < 46 - (dy + 6) * 1.4) return [40, 30, 32];                   /* hull */
  if (dy <= -6 && dy > -78 && dx > -2 && dx < (dy + 78) * 0.5) return [250, 240, 222];               /* sail */
  if (dy <= -6 && dy > -84 && dx > -4 && dx < -1) return [60, 44, 40];                               /* mast */
  return null;
}

export function scene(t = 0) {
  const out = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let c;
    if (y < HORIZON) c = land(x, y) || sky(x, y);
    else {
      /* the water: the scene above mirrored, shifted by ripples, darker and bluer further down */
      const depth = (y - HORIZON) / (H - HORIZON);
      const sx = x + 10 * (noise2(x / 40, y / 3) - 0.5) * (0.3 + depth);
      const my = 2 * HORIZON - y - 2;
      c = land(sx, my) || sky(sx, my);
      c = mix(c, [40, 70, 96], 0.25 + 0.4 * depth);
      const glint = Math.abs(x - SUN.x) < 30 + 60 * depth && noise2(x / 9, y / 1.5) > 0.72 ? 0.5 : 0;
      c = mix(c, [255, 236, 200], glint * (1 - depth));
    }
    const b = boat(x, y, t);
    if (b) c = b;
    const i = (y * W + x) * 3;
    out[i] = clamp(c[0]); out[i + 1] = clamp(c[1]); out[i + 2] = clamp(c[2]);
  }
  return out;
}

/* RGB -> YUV 4:2:0 (BT.601 full range, as C420jpeg means), frames of a y4m clip */
export function y4m(frames = 10) {
  const parts = [Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`)];
  for (let f = 0; f < frames; f++) {
    const rgb = scene(f / frames), Y = Buffer.alloc(W * H), U = Buffer.alloc(W * H / 4), V = Buffer.alloc(W * H / 4);
    for (let i = 0; i < W * H; i++) Y[i] = clamp(Math.round(0.299 * rgb[i * 3] + 0.587 * rgb[i * 3 + 1] + 0.114 * rgb[i * 3 + 2]));
    for (let y = 0; y < H / 2; y++) for (let x = 0; x < W / 2; x++) {
      let r = 0, g = 0, b = 0;
      for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const i = ((y * 2 + oy) * W + x * 2 + ox) * 3; r += rgb[i]; g += rgb[i + 1]; b += rgb[i + 2]; }
      r /= 4; g /= 4; b /= 4;
      U[y * W / 2 + x] = clamp(Math.round(128 - 0.168736 * r - 0.331264 * g + 0.5 * b));
      V[y * W / 2 + x] = clamp(Math.round(128 + 0.5 * r - 0.418688 * g - 0.081312 * b));
    }
    parts.push(Buffer.from("FRAME\n"), Y, U, V);
  }
  return Buffer.concat(parts);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(process.argv[2] || "scene.ppm", Buffer.concat([Buffer.from(`P6 ${W} ${H} 255\n`), scene(0.4)]));
}
