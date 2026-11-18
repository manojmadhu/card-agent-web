// Synthetic card renderer — the browser twin of the MVP's tools/make_samples.py.
// It draws a card from a family YAML (colours, keywords, field ROIs) and returns the printed-text layer,
// which the in-browser OCR simulator reads (with degradation from blur / glare).
import type { Family, Variant } from "./schema"
import { CARD_H, CARD_W, type RGB, makeCanvas } from "./vision"

export interface PrintedToken {
  text: string
  box: [number, number, number, number] // fractions of the card
}

export interface CardSpec {
  title: string // big wordmark, e.g. "FAZAA"
  subtitle?: string // arabic / secondary keyword
  issuer?: string
  variantLabel?: string
  body: RGB
  seed: string
  fields: { roi: [number, number, number, number]; text: string; anchor?: string | null }[]
}

export interface PhotoFx {
  blur?: number // px gaussian
  glare?: { x: number; y: number; r: number } // fractions
  brightness?: number // multiplier
  noise?: number // 0..1
  rotate180?: boolean
  shift?: number // hue-ish colour cast, -1..1
}

export function hashStr(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function rng(seed: number) {
  let a = seed || 1
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const lum = ([r, g, b]: RGB) => (0.299 * r + 0.587 * g + 0.114 * b) / 255
const shade = ([r, g, b]: RGB, k: number): string =>
  `rgb(${Math.max(0, Math.min(255, r * k))},${Math.max(0, Math.min(255, g * k))},${Math.max(0, Math.min(255, b * k))})`

export function renderCard(spec: CardSpec): { canvas: HTMLCanvasElement; tokens: PrintedToken[] } {
  const c = makeCanvas(CARD_W, CARD_H)
  const ctx = c.getContext("2d", { willReadFrequently: true })!
  const W = CARD_W,
    H = CARD_H
  const rnd = rng(hashStr(spec.seed))
  const dark = lum(spec.body) < 0.5
  const ink = dark ? "rgba(255,255,255,0.95)" : "rgba(20,22,28,0.92)"
  const inkSoft = dark ? "rgba(255,255,255,0.65)" : "rgba(20,22,28,0.6)"
  const tokens: PrintedToken[] = []

  // body with soft diagonal gradient
  const grad = ctx.createLinearGradient(0, 0, W, H)
  grad.addColorStop(0, shade(spec.body, 1.08))
  grad.addColorStop(1, shade(spec.body, 0.9))
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  // family emblem — deterministic per family seed so all variants of a family share layout features
  const kind = hashStr(spec.seed) % 4
  ctx.save()
  ctx.globalAlpha = 0.18
  ctx.strokeStyle = dark ? "#fff" : "#000"
  ctx.fillStyle = dark ? "#fff" : "#000"
  const cx = W * (0.72 + rnd() * 0.08),
    cy = H * (0.3 + rnd() * 0.1)
  if (kind === 0) {
    for (let r = 40; r < 260; r += 28) {
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.stroke()
    }
  } else if (kind === 1) {
    ctx.lineWidth = 14
    for (let i = -6; i < 14; i++) {
      ctx.beginPath()
      ctx.moveTo(W * 0.5 + i * 40, 0)
      ctx.lineTo(W * 0.5 + i * 40 + 300, H)
      ctx.stroke()
    }
  } else if (kind === 2) {
    for (let i = 0; i < 5; i++) {
      ctx.beginPath()
      ctx.moveTo(cx - 200, cy - 120 + i * 60)
      ctx.lineTo(cx, cy - 40 + i * 60)
      ctx.lineTo(cx + 200, cy - 120 + i * 60)
      ctx.lineWidth = 16
      ctx.stroke()
    }
  } else {
    for (let i = 0; i < 6; i++) {
      ctx.beginPath()
      const s = 60 + i * 34
      ctx.rect(cx - s, cy - s * 0.6, s * 2, s * 1.2)
      ctx.lineWidth = 5
      ctx.stroke()
    }
  }
  ctx.restore()

  // chip-like block (shared feature of many membership cards)
  ctx.fillStyle = dark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.12)"
  ctx.beginPath()
  ctx.roundRect(W * 0.82, H * 0.52, 110, 80, 12)
  ctx.fill()

  // header band
  ctx.fillStyle = dark ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.35)"
  ctx.fillRect(0, 0, W, H * 0.2)

  const put = (text: string, x: number, y: number, size: number, weight = 700, color = ink, align: CanvasTextAlign = "left", font = "Inter, Arial, sans-serif") => {
    ctx.font = `${weight} ${size}px ${font}`
    ctx.textAlign = align
    ctx.textBaseline = "middle"
    ctx.fillStyle = color
    ctx.fillText(text, x, y)
    const w = ctx.measureText(text).width
    const x0 = align === "right" ? x - w : x
    tokens.push({ text, box: [x0 / W, (y - size / 2) / H, (x0 + w) / W, (y + size / 2) / H] })
  }

  put(spec.title.toUpperCase(), W * 0.05, H * 0.1, 58, 800)
  if (spec.subtitle) put(spec.subtitle, W * 0.95, H * 0.1, 44, 700, ink, "right", "Tahoma, Arial, sans-serif")
  if (spec.variantLabel) put(spec.variantLabel.toUpperCase(), W * 0.95, H * 0.28, 34, 700, inkSoft, "right")
  if (spec.issuer) put(spec.issuer, W * 0.05, H * 0.27, 22, 500, inkSoft)

  for (const f of spec.fields) {
    const [x0, y0, , y1] = f.roi
    const size = Math.min(44, (y1 - y0) * H * 0.62)
    const y = ((y0 + y1) / 2) * H
    let x = x0 * W + 8
    if (f.anchor) {
      put(f.anchor, x, y, size * 0.6, 600, inkSoft)
      ctx.font = `600 ${size * 0.6}px Inter, Arial`
      x += ctx.measureText(f.anchor).width + 14
    }
    put(f.text, x, y, size, 600, ink, "left", "'JetBrains Mono', 'Courier New', monospace")
  }
  return { canvas: c, tokens }
}

/** Turn a clean render into a "phone photo" — blur, glare, exposure, noise, upside-down. */
export function photoify(src: HTMLCanvasElement, fx: PhotoFx, seed = 1): HTMLCanvasElement {
  const c = makeCanvas(src.width, src.height)
  const ctx = c.getContext("2d", { willReadFrequently: true })!
  ctx.save()
  if (fx.rotate180) {
    ctx.translate(c.width, c.height)
    ctx.rotate(Math.PI)
  }
  ctx.filter = [fx.blur ? `blur(${fx.blur}px)` : "", fx.brightness ? `brightness(${fx.brightness})` : "", fx.shift ? `hue-rotate(${fx.shift * 25}deg)` : ""]
    .filter(Boolean)
    .join(" ") || "none"
  ctx.drawImage(src, 0, 0)
  ctx.restore()
  if (fx.glare) {
    const g = ctx.createRadialGradient(fx.glare.x * c.width, fx.glare.y * c.height, 0, fx.glare.x * c.width, fx.glare.y * c.height, fx.glare.r * c.width)
    g.addColorStop(0, "rgba(255,255,255,1)")
    g.addColorStop(0.55, "rgba(255,255,255,0.97)")
    g.addColorStop(1, "rgba(255,255,255,0)")
    ctx.fillStyle = g
    ctx.fillRect(0, 0, c.width, c.height)
  }
  const n = fx.noise ?? 0.04
  if (n > 0) {
    const d = ctx.getImageData(0, 0, c.width, c.height)
    const r = rng(seed)
    for (let i = 0; i < d.data.length; i += 4) {
      const k = (r() - 0.5) * 255 * n
      d.data[i] += k
      d.data[i + 1] += k
      d.data[i + 2] += k
    }
    ctx.putImageData(d, 0, 0)
  }
  return c
}

const NAMES = ["AHMED ALI HASSAN", "FATIMA SAEED", "OMAR KHALID", "MARIAM YOUSEF", "SARA AL MANSOORI", "NOURA SALEM", "YOUSEF IBRAHIM", "KHALID RASHID", "HESSA AL ZAABI", "RASHED OBAID"]

export interface CardValues {
  [field: string]: string
}

/** Sample value for a field given its definition (used to render references for new families). */
export function sampleValue(field: { name: string; regex: string; normalise?: string }, variant: Variant, i: number): string {
  const r = rng(hashStr(field.name + variant.id + i))
  const digits = (n: number) => Array.from({ length: n }, () => Math.floor(r() * 10)).join("")
  if (field.normalise === "upper" || /name/.test(field.name)) return NAMES[Math.floor(r() * NAMES.length)]
  if (field.normalise === "date_mm_yy" || /exp|date/.test(field.name)) return `0${1 + Math.floor(r() * 9)}/${28 + Math.floor(r() * 3)}`
  if (field.normalise === "emirates_id" || /emirates/.test(field.name)) return `784-19${70 + Math.floor(r() * 30)}-${digits(7)}-${Math.floor(r() * 10)}`
  const m = field.regex.match(/\\d\{(\d+)\}/)
  const len = m ? +m[1] : 10
  const pre = variant.number_prefix ?? ""
  return pre + digits(Math.max(0, len - pre.length))
}

export function specFor(f: Family, v: Variant, values: CardValues, seedExtra = ""): CardSpec {
  const arabic = f.keywords.find((k) => /[؀-ۿ]/.test(k))
  return {
    title: f.keywords.find((k) => !/[؀-ۿ]/.test(k)) ?? f.family_name,
    subtitle: arabic,
    issuer: f.issuer,
    variantLabel: v.keywords.find((k) => !/[؀-ۿ]/.test(k)) ?? v.name,
    body: v.body_color_rgb as RGB,
    seed: f.family + seedExtra,
    fields: f.fields.map((fd) => ({ roi: fd.roi as [number, number, number, number], text: values[fd.name] ?? "", anchor: fd.anchor })),
  }
}

/** Synthetic reference images for a variant (the MVP renders 3 per variant). */
export function renderReferences(f: Family, v: Variant, n = 3) {
  return Array.from({ length: n }, (_, i) => {
    const values: CardValues = {}
    f.fields.forEach((fd) => (values[fd.name] = sampleValue(fd, v, i)))
    const { canvas, tokens } = renderCard(specFor(f, v, values))
    return { canvas: photoify(canvas, { noise: 0.02 }, i + 1), tokens, values }
  })
}
