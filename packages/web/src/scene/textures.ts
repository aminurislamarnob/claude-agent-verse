import * as THREE from "three";
import type { SkyLook } from "./daylight";
import { hash } from "./theme";

// ── Procedural screen & decor textures ───────────────────────
// Drawn once on a canvas and cached. Screens use token bars rather than
// literal text: at office distance they read as real code instead of noise.

export type ScreenKind = "code" | "terminal" | "design" | "dashboard" | "browser";

const cache = new Map<string, THREE.CanvasTexture>();

function make(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, data = false) {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  // bump and roughness maps hold data, not colour
  tex.colorSpace = data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cache.set(key, tex);
  return tex;
}

/** Redraws a cached canvas texture in place. */
function redraw(tex: THREE.CanvasTexture, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const canvas = tex.image as HTMLCanvasElement;
  draw(canvas.getContext("2d")!, canvas.width, canvas.height);
  tex.needsUpdate = true;
}

function rand(seed: number) {
  let s = seed || 1;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) | 0;
    return ((s >>> 0) % 10000) / 10000;
  };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

const syntax = ["#c792ea", "#82aaff", "#c3e88d", "#f78c6c", "#89ddff", "#ffcb6b", "#d4d4d8", "#d4d4d8", "#d4d4d8"];

function codeLines(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, seed: number, lineH = 14) {
  const r = rand(seed);
  let indent = 0;
  for (let y = y0, n = 1; y < y0 + h - lineH; y += lineH, n++) {
    ctx.fillStyle = "#4b5263";
    ctx.fillRect(x0, y + 4, n >= 10 ? 12 : 7, 5);
    if (r() < 0.12) continue;
    if (r() < 0.25 && indent < 4) indent++;
    else if (r() < 0.25 && indent > 0) indent--;
    let x = x0 + 26 + indent * 16;
    const tokens = 1 + Math.floor(r() * 5);
    for (let t = 0; t < tokens && x < x0 + w - 20; t++) {
      const tw = 10 + r() * 48;
      ctx.fillStyle = syntax[Math.floor(r() * syntax.length)];
      roundRect(ctx, x, y + 3, Math.min(tw, x0 + w - x - 8), 7, 3);
      x += tw + 6;
    }
  }
}

function drawCode(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  ctx.fillStyle = "#1e2028";
  ctx.fillRect(0, 0, w, h);
  // sidebar file tree
  ctx.fillStyle = "#181a21";
  ctx.fillRect(0, 0, 70, h);
  const r = rand(seed + 7);
  for (let y = 40; y < h; y += 16) {
    ctx.fillStyle = r() < 0.15 ? "#82aaff" : "#5c6370";
    roundRect(ctx, 10 + (r() < 0.4 ? 10 : 0), y, 24 + r() * 26, 6, 3);
  }
  // tabs
  ctx.fillStyle = "#16181e";
  ctx.fillRect(70, 0, w - 70, 26);
  ctx.fillStyle = "#1e2028";
  ctx.fillRect(76, 4, 92, 22);
  ctx.fillStyle = "#d97757";
  roundRect(ctx, 84, 11, 8, 8, 2);
  ctx.fillStyle = "#c8ccd4";
  roundRect(ctx, 98, 12, 54, 6, 3);
  ctx.fillStyle = "#5c6370";
  roundRect(ctx, 182, 12, 44, 6, 3);
  codeLines(ctx, 82, 34, w - 90, h - 34, seed);
}

function drawTerminal(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  ctx.fillStyle = "#121318";
  ctx.fillRect(0, 0, w, h);
  const r = rand(seed);
  for (let y = 16; y < h - 12; y += 15) {
    const prompt = r() < 0.22;
    let x = 14;
    if (prompt) {
      ctx.fillStyle = "#d97757";
      roundRect(ctx, x, y, 8, 7, 2);
      x += 14;
    }
    const parts = 1 + Math.floor(r() * 4);
    for (let p = 0; p < parts; p++) {
      const pw = 14 + r() * 60;
      ctx.fillStyle = prompt ? "#e5e7eb" : r() < 0.15 ? "#86efac" : r() < 0.1 ? "#fca5a5" : "#7c8494";
      roundRect(ctx, x, y, Math.min(pw, w - x - 12), 7, 3);
      x += pw + 7;
      if (x > w - 30) break;
    }
  }
}

function drawDesign(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  const r = rand(seed);
  ctx.fillStyle = "#2c2c2c";
  ctx.fillRect(0, 0, w, h);
  // canvas area
  ctx.fillStyle = "#e9e9ec";
  ctx.fillRect(64, 22, w - 128, h - 22);
  // layers & properties panels
  for (const px of [0, w - 64]) {
    ctx.fillStyle = "#2c2c2c";
    ctx.fillRect(px, 22, 64, h);
    for (let y = 34; y < h; y += 14) {
      ctx.fillStyle = r() < 0.2 ? "#0d99ff" : "#6b6b6b";
      roundRect(ctx, px + 8, y, 20 + r() * 30, 5, 2);
    }
  }
  // frames: phone screens + a desktop frame
  const accents = ["#5b6cff", "#d97757", "#14a38b", "#c2549d", "#e0a526"];
  const accent = accents[Math.floor(r() * accents.length)];
  const frames = [
    [86, 46, 70, 130],
    [168, 46, 70, 130],
    [250, 46, w - 336, 130],
  ];
  for (const [x, y, fw, fh] of frames) {
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, x, y, fw, fh, 6);
    ctx.fillStyle = accent;
    roundRect(ctx, x + 6, y + 8, fw - 12, fh * 0.32, 4);
    ctx.fillStyle = "#d4d4d8";
    for (let i = 0; i < 4; i++) roundRect(ctx, x + 6, y + fh * 0.42 + i * 11, (fw - 12) * (0.5 + r() * 0.5), 5, 2);
    ctx.fillStyle = "#18181b";
    roundRect(ctx, x + 6, y + fh - 22, fw * 0.45, 13, 6);
  }
  // selection outline
  ctx.strokeStyle = "#0d99ff";
  ctx.lineWidth = 2;
  ctx.strokeRect(166, 44, 74, 134);
  // top toolbar
  ctx.fillStyle = "#1e1e1e";
  ctx.fillRect(0, 0, w, 22);
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i === 1 ? "#0d99ff" : "#8a8a8a";
    roundRect(ctx, 10 + i * 18, 7, 10, 9, 2);
  }
  // sticky note row below
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = ["#fde68a", "#bbf7d0", "#fbcfe8", "#bfdbfe"][i];
    roundRect(ctx, 90 + i * 60, 196, 50, 40, 3);
  }
}

function drawDashboard(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  const r = rand(seed);
  ctx.fillStyle = "#14151a";
  ctx.fillRect(0, 0, w, h);
  const tiles = [
    ["#5b6cff", 0.72],
    ["#14a38b", 0.54],
    ["#d97757", 0.38],
    ["#e0a526", 0.86],
  ] as const;
  const tw = (w - 50) / 4;
  tiles.forEach(([c, v], i) => {
    const x = 10 + i * (tw + 10);
    ctx.fillStyle = "#1f2128";
    roundRect(ctx, x, 12, tw, 56, 6);
    ctx.fillStyle = "#6b7280";
    roundRect(ctx, x + 10, 22, tw * 0.4, 6, 3);
    ctx.fillStyle = "#f4f4f5";
    roundRect(ctx, x + 10, 36, tw * 0.5, 14, 4);
    ctx.fillStyle = c;
    roundRect(ctx, x + 10, 56, (tw - 20) * v, 5, 2);
  });
  // line chart
  ctx.fillStyle = "#1f2128";
  roundRect(ctx, 10, 80, w * 0.62, h - 92, 6);
  ctx.strokeStyle = "#2a2d36";
  ctx.lineWidth = 1;
  for (let y = 100; y < h - 20; y += 22) {
    ctx.beginPath();
    ctx.moveTo(20, y);
    ctx.lineTo(w * 0.62, y);
    ctx.stroke();
  }
  for (const [color, amp] of [["#5b6cff", 1], ["#d97757", 0.6]] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    let v = 0.5;
    for (let x = 20; x < w * 0.62; x += 12) {
      v = Math.min(0.95, Math.max(0.1, v + (r() - 0.45) * 0.18 * amp));
      const y = h - 24 - v * (h - 130);
      x === 20 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // bar chart
  const bx = w * 0.62 + 20;
  ctx.fillStyle = "#1f2128";
  roundRect(ctx, bx, 80, w - bx - 10, h - 92, 6);
  for (let i = 0; i < 7; i++) {
    const bh = 20 + r() * (h - 140);
    ctx.fillStyle = i === 5 ? "#d97757" : "#3f4452";
    roundRect(ctx, bx + 14 + i * ((w - bx - 30) / 7), h - 22 - bh, (w - bx - 30) / 7 - 6, bh, 3);
  }
}

function drawBrowser(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  const r = rand(seed);
  ctx.fillStyle = "#f4f4f5";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#e4e4e7";
  ctx.fillRect(0, 0, w, 24);
  for (const [i, c] of ["#ff5f57", "#febc2e", "#28c840"].entries()) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(12 + i * 12, 12, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, 60, 6, w - 120, 12, 6);
  // WordPress-ish admin layout
  ctx.fillStyle = "#1d2327";
  ctx.fillRect(0, 24, 54, h);
  for (let y = 40; y < h; y += 16) {
    ctx.fillStyle = y === 72 ? "#3858e9" : "#8c8f94";
    roundRect(ctx, 10, y, 30, 6, 3);
  }
  ctx.fillStyle = "#3858e9";
  roundRect(ctx, 70, 40, w * 0.4, 70, 6);
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, 82, 56, w * 0.24, 10, 4);
  roundRect(ctx, 82, 74, w * 0.16, 7, 3);
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, 70 + i * ((w - 90) / 3), 124, (w - 110) / 3, h - 140, 6);
    ctx.fillStyle = ["#fde68a", "#c7d2fe", "#bbf7d0"][i];
    roundRect(ctx, 78 + i * ((w - 90) / 3), 132, (w - 126) / 3, 40, 4);
    ctx.fillStyle = "#d4d4d8";
    for (let l = 0; l < 3; l++) roundRect(ctx, 78 + i * ((w - 90) / 3), 182 + l * 12, ((w - 126) / 3) * (0.5 + r() * 0.5), 5, 2);
  }
}

/** A screen texture. `variant` picks the layout seed so neighbouring desks differ. */
export function screenTexture(kind: ScreenKind, variant: string): THREE.CanvasTexture {
  const seed = hash(kind + variant) % 7;
  const tall = kind === "code" || kind === "terminal";
  return make(`${kind}:${seed}`, 512, tall ? 640 : 320, (ctx, w, h) => {
    if (kind === "code") drawCode(ctx, w, h, seed + 3);
    else if (kind === "terminal") drawTerminal(ctx, w, h, seed + 11);
    else if (kind === "design") drawDesign(ctx, w, h, seed + 5);
    else if (kind === "dashboard") drawDashboard(ctx, w, h, seed + 9);
    else drawBrowser(ctx, w, h, seed + 13);
  });
}

/** Whiteboard covered in wireframes, flow arrows and sticky notes. */
export function whiteboardTexture() {
  return make("whiteboard", 1024, 512, (ctx, w, h) => {
    ctx.fillStyle = "#fbfbfa";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#2b2f38";
    ctx.lineWidth = 4;
    ctx.lineJoin = "round";
    const box = (x: number, y: number, bw: number, bh: number) => {
      ctx.strokeRect(x, y, bw, bh);
    };
    // user flow
    const nodes: [number, number][] = [[60, 70], [270, 70], [480, 70], [690, 70]];
    nodes.forEach(([x, y], i) => {
      box(x, y, 150, 96);
      ctx.fillStyle = "#2b2f38";
      ctx.fillRect(x + 16, y + 18, 70, 8);
      ctx.fillRect(x + 16, y + 36, 110, 5);
      ctx.fillRect(x + 16, y + 48, 90, 5);
      if (i < nodes.length - 1) {
        ctx.beginPath();
        ctx.moveTo(x + 156, y + 48);
        ctx.lineTo(x + 204, y + 48);
        ctx.lineTo(x + 194, y + 40);
        ctx.moveTo(x + 204, y + 48);
        ctx.lineTo(x + 194, y + 56);
        ctx.stroke();
      }
    });
    // phone wireframes
    for (let i = 0; i < 3; i++) {
      const x = 70 + i * 150;
      box(x, 220, 110, 220);
      ctx.strokeRect(x + 12, 240, 86, 60);
      ctx.beginPath();
      ctx.moveTo(x + 12, 240);
      ctx.lineTo(x + 98, 300);
      ctx.moveTo(x + 98, 240);
      ctx.lineTo(x + 12, 300);
      ctx.stroke();
      ctx.fillStyle = "#2b2f38";
      for (let l = 0; l < 4; l++) ctx.fillRect(x + 12, 318 + l * 18, 60 + ((l * 23) % 26), 5);
      ctx.strokeStyle = "#d97757";
      ctx.strokeRect(x + 12, 400, 86, 24);
      ctx.strokeStyle = "#2b2f38";
    }
    // sticky notes
    const notes = ["#fde68a", "#bbf7d0", "#fbcfe8", "#bfdbfe", "#fde68a", "#fed7aa"];
    notes.forEach((c, i) => {
      const x = 560 + (i % 3) * 140;
      const y = 230 + Math.floor(i / 3) * 130;
      ctx.save();
      ctx.translate(x + 55, y + 55);
      ctx.rotate(((i * 37) % 9 - 4) * 0.012);
      ctx.fillStyle = c;
      ctx.fillRect(-55, -55, 110, 110);
      ctx.fillStyle = "rgba(43,47,56,0.65)";
      ctx.fillRect(-40, -30, 70, 6);
      ctx.fillRect(-40, -14, 56, 6);
      ctx.fillRect(-40, 2, 64, 6);
      ctx.restore();
    });
  });
}

const skylineLook = new Map<string, string>();

/**
 * The city outside the windows: one backdrop texture behind the whole window
 * band, redrawn in place as the daylight changes. `aspect` is the band's
 * width over its height, so buildings keep their proportions in a long room.
 */
export function skylineTexture(sky: SkyLook, aspect: number): THREE.CanvasTexture {
  const h = 512;
  const w = Math.min(4096, Math.max(1024, Math.round((h * aspect) / 256) * 256));
  const key = `skyline:${w}`;
  const look = JSON.stringify(sky, (_, v) => (typeof v === "number" ? Math.round(v * 50) / 50 : v));
  const hit = cache.get(key);
  if (!hit) {
    skylineLook.set(key, look);
    return make(key, w, h, (ctx) => drawSkyline(ctx, w, h, sky));
  }
  if (skylineLook.get(key) !== look) {
    skylineLook.set(key, look);
    redraw(hit, (ctx) => drawSkyline(ctx, w, h, sky));
  }
  return hit;
}

function drawSkyline(ctx: CanvasRenderingContext2D, w: number, h: number, sky: SkyLook) {
  const horizon = h * 0.66;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, sky.top);
  g.addColorStop(0.45, mixHex(sky.top, sky.horizon, 0.55));
  g.addColorStop(0.66, sky.horizon);
  g.addColorStop(0.8, sky.glow);
  g.addColorStop(1, sky.glow);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const r = rand(42);
  // stars fade in with the night
  if (sky.stars > 0.01) {
    for (let i = 0; i < 160; i++) {
      const x = r() * w;
      const y = r() * h * 0.55;
      const a = sky.stars * (0.35 + 0.65 * r());
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
      const s = r() < 0.15 ? 2.2 : 1.3;
      ctx.fillRect(x, y, s, s);
    }
  } else for (let i = 0; i < 160 * 3; i++) r(); // keep the sequence aligned
  // a low sun in the west is seen through the windows; higher up it is just light
  if (sky.sun > 0 && sky.sun < 0.5) {
    const sx = w * 0.64;
    const sy = horizon - sky.sun * h * 0.9;
    const glow = ctx.createRadialGradient(sx, sy, 10, sx, sy, h * 0.5);
    glow.addColorStop(0, hexAlpha(sky.sunColor, 0.85));
    glow.addColorStop(0.25, hexAlpha(sky.sunColor, 0.25));
    glow.addColorStop(1, hexAlpha(sky.sunColor, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = sky.sunColor;
    ctx.beginPath();
    ctx.arc(sx, sy, h * 0.055, 0, Math.PI * 2);
    ctx.fill();
  }
  if (sky.moon) {
    const mx = w * 0.28;
    const my = h * 0.2;
    const glow = ctx.createRadialGradient(mx, my, 4, mx, my, h * 0.18);
    glow.addColorStop(0, "rgba(220,228,255,0.35)");
    glow.addColorStop(1, "rgba(220,228,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#e9edf8";
    ctx.beginPath();
    ctx.arc(mx, my, h * 0.03, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = sky.top;
    ctx.beginPath();
    ctx.arc(mx + h * 0.014, my - h * 0.008, h * 0.026, 0, Math.PI * 2);
    ctx.fill();
  }

  // unlit windows reflect the sky by day and go dark at night
  const dark = Math.min(1, Math.max(0, (sky.lit - 0.1) / 0.6));
  const litColor = "#ffdca3";
  const layers: [string, number, number, number, number][] = [
    // colour, min top, max top, min width, max width (tops as a share of h)
    [sky.far, 0.4, 0.62, 46, 110],
    [sky.near, 0.3, 0.7, 80, 190],
  ];
  layers.forEach(([color, topMin, topMax, wMin, wMax], layer) => {
    let x = -20;
    while (x < w) {
      const bw = wMin + r() * (wMax - wMin);
      const top = h * (topMin + r() * (topMax - topMin));
      ctx.fillStyle = color;
      ctx.fillRect(x, top, bw, h - top);
      // roof furniture on the near layer
      if (layer === 1 && r() < 0.5) {
        ctx.fillRect(x + bw * 0.2, top - 9, bw * 0.25, 9);
        if (r() < 0.4) ctx.fillRect(x + bw * 0.7, top - 22, 2, 22);
      }
      const cols = Math.max(1, Math.floor((bw - 12) / 15));
      const pitch = (bw - 12) / cols;
      const cell = Math.min(8, pitch - 5);
      for (let wy = top + 12; wy < h * 0.9; wy += 17)
        for (let c = 0; c < cols; c++) {
          const wx = x + 8 + c * pitch;
          const on = r() < sky.lit * (layer ? 1 : 0.8);
          if (on) {
            ctx.fillStyle = hexAlpha(litColor, 0.55 + 0.4 * dark);
          } else {
            ctx.fillStyle = `rgba(${Math.round(225 - 200 * dark)},${Math.round(236 - 215 * dark)},${Math.round(252 - 225 * dark)},${(0.42 - 0.2 * dark).toFixed(2)})`;
          }
          ctx.fillRect(wx, wy, cell, 9);
        }
      x += bw + 3 + r() * 6;
    }
  });
  // street: a dark road with trees along it and lamps once it gets dark
  const street = h * 0.9;
  ctx.fillStyle = mixHex(sky.near, "#000000", 0.35);
  ctx.fillRect(0, street, w, h - street);
  const leaf = mixHex("#3f6e48", sky.near, 0.45 * dark);
  for (let x = 30; x < w; x += 70 + r() * 90) {
    const rad = 16 + r() * 14;
    ctx.fillStyle = mixHex(sky.near, "#000", 0.5);
    ctx.fillRect(x - 2, street - 6, 4, 12);
    ctx.fillStyle = leaf;
    ctx.beginPath();
    ctx.arc(x, street - rad * 0.9, rad, 0, Math.PI * 2);
    ctx.arc(x - rad * 0.6, street - rad * 0.55, rad * 0.7, 0, Math.PI * 2);
    ctx.arc(x + rad * 0.6, street - rad * 0.5, rad * 0.65, 0, Math.PI * 2);
    ctx.fill();
    if (dark > 0.3 && r() < 0.5) {
      ctx.fillStyle = `rgba(255,214,150,${(dark * 0.9).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(x + 32, street - 24, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

const _c1 = new THREE.Color();
const _c2 = new THREE.Color();
function mixHex(a: string, b: string, t: number) {
  return "#" + _c1.set(a).lerp(_c2.set(b), t).getHexString();
}
function hexAlpha(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`;
}

/** Wall poster / neon artwork. */
export function posterTexture(kind: "ship" | "grid" | "pixel") {
  return make(`poster:${kind}`, 256, 340, (ctx, w, h) => {
    if (kind === "ship") {
      ctx.fillStyle = "#1d1f24";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#d97757";
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.4, 62, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f4f2ee";
      ctx.font = "800 46px -apple-system, BlinkMacSystemFont, 'SF Pro Display', Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("SHIP IT", w / 2, h * 0.8);
      ctx.font = "500 14px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillStyle = "#9aa0aa";
      ctx.fillText("git push --no-fear", w / 2, h * 0.88);
    } else if (kind === "grid") {
      ctx.fillStyle = "#f4f2ee";
      ctx.fillRect(0, 0, w, h);
      const cols = ["#5b6cff", "#d97757", "#14a38b", "#e0a526", "#1d1f24", "#c2549d"];
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 3; x++) {
          ctx.fillStyle = cols[(x + y * 2) % cols.length];
          const s = 60;
          const px = 28 + x * 70;
          const py = 30 + y * 72;
          if ((x + y) % 2) roundRect(ctx, px, py, s, s, 30);
          else roundRect(ctx, px, py, s, s, 8);
        }
    } else {
      ctx.fillStyle = "#14151a";
      ctx.fillRect(0, 0, w, h);
      const sprite = ["..1111..", ".111111.", "11.11.11", "11111111", "1.1111.1", "1.1..1.1", "..1..1.."];
      const px = 22;
      sprite.forEach((row, y) =>
        [...row].forEach((c, x) => {
          if (c === "1") {
            ctx.fillStyle = "#8b5cf6";
            ctx.fillRect(40 + x * px, 60 + y * px, px - 2, px - 2);
          }
        }),
      );
      ctx.fillStyle = "#f4f2ee";
      ctx.font = "700 22px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "center";
      ctx.fillText("PLAYER 1 READY", w / 2, h * 0.85);
    }
  });
}

interface Plank {
  x: number;
  y: number;
  w: number;
  h: number;
  shade: number;
  warm: number;
  knot: [number, number] | null;
  grain: number[];
}

let plankLayout: Plank[] | null = null;
const WOOD_W = 1024;
const WOOD_H = 1024;
const PLANK_ROWS = 16;

/** The plank layout is shared by the colour and bump maps so grooves line up with seams. */
function planks(): Plank[] {
  if (plankLayout) return plankLayout;
  const r = rand(7);
  const list: Plank[] = [];
  const ph = WOOD_H / PLANK_ROWS;
  for (let row = 0; row < PLANK_ROWS; row++) {
    let x = -((row * 173) % 420);
    while (x < WOOD_W) {
      const pw = 300 + r() * 320;
      list.push({
        x,
        y: row * ph,
        w: pw,
        h: ph,
        shade: 0.86 + r() * 0.2,
        warm: r() * 2 - 1,
        knot: r() < 0.12 ? [x + 40 + r() * (pw - 80), row * ph + ph * (0.3 + r() * 0.4)] : null,
        grain: Array.from({ length: 7 }, () => r()),
      });
      x += pw;
    }
  }
  return (plankLayout = list);
}

/**
 * Oak floor: planks with their own tint, wavy grain, the odd knot and dark seams.
 * Repeat-wrapped; set `repeat` on both maps so three units span one copy.
 */
export function woodTexture(): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const map = make("wood", WOOD_W, WOOD_H, (ctx, w, h) => {
    ctx.fillStyle = "rgb(205,185,155)";
    ctx.fillRect(0, 0, w, h);
    for (const p of planks()) {
      const base = [219 + p.warm * 9, 199 + p.warm * 3, 170 - p.warm * 8].map((c) => Math.round(Math.min(255, c * p.shade)));
      ctx.fillStyle = `rgb(${base.join(",")})`;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      // grain: long wavy strokes, a few darker streaks
      ctx.lineWidth = 1;
      p.grain.forEach((g, i) => {
        const gy = p.y + 4 + g * (p.h - 8);
        ctx.strokeStyle = i % 3 === 0 ? "rgba(110, 80, 50, 0.18)" : "rgba(120, 92, 60, 0.09)";
        ctx.beginPath();
        ctx.moveTo(p.x, gy);
        ctx.bezierCurveTo(p.x + p.w * 0.3, gy + (g - 0.5) * 6, p.x + p.w * 0.7, gy - (g - 0.5) * 5, p.x + p.w, gy + (g - 0.5) * 2);
        ctx.stroke();
      });
      if (p.knot) {
        const [kx, ky] = p.knot;
        for (let i = 3; i > 0; i--) {
          ctx.strokeStyle = `rgba(95, 65, 40, ${0.12 * i})`;
          ctx.beginPath();
          ctx.ellipse(kx, ky, 6 * i, 3.5 * i, 0.3, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = "rgba(95, 65, 40, 0.35)";
        ctx.beginPath();
        ctx.ellipse(kx, ky, 4, 2.5, 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      // end joint
      ctx.fillStyle = "rgba(80, 60, 40, 0.28)";
      ctx.fillRect(p.x + p.w - 1.5, p.y, 2, p.h);
    }
    // row seams
    ctx.fillStyle = "rgba(80, 60, 40, 0.26)";
    for (let row = 0; row <= PLANK_ROWS; row++) ctx.fillRect(0, (row * h) / PLANK_ROWS - 1, w, 2);
  });
  const bump = make(
    "wood-bump",
    WOOD_W,
    WOOD_H,
    (ctx, w, h) => {
      ctx.fillStyle = "rgb(128,128,128)";
      ctx.fillRect(0, 0, w, h);
      for (const p of planks()) {
        // slight cupping across each plank: a hair higher in the middle
        const g = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
        g.addColorStop(0, "rgb(120,120,120)");
        g.addColorStop(0.5, "rgb(134,134,134)");
        g.addColorStop(1, "rgb(120,120,120)");
        ctx.fillStyle = g;
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.lineWidth = 1;
        p.grain.forEach((gr, i) => {
          const gy = p.y + 4 + gr * (p.h - 8);
          ctx.strokeStyle = i % 3 === 0 ? "rgba(90,90,90,0.5)" : "rgba(110,110,110,0.4)";
          ctx.beginPath();
          ctx.moveTo(p.x, gy);
          ctx.bezierCurveTo(p.x + p.w * 0.3, gy + (gr - 0.5) * 6, p.x + p.w * 0.7, gy - (gr - 0.5) * 5, p.x + p.w, gy + (gr - 0.5) * 2);
          ctx.stroke();
        });
        ctx.fillStyle = "rgb(60,60,60)";
        ctx.fillRect(p.x + p.w - 2, p.y, 3, p.h);
      }
      ctx.fillStyle = "rgb(60,60,60)";
      for (let row = 0; row <= PLANK_ROWS; row++) ctx.fillRect(0, (row * h) / PLANK_ROWS - 1.5, w, 3);
    },
    true,
  );
  map.wrapS = map.wrapT = bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  return { map, bump };
}

/** Large porcelain floor tiles with grout, for the kitchen corner. Repeat-wrapped; four tiles per copy. */
export function tileTexture() {
  const tex = make("tiles", 512, 512, (ctx, w, h) => {
    const r = rand(99);
    ctx.fillStyle = "#b3aea6";
    ctx.fillRect(0, 0, w, h);
    const n = 4;
    const t = w / n;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const v = 222 + Math.round((r() - 0.5) * 10);
        ctx.fillStyle = `rgb(${v},${v - 2},${v - 6})`;
        ctx.fillRect(x * t + 2, y * t + 2, t - 4, t - 4);
        // faint stone veining
        ctx.strokeStyle = "rgba(150,145,138,0.25)";
        ctx.lineWidth = 1;
        for (let k = 0; k < 3; k++) {
          const sx = x * t + r() * t;
          const sy = y * t + r() * t;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.bezierCurveTo(sx + 30, sy + (r() - 0.5) * 30, sx + 50, sy + (r() - 0.5) * 40, sx + 90, sy + (r() - 0.5) * 20);
          ctx.stroke();
        }
      }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Plain analogue clock face: minute ticks, bold hour marks and four numerals. */
export function clockFaceTexture() {
  return make("clock-face", 256, 256, (ctx, w, h) => {
    const c = w / 2;
    ctx.fillStyle = "#fbfaf7";
    ctx.beginPath();
    ctx.arc(c, c, c, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#2b2f38";
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const hour = i % 5 === 0;
      ctx.lineWidth = hour ? 4 : 1.5;
      const r0 = hour ? c - 26 : c - 16;
      ctx.beginPath();
      ctx.moveTo(c + Math.sin(a) * r0, c - Math.cos(a) * r0);
      ctx.lineTo(c + Math.sin(a) * (c - 8), c - Math.cos(a) * (c - 8));
      ctx.stroke();
    }
    ctx.fillStyle = "#2b2f38";
    ctx.font = "600 34px -apple-system, BlinkMacSystemFont, 'SF Pro Display', Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("12", c, 48);
    ctx.fillText("3", w - 48, c + 2);
    ctx.fillText("6", c, h - 46);
    ctx.fillText("9", 48, c + 2);
  });
}

/** Illuminated EXIT sign over the door. */
export function exitSignTexture() {
  return make("exit", 256, 96, (ctx, w, h) => {
    ctx.fillStyle = "#1f9d55";
    roundRect(ctx, 0, 0, w, h, 8);
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 58px -apple-system, BlinkMacSystemFont, 'SF Pro Display', Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("EXIT", 22, h / 2 + 3);
    // arrow
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 9;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(176, h / 2);
    ctx.lineTo(232, h / 2);
    ctx.moveTo(212, h / 2 - 20);
    ctx.lineTo(232, h / 2);
    ctx.lineTo(212, h / 2 + 20);
    ctx.stroke();
  });
}

/** Team sign: colour swatch, project name and a live count line. */
export function signTexture(name: string, detail: string, color: string, alert: boolean) {
  return make(`sign:${name}:${detail}:${color}:${alert}`, 800, 220, (ctx, w, h) => {
    ctx.fillStyle = "#fbfaf7";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(38, 46, 52, 52, 14);
    ctx.fill();
    ctx.fillStyle = "#1d1f24";
    ctx.font = "700 76px -apple-system, BlinkMacSystemFont, 'SF Pro Display', Inter, sans-serif";
    ctx.textBaseline = "middle";
    let label = name;
    while (ctx.measureText(label).width > w - 140 && label.length > 4) label = label.slice(0, -2);
    if (label !== name) label = label.slice(0, -1) + "…";
    ctx.fillText(label, 112, 74);
    ctx.font = "500 46px -apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, sans-serif";
    ctx.fillStyle = alert ? "#b45309" : "#868b95";
    ctx.fillText(detail, 40, 162);
  });
}

/** Lettered plate with the room's name, mounted high on the back wall. */
export function nameplateTexture(name: string, color: string) {
  return make(`nameplate:${name}:${color}`, 1024, 160, (ctx, w, h) => {
    ctx.fillStyle = "#1d1f24";
    roundRect(ctx, 0, 0, w, h, 24);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(86, h / 2, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f4f2ee";
    ctx.font = "700 84px -apple-system, BlinkMacSystemFont, 'SF Pro Display', Inter, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(name, 142, h / 2 + 4, w - 180);
  });
}

/** Flip scoreboard for the play zone. */
export function scoreboardTexture() {
  return make("scoreboard", 512, 256, (ctx, w, h) => {
    ctx.fillStyle = "#1d1f24";
    roundRect(ctx, 0, 0, w, h, 28);
    ctx.font = "600 30px -apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#868b95";
    ctx.fillText("BREAK  POINT", w / 2, 40);
    for (const [i, n] of ["11", "09"].entries()) {
      const x = 46 + i * 236;
      ctx.fillStyle = "#2b2e35";
      roundRect(ctx, x, 70, 184, 150, 16);
      ctx.fillStyle = i ? "#ff8a5c" : "#f4f2ee";
      ctx.font = "700 120px 'SF Mono', ui-monospace, Menlo, monospace";
      ctx.fillText(n, x + 92, 150);
      ctx.fillStyle = "#1d1f24";
      ctx.fillRect(x, 144, 184, 4);
    }
  });
}
