// [6] field normalisation and [7] declarative validation rules — same rule types as cardagent/validate.py
import type { FieldDef, RuleDef, Variant } from "./schema"

export function normaliseValue(raw: string, how: FieldDef["normalise"]): string {
  const s = raw.trim()
  switch (how) {
    case "upper":
      return s.toUpperCase().replace(/\s+/g, " ")
    case "digits":
      return s.replace(/[\sO]/g, (c) => (c === "O" ? "0" : "")).replace(/\D/g, "")
    case "date_mm_yy": {
      const m = s.match(/(0[1-9]|1[0-2])\s*[/.-]\s*(\d{4}|\d{2})/)
      return m ? `${m[1]}/${m[2]}` : s
    }
    case "emirates_id": {
      const d = s.replace(/\D/g, "")
      return d.length === 15 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 14)}-${d.slice(14)}` : s
    }
    default:
      return s
  }
}

/** MM/YY → ISO last day of month (cards are valid through the end of the printed month). */
export function expiryIso(v: string): string | null {
  const m = v.match(/^(0[1-9]|1[0-2])\/(\d{2}|\d{4})$/)
  if (!m) return null
  const y = m[2].length === 2 ? 2000 + +m[2] : +m[2]
  const mo = +m[1]
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate()
  return `${y}-${String(mo).padStart(2, "0")}-${String(last).padStart(2, "0")}`
}

export function luhn(num: string) {
  let s = 0,
    alt = false
  for (let i = num.length - 1; i >= 0; i--) {
    let d = +num[i]
    if (alt) {
      d *= 2
      if (d > 9) d -= 9
    }
    s += d
    alt = !alt
  }
  return num.length > 0 && s % 10 === 0
}

export interface RuleResult {
  rule: string
  field: string
  result: "pass" | "fail" | "skip"
  critical: boolean
  reason?: string
}

export function runRule(r: RuleDef, fields: Record<string, { value: string | null }>, fieldDefs: FieldDef[], variant: Variant | null, now = new Date()): RuleResult {
  const base = { rule: r.type, field: r.field, critical: r.critical }
  const v = fields[r.field]?.value ?? null
  if (r.type === "lookup") return { ...base, result: "skip", reason: "LOOKUP_NOT_CONFIGURED" }
  if (v == null || v === "") return { ...base, result: "skip", reason: "FIELD_MISSING" }
  switch (r.type) {
    case "regex": {
      const def = fieldDefs.find((f) => f.name === r.field)
      const ok = def ? new RegExp(def.regex).test(v) : false
      return { ...base, result: ok ? "pass" : "fail", reason: ok ? undefined : "FORMAT_INVALID" }
    }
    case "not_expired": {
      const iso = expiryIso(v) ?? (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)
      if (!iso) return { ...base, result: "fail", reason: "DATE_UNPARSEABLE" }
      const ok = new Date(iso + "T23:59:59Z") >= now
      return { ...base, result: ok ? "pass" : "fail", reason: ok ? undefined : "CARD_EXPIRED" }
    }
    case "date_order": {
      const o = r.other_field ? fields[r.other_field]?.value : null
      if (!o) return { ...base, result: "skip", reason: "FIELD_MISSING" }
      const a = expiryIso(o) ?? o,
        b = expiryIso(v) ?? v
      const ok = a <= b
      return { ...base, result: ok ? "pass" : "fail", reason: ok ? undefined : "DATE_ORDER_INVALID" }
    }
    case "luhn": {
      const ok = luhn(v.replace(/\D/g, ""))
      return { ...base, result: ok ? "pass" : "fail", reason: ok ? undefined : "CHECKSUM_FAILED" }
    }
    case "emirates_id_format": {
      const ok = /^784-\d{4}-\d{7}-\d$/.test(v)
      return { ...base, result: ok ? "pass" : "fail", reason: ok ? undefined : "EMIRATES_ID_INVALID" }
    }
    case "prefix_matches_variant": {
      if (!variant || !variant.number_prefix) return { ...base, result: "skip", reason: "NO_PREFIX_RULE" }
      const ok = v.startsWith(variant.number_prefix)
      return { ...base, result: ok ? "pass" : "fail", reason: ok ? undefined : "PREFIX_VARIANT_MISMATCH" }
    }
  }
  return { ...base, result: "skip" }
}
