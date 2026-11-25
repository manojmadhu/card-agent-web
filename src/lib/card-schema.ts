// Client-side mirror of cardagent/registry/models.py (CardFamily) for instant feedback while editing.
// The server remains authoritative: every save is validated again there (HTTP 422 on error).
import { z } from "zod"
import YAML from "yaml"
import type { CardFamily } from "@/api/types"

export const NORMALISE = ["digits", "upper", "alnum", "date_mm_yy", "date_dd_mm_yyyy", "emirates_id", "none"] as const
export const RULE_KINDS = ["regex", "not_expired", "emirates_id_format", "luhn", "prefix_matches_variant", "length", "lookup", "date_order"] as const
export const RULE_HELP: Record<(typeof RULE_KINDS)[number], string> = {
  regex: "value must fully match the field's regex",
  not_expired: "expiry date is today or later (valid to the end of the printed month)",
  emirates_id_format: "784-YYYY-NNNNNNN-C format",
  luhn: "Luhn checksum on the digits",
  prefix_matches_variant: "card number starts with the identified variant's number_prefix",
  length: "length within params.min / params.max",
  lookup: "issuer verification hook (skipped until a verifier is registered)",
  date_order: "this field ≤ params.other_field",
}

const rgb = z.tuple([z.number().int().min(0).max(255), z.number().int().min(0).max(255), z.number().int().min(0).max(255)])

export const variantSchema = z.object({
  id: z.string().min(1, "variant id is required").regex(/^[a-z0-9_-]+$/, "use lowercase letters, digits, _ or -"),
  name: z.string().min(1, "variant name is required"),
  body_color_rgb: rgb,
  keywords: z.array(z.string()).default([]),
  number_prefix: z.string().regex(/^\d*$/, "digits only").nullable().optional(),
})

export const fieldSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]*$/, "snake_case name, e.g. card_number"),
  roi: z
    .tuple([z.number(), z.number(), z.number(), z.number()])
    .refine(([x0, y0, x1, y1]) => 0 <= x0 && x0 < x1 && x1 <= 1 && 0 <= y0 && y0 < y1 && y1 <= 1, "roi must satisfy 0 ≤ x0 < x1 ≤ 1 and 0 ≤ y0 < y1 ≤ 1"),
  regex: z.string().min(1),
  required: z.boolean().default(true),
  normalise: z.enum(NORMALISE).default("none"),
  anchor: z.string().nullable().optional(),
  script: z.enum(["latin", "arabic"]).default("latin"),
  side: z.enum(["front", "back"]).optional(), // 2.1: default front
})

export const sideSchema = z.object({
  id: z.enum(["front", "back"]),
  required: z.boolean().nullable().optional(),
})

export const ruleSchema = z.object({
  type: z.enum(RULE_KINDS),
  field: z.string(),
  critical: z.boolean().default(false),
  params: z.record(z.string(), z.unknown()).default({}),
})

export const cardSchema = z
  .object({
    id: z.string().regex(/^[a-z]{2}\.[a-z0-9_]+$/, "id must look like ae.fazaa (country code, dot, lowercase name)"),
    country: z.string().regex(/^[A-Z]{2}$/, "ISO-3166 alpha-2, e.g. AE"),
    issuer: z.string().min(1, "issuer is required"),
    name: z.string().min(1, "name is required"),
    keywords: z.array(z.string()).min(1, "at least one keyword identifies the programme"),
    negative_keywords: z.array(z.string()).default([]),
    variants: z.array(variantSchema).min(1, "at least one variant"),
    fields: z.array(fieldSchema),
    rules: z.array(ruleSchema).default([]),
    schema_version: z.number().int().default(1),
    sides: z.array(sideSchema).optional(), // 2.1: default [{id: front}]
  })
  .superRefine((f, ctx) => {
    const ids = new Set<string>()
    f.variants.forEach((v, i) => {
      if (ids.has(v.id)) ctx.addIssue({ code: "custom", path: ["variants", i, "id"], message: `duplicate variant id "${v.id}"` })
      ids.add(v.id)
    })
    const names = new Set(f.fields.map((x) => x.name))
    f.fields.forEach((fd, i) => {
      try {
        new RegExp(pyRegexToJs(fd.regex))
      } catch (e) {
        ctx.addIssue({ code: "custom", path: ["fields", i, "regex"], message: `regex does not compile: ${(e as Error).message}` })
      }
    })
    f.rules.forEach((r, i) => {
      if (!names.has(r.field)) ctx.addIssue({ code: "custom", path: ["rules", i, "field"], message: `rule ${r.type} refers to unknown field "${r.field}"` })
      if (r.type === "date_order" && !names.has(String(r.params?.other_field ?? "")))
        ctx.addIssue({ code: "custom", path: ["rules", i, "params"], message: "date_order needs params.other_field naming a field" })
    })
    // two-sided cards (schema 2.1) — same checks as registry/models.py
    const sides = f.sides?.length ? f.sides : [{ id: "front" as const, required: null }]
    const seen = new Set<string>()
    sides.forEach((sd, i) => {
      if (seen.has(sd.id)) ctx.addIssue({ code: "custom", path: ["sides", i, "id"], message: `side "${sd.id}" is listed twice` })
      seen.add(sd.id)
    })
    f.fields.forEach((fd, i) => {
      const side = fd.side ?? "front"
      if (!seen.has(side)) ctx.addIssue({ code: "custom", path: ["fields", i, "side"], message: `field ${fd.name} is on side "${side}", which is not in sides` })
    })
    sides.forEach((sd, i) => {
      const req = f.fields.filter((fd) => fd.required && (fd.side ?? "front") === sd.id)
      if (sd.required === false && req.length)
        ctx.addIssue({ code: "custom", path: ["sides", i, "required"], message: `side ${sd.id} carries required field(s) ${req.map((x) => x.name).join(", ")}, so it cannot be required: false` })
    })
    if (f.country && f.id && !f.id.startsWith(f.country.toLowerCase() + "."))
      ctx.addIssue({ code: "custom", path: ["id"], message: `by convention the id starts with the country code (${f.country.toLowerCase()}.)` })
  })

/** Python named groups (?P<x>…) / (?P=x) → JS so the regex can be checked in the browser. */
export function pyRegexToJs(r: string) {
  return r.replace(/\(\?P</g, "(?<").replace(/\(\?P=(\w+)\)/g, "\\k<$1>")
}

export interface Issue {
  line: number
  path: string
  message: string
}

/** Parse YAML text and validate it as a CardFamily. Line numbers point into the YAML. */
export function parseCardYaml(text: string): { card?: CardFamily; issues: Issue[] } {
  const doc = YAML.parseDocument(text)
  const lines = lineIndex(text)
  if (doc.errors.length) return { issues: doc.errors.map((e) => ({ line: e.linePos?.[0]?.line ?? 1, path: "", message: e.message.split("\n")[0] })) }
  const res = cardSchema.safeParse(doc.toJS())
  if (res.success) return { card: res.data as CardFamily, issues: [] }
  return { issues: res.error.issues.map((iss) => ({ path: iss.path.join("."), message: iss.message, line: lineFor(doc, iss.path.map(String), lines) })) }
}

export function validateCard(card: unknown): Issue[] {
  const res = cardSchema.safeParse(card)
  return res.success ? [] : res.error.issues.map((i) => ({ path: i.path.join("."), message: i.message, line: 0 }))
}

/** Map a server 422 path (e.g. "fields.1.regex") to a YAML line. */
export function lineForPath(text: string, path: string): number {
  const doc = YAML.parseDocument(text)
  return lineFor(doc, path.split(".").filter(Boolean), lineIndex(text))
}

function lineIndex(text: string) {
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1)
  return starts
}

function lineFor(doc: YAML.Document, path: string[], starts: number[]) {
  for (let n = path.length; n >= 0; n--) {
    const key = path.slice(0, n).map((p) => (/^\d+$/.test(p) ? Number(p) : p))
    const node = doc.getIn(key, true) as { range?: [number, number, number] } | undefined
    if (node?.range) {
      const off = node.range[0]
      let lo = 0,
        hi = starts.length - 1
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        if (starts[mid] <= off) lo = mid
        else hi = mid - 1
      }
      return lo + 1
    }
  }
  return 1
}

/** Serialise a definition as readable YAML (short lists inline, like examples/cards/*.yaml). */
export function cardToYaml(card: CardFamily, header?: string): string {
  const clean: Record<string, unknown> = {
    id: card.id,
    country: card.country,
    issuer: card.issuer,
    name: card.name,
    schema_version: card.schema_version ?? 1,
    keywords: card.keywords,
    negative_keywords: card.negative_keywords ?? [],
    variants: card.variants.map((v) => ({ ...v, number_prefix: v.number_prefix ?? undefined })),
    // sides only when the card defines them (one-sided cards stay byte-compatible with 2.0 definitions)
    sides: card.sides?.length ? card.sides.map((sd) => ({ id: sd.id, required: sd.required ?? undefined })) : undefined,
    fields: card.fields.map((f) => ({ ...f, anchor: f.anchor ?? undefined, script: f.script === "latin" ? undefined : f.script, side: card.sides?.length ? f.side ?? "front" : f.side && f.side !== "front" ? f.side : undefined })),
    rules: card.rules.map((r) => ({ type: r.type, field: r.field, critical: r.critical || undefined, params: r.params && Object.keys(r.params).length ? r.params : undefined })),
  }
  const doc = new YAML.Document(clean)
  YAML.visit(doc, {
    Pair(_, pair) {
      const k = String((pair.key as YAML.Scalar)?.value ?? "")
      if (["keywords", "negative_keywords", "body_color_rgb", "roi"].includes(k) && YAML.isSeq(pair.value)) pair.value.flow = true
      if (k === "params" && YAML.isMap(pair.value)) pair.value.flow = true
      if (k === "rules" && YAML.isSeq(pair.value)) pair.value.items.forEach((it) => YAML.isMap(it) && (it.flow = true))
      if (k === "variants" && YAML.isSeq(pair.value)) pair.value.items.forEach((it) => YAML.isMap(it) && (it.flow = true))
      if (k === "sides" && YAML.isSeq(pair.value)) pair.value.items.forEach((it) => YAML.isMap(it) && (it.flow = true))
    },
  })
  return (header ? header + "\n" : "") + doc.toString({ lineWidth: 0 })
}

export const emptyCard = (): CardFamily => ({
  id: "",
  country: "AE",
  issuer: "",
  name: "",
  keywords: [],
  negative_keywords: [],
  variants: [{ id: "classic", name: "Classic", body_color_rgb: [24, 92, 160], keywords: ["CLASSIC"], number_prefix: "1" }],
  fields: [
    { name: "holder_name", roi: [0.05, 0.55, 0.75, 0.68], regex: "[A-Z][A-Z .'-]{2,40}", required: true, normalise: "upper", anchor: null, script: "latin" },
    { name: "card_number", roi: [0.05, 0.4, 0.75, 0.54], regex: "\\d{10}", required: true, normalise: "digits", anchor: null, script: "latin" },
    { name: "expiry_date", roi: [0.05, 0.72, 0.5, 0.86], regex: "(0[1-9]|1[0-2])/(\\d{2}|\\d{4})", required: true, normalise: "date_mm_yy", anchor: "EXP", script: "latin" },
  ],
  rules: [
    { type: "regex", field: "card_number", critical: true, params: {} },
    { type: "regex", field: "holder_name", critical: false, params: {} },
    { type: "not_expired", field: "expiry_date", critical: true, params: {} },
    { type: "prefix_matches_variant", field: "card_number", critical: false, params: {} },
  ],
  schema_version: 1,
})

/** Effective sides of a definition: required = explicit flag, else carries a required field, else only side. */
export function effectiveSides(card: Pick<CardFamily, "sides" | "fields">): { id: "front" | "back"; required: boolean; fields: string[] }[] {
  const sides = card.sides?.length ? card.sides : [{ id: "front" as const, required: null }]
  return sides.map((sd) => {
    const fields = card.fields.filter((f) => (f.side ?? "front") === sd.id)
    const required = sd.required ?? (fields.some((f) => f.required) || sides.length === 1)
    return { id: sd.id, required, fields: fields.map((f) => f.name) }
  })
}

export const isTwoSided = (card?: Pick<CardFamily, "sides"> | null) => (card?.sides?.length ?? 0) > 1
