// Pixel-level helpers that run in the browser (Canvas ImageData). These mirror the MVP's
// cardagent/quality.py, normalise.py and the colour / visual signals in classify.py.

export const CARD_W = 1012
export const CARD_H = 638

export type RGB = [number, number, number]

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas")
  c.width = w
  c.height = h
  return c
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image()
    im.onload = () => res(im)
    im.onerror = () => rej(new Error("could not decode image"))
    im.src = src
  })
}

/** [2] Normalise — fit to the ISO ID-1 canvas (1012×638). Centre-crop when the aspect ratio differs. */
export function normalise(img: CanvasImageSource & { width: number; height: number }, rotate180 = false): HTMLCanvasElement {
  const c = makeCanvas(CARD_W, CARD_H)
  const ctx = c.getContext("2d", { willReadFrequently: true })!
  const target = CARD_W / CARD_H
  const src = img.width / img.height
  let sw = img.width,
    sh = img.height,
    sx = 0,
    sy = 0
  if (src > target) {
    sw = img.height * target
    sx = (img.width - sw) / 2
  } else if (src < target) {
    sh = img.width / target
    sy = (img.height - sh) / 2
  }
  if (rotate180) {
    ctx.translate(CARD_W, CARD_H)
    ctx.rotate(Math.PI)
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, CARD_W, CARD_H)
  return c
}

export function getPixels(c: HTMLCanvasElement, w = c.width, h = c.height): ImageData {
  if (w === c.width && h === c.height) return c.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, w, h)
  const t = makeCanvas(w, h)
  const ctx = t.getContext("2d", { willReadFrequently: true })!
  ctx.drawImage(c, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h)
}

export function toGray(d: ImageData): Float32Array {
  const g = new Float32Array(d.width * d.height)
  for (let i = 0, p = 0; i < g.length; i++, p += 4) g[i] = 0.299 * d.data[p] + 0.587 * d.data[p + 1] + 0.114 * d.data[p + 2]
  return g
}

export interface Quality {
  blur: number // variance of Laplacian (higher = sharper)
  brightness: number // 0..1 mean luminance
  glare_ratio: number // fraction of near-white saturated pixels
  width: number
  height: number
}

/** [1] Quality gate measurements. Computed on a 506×319 downscale (like the MVP) for speed. */
export function measureQuality(c: HTMLCanvasElement, origW: number, origH: number): Quality {
  const d = getPixels(c, 506, 319)
  const g = toGray(d)
  const w = d.width,
    h = d.height
  let sum = 0,
    sumSq = 0,
    n = 0,
    bright = 0,
    glare = 0
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const lap = g[i - 1] + g[i + 1] + g[i - w] + g[i + w] - 4 * g[i]
      sum += lap
      sumSq += lap * lap
      n++
    }
  for (let i = 0; i < g.length; i++) {
    bright += g[i]
    if (g[i] > 245) glare++
  }
  const mean = sum / n
  return {
    blur: +(sumSq / n - mean * mean).toFixed(1),
    brightness: +(bright / g.length / 255).toFixed(3),
    glare_ratio: +(glare / g.length).toFixed(4),
    width: origW,
    height: origH,
  }
}

/** Typical colour of the plain card body, sampled from a border strip (text rarely sits there). */
export function bodyColour(c: HTMLCanvasElement): RGB {
  const d = getPixels(c, 202, 128)
  const rs: number[] = [],
    gs: number[] = [],
    bs: number[] = []
  const strip = 8
  for (let y = 0; y < d.height; y++)
    for (let x = 0; x < d.width; x++) {
      if (x > strip && x < d.width - strip && y > strip && y < d.height - strip) continue
      const p = (y * d.width + x) * 4
      rs.push(d.data[p])
      gs.push(d.data[p + 1])
      bs.push(d.data[p + 2])
    }
  const med = (a: number[]) => a.sort((p, q) => p - q)[a.length >> 1]
  return [med(rs), med(gs), med(bs)]
}

// sRGB → CIE Lab (D65). Lab distance tracks perceived colour difference better than RGB.
export function rgbToLab([r, g, b]: RGB): [number, number, number] {
  const lin = (v: number) => {
    v /= 255
    return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92
  }
  const R = lin(r),
    G = lin(g),
    B = lin(b)
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))]
}

export function labDistance(a: RGB, b: RGB) {
  const A = rgbToLab(a),
    B = rgbToLab(b)
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2])
}

export function colourScore(a: RGB, b: RGB, scale = 25) {
  return Math.exp(-labDistance(a, b) / scale)
}

export function rgbHex([r, g, b]: RGB) {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")
}

export function hexRgb(hex: string): RGB {
  const m = hex.replace("#", "")
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)]
}
