// Formatting helpers: dates, percentages, PII masking, reason codes.

export const pct = (v: number | null | undefined, digits = 1) => (v == null ? "—" : `${(v * 100).toFixed(digits)}%`)
export const num = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString())
export const ms = (v: number | null | undefined) => (v == null ? "—" : v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`)

export function dateTime(v: string | number | null | undefined) {
  if (v == null) return "—"
  const d = typeof v === "number" ? new Date(v * 1000) : new Date(v)
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })
}

export function relTime(v: string | number | null | undefined) {
  if (v == null) return "—"
  const t = typeof v === "number" ? v * 1000 : new Date(v).getTime()
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 45) return "just now"
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} d ago`
}

/** YYYY-MM-DD for <input type=date> and API filters. */
export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
export const daysAgo = (n: number) => isoDay(new Date(Date.now() - n * 86400000))

/** Card / ID numbers: keep the last 4 characters. Names: initials. */
export function maskValue(field: string, value: string | null | undefined, masked: boolean) {
  if (!value) return value ?? "—"
  if (!masked) return value
  if (/name/i.test(field)) return value.split(/\s+/).map((w) => w[0] + "•".repeat(Math.max(1, w.length - 1))).join(" ")
  if (/number|id|eid|account/i.test(field) && value.replace(/\D/g, "").length >= 6) return "•".repeat(Math.max(0, value.length - 4)) + value.slice(-4)
  return value
}

const REASON_TEXT: Record<string, string> = {
  RETAKE_REQUIRED: "Photo must be retaken",
  INVALID_IMAGE: "Not a readable image",
  UNKNOWN_CARD_TYPE: "Card programme not recognised",
  AMBIGUOUS_CARD_TYPE: "Two programmes are too close to call",
  AMBIGUOUS_VARIANT: "Variant could not be decided",
  FIELD_UNREADABLE: "Required field unreadable",
  LOW_CONFIDENCE: "Field read with low confidence",
  RULE_FAILED: "Validation rule failed",
  CARD_EXPIRED: "Card is expired",
  IMAGE_BLURRY: "Photo is blurry",
  BAD_EXPOSURE: "Too dark or too bright",
  GLARE: "Glare on the card",
  LOW_RESOLUTION: "Resolution too low",
  NO_CARD_FOUND: "No card found in the photo",
}

export function reasonLabel(code: string) {
  const [head, ...rest] = code.split(":")
  const base = REASON_TEXT[head] ?? head.replace(/_/g, " ").toLowerCase()
  return rest.length ? `${base} — ${rest.join(" · ")}` : base
}

export const rgbHex = (c?: number[] | null) => (c ? "#" + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, "0")).join("") : "#000000")
export const hexRgb = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
