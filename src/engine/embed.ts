// Visual "embedding" used for the reference search.
// Prototype (no model, same spirit as the MVP's ORB + colour-histogram signature):
//   36-d hue×saturation histogram  +  40-d luminance layout grid  +  32-d gradient-orientation histogram
// → 108-d, L2-normalised. Production swaps this for a local DINOv2/CLIP embedder; the search API is the same.
import { getPixels, toGray } from "./vision"

export const EMBED_DIM = 108
export const EMBEDDER_NAME = "classic-hsv-grid-hog-108"

function l2(v: Float32Array, w = 1) {
  let s = 0
  for (const x of v) s += x * x
  const n = Math.sqrt(s) || 1
  for (let i = 0; i < v.length; i++) v[i] = (v[i] / n) * w
  return v
}

export function embed(c: HTMLCanvasElement): number[] {
  const W = 64,
    H = 40
  const d = getPixels(c, W, H)
  const g = toGray(d)

  // 1) hue × saturation histogram (12 × 3)
  const hs = new Float32Array(36)
  for (let i = 0, p = 0; i < W * H; i++, p += 4) {
    const r = d.data[p] / 255,
      gg = d.data[p + 1] / 255,
      b = d.data[p + 2] / 255
    const mx = Math.max(r, gg, b),
      mn = Math.min(r, gg, b)
    const v = mx,
      s = mx === 0 ? 0 : (mx - mn) / mx
    if (v < 0.12) {
      hs[0] += 0.5 // very dark pixels → shared "black" bin
      continue
    }
    let h = 0
    if (mx !== mn) {
      if (mx === r) h = ((gg - b) / (mx - mn)) % 6
      else if (mx === gg) h = (b - r) / (mx - mn) + 2
      else h = (r - gg) / (mx - mn) + 4
      h = (h * 60 + 360) % 360
    }
    const hb = Math.min(11, Math.floor(h / 30))
    const sb = s < 0.18 ? 0 : s < 0.5 ? 1 : 2
    hs[sb === 0 ? 0 + (v > 0.6 ? 1 : 2) : hb * 3 + sb] += 1
  }

  // 2) luminance layout grid 8 × 5, mean-subtracted
  const grid = new Float32Array(40)
  const cw = W / 8,
    ch = H / 5
  for (let gy = 0; gy < 5; gy++)
    for (let gx = 0; gx < 8; gx++) {
      let s = 0
      for (let y = gy * ch; y < (gy + 1) * ch; y++) for (let x = gx * cw; x < (gx + 1) * cw; x++) s += g[y * W + x]
      grid[gy * 8 + gx] = s / (cw * ch)
    }
  const m = grid.reduce((a, b) => a + b, 0) / 40
  for (let i = 0; i < 40; i++) grid[i] -= m

  // 3) gradient orientation histogram, 2 × 2 quadrants × 8 bins
  const hog = new Float32Array(32)
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const gx = g[y * W + x + 1] - g[y * W + x - 1]
      const gy = g[(y + 1) * W + x] - g[(y - 1) * W + x]
      const mag = Math.hypot(gx, gy)
      if (mag < 4) continue
      const ang = (Math.atan2(gy, gx) + Math.PI) % Math.PI // unsigned
      const bin = Math.min(7, Math.floor((ang / Math.PI) * 8))
      const q = (y < H / 2 ? 0 : 2) + (x < W / 2 ? 0 : 1)
      hog[q * 8 + bin] += mag
    }

  const out = new Float32Array(EMBED_DIM)
  out.set(l2(hs, Math.sqrt(0.5)), 0)
  out.set(l2(grid, Math.sqrt(0.25)), 36)
  out.set(l2(hog, Math.sqrt(0.25)), 76)
  l2(out)
  return Array.from(out, (x) => +x.toFixed(5))
}

export function cosine(a: number[], b: number[]) {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}
