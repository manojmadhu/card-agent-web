// [3] OCR. The browser demo has no OCR engine (Tesseract runs in the card-agent service).
// For synthetic samples we "read" the renderer's printed-text layer and degrade it realistically:
// glare wipes tokens under the hotspot, blur lowers confidence and swaps look-alike characters.
// For uploaded photos the operator can type the printed text, or switch to API mode for real OCR.
import { hashStr, rng, type PhotoFx, type PrintedToken } from "./render"

export interface OcrToken {
  text: string
  conf: number
  box: [number, number, number, number] | null
}

const SWAPS: Record<string, string> = { O: "0", "0": "O", I: "1", "1": "I", S: "5", B: "8", Z: "2" }

export function simulateOcr(tokens: PrintedToken[], fx: PhotoFx, orientation: 0 | 180): OcrToken[] {
  const upside = !!fx.rotate180 !== (orientation === 180)
  const r = rng(hashStr(tokens.map((t) => t.text).join("|")) + orientation)
  if (upside) {
    // reading an upside-down card: mostly garbage at low confidence
    return tokens.slice(0, 5).map((t) => ({ text: t.text.split("").reverse().join("").replace(/[A-Z]/g, () => "~#%&"[Math.floor(r() * 4)]), conf: 0.12 + r() * 0.15, box: t.box }))
  }
  const out: OcrToken[] = []
  const blur = fx.blur ?? 0
  for (const t of tokens) {
    const cx = (t.box[0] + t.box[2]) / 2,
      cy = (t.box[1] + t.box[3]) / 2
    let conf = 0.93 + r() * 0.05 - blur * 0.09
    if (fx.glare) {
      const d = Math.hypot((cx - fx.glare.x) * 1.586, cy - fx.glare.y) // card aspect
      if (d < fx.glare.r * 1.3) continue // washed out — token lost
      if (d < fx.glare.r * 1.8) conf -= 0.25
    }
    if (fx.brightness && fx.brightness < 0.55) conf -= (0.55 - fx.brightness) * 1.2
    let text = t.text
    const swapRate = Math.max(0, 0.9 - conf) * 0.6
    if (swapRate > 0) text = text.replace(/[A-Z0-9]/g, (ch) => (SWAPS[ch] && r() < swapRate ? SWAPS[ch] : ch))
    if (conf < 0.3) continue
    out.push({ text, conf: +Math.max(0.05, Math.min(0.99, conf)).toFixed(3), box: t.box })
  }
  return out
}

export function manualOcr(text: string): OcrToken[] {
  return text
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => ({ text: l, conf: 0.9, box: null }))
}
