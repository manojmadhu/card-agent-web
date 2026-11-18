// Card-family YAML schema — mirrors card-agent/registry/<family>.yaml exactly.
import { z } from "zod"
import YAML from "yaml"

const rgb = z.tuple([z.number().int().min(0).max(255), z.number().int().min(0).max(255), z.number().int().min(0).max(255)])
const roi = z
  .tuple([z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1)])
  .refine(([x0, y0, x1, y1]) => x1 > x0 && y1 > y0, "roi must be [x0, y0, x1, y1] with x1>x0 and y1>y0")

export const RULE_TYPES = [
  "regex",
  "not_expired",
  "date_order",
  "luhn",
  "emirates_id_format",
  "prefix_matches_variant",
  "lookup",
] as const

export const NORMALISERS = ["upper", "digits", "date_mm_yy", "emirates_id", "none"] as const

export const variantSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/, "lowercase id (a-z, 0-9, _ -)"),
  name: z.string().min(1),
  body_color_rgb: rgb,
  keywords: z.array(z.string()).default([]),
  number_prefix: z.string().regex(/^\d*$/, "digits only").default(""),
})

export const fieldSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]*$/, "snake_case field name"),
  roi,
  regex: z.string().min(1),
  required: z.boolean().default(false),
  normalise: z.enum(NORMALISERS).default("none"),
  anchor: z.string().nullable().optional(),
})

export const ruleSchema = z.object({
  type: z.enum(RULE_TYPES),
  field: z.string(),
  critical: z.boolean().default(false),
  other_field: z.string().optional(),
})

export const familySchema = z
  .object({
    family: z.string().regex(/^[a-z0-9_-]+$/, "lowercase id"),
    family_name: z.string().min(1),
    issuer: z.string().default(""),
    schema_version: z.number().int().default(1),
    keywords: z.array(z.string()).min(1, "at least one keyword is needed to identify the family"),
    negative_keywords: z.array(z.string()).default([]),
    weights: z
      .object({ text: z.number().min(0).max(1), visual: z.number().min(0).max(1), colour: z.number().min(0).max(1) })
      .default({ text: 0.55, visual: 0.3, colour: 0.15 }),
    variants: z.array(variantSchema).min(1, "at least one variant"),
    fields: z.array(fieldSchema).default([]),
    rules: z.array(ruleSchema).default([]),
  })
  .superRefine((f, ctx) => {
    const sum = f.weights.text + f.weights.visual + f.weights.colour
    if (Math.abs(sum - 1) > 0.011) ctx.addIssue({ code: "custom", path: ["weights"], message: `weights must sum to 1 (got ${sum.toFixed(2)})` })
    const ids = new Set<string>()
    f.variants.forEach((v, i) => {
      if (ids.has(v.id)) ctx.addIssue({ code: "custom", path: ["variants", i, "id"], message: `duplicate variant id "${v.id}"` })
      ids.add(v.id)
    })
    const names = new Set(f.fields.map((x) => x.name))
    f.fields.forEach((fd, i) => {
      try {
        new RegExp(fd.regex)
      } catch {
        ctx.addIssue({ code: "custom", path: ["fields", i, "regex"], message: `invalid regex: ${fd.regex}` })
      }
    })
    f.rules.forEach((r, i) => {
      if (!names.has(r.field)) ctx.addIssue({ code: "custom", path: ["rules", i, "field"], message: `rule references unknown field "${r.field}"` })
    })
  })

export type Variant = z.infer<typeof variantSchema>
export type FieldDef = z.infer<typeof fieldSchema>
export type RuleDef = z.infer<typeof ruleSchema>
export type Family = z.infer<typeof familySchema>

export interface YamlIssue {
  line: number
  message: string
  path: string
}

/** Parse + validate YAML text. Returns the family or a list of issues with line numbers. */
export function parseFamilyYaml(text: string): { family?: Family; issues: YamlIssue[] } {
  const doc = YAML.parseDocument(text, { prettyErrors: true })
  const lc = new LineCounter(text)
  if (doc.errors.length) {
    return { issues: doc.errors.map((e) => ({ line: e.linePos?.[0]?.line ?? 1, message: e.message.split("\n")[0], path: "" })) }
  }
  const res = familySchema.safeParse(doc.toJS())
  if (res.success) return { family: res.data, issues: [] }
  return {
    issues: res.error.issues.map((iss) => {
      const path = iss.path.map(String)
      let line = 1
      for (let n = path.length; n >= 0; n--) {
        const node = doc.getIn(path.slice(0, n), true) as { range?: [number, number, number] } | undefined
        if (node && node.range) {
          line = lc.lineOf(node.range[0])
          break
        }
      }
      return { line, message: iss.message, path: path.join(".") }
    }),
  }
}

class LineCounter {
  private starts: number[] = [0]
  constructor(text: string) {
    for (let i = 0; i < text.length; i++) if (text[i] === "\n") this.starts.push(i + 1)
  }
  lineOf(offset: number) {
    let lo = 0,
      hi = this.starts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (this.starts[mid] <= offset) lo = mid
      else hi = mid - 1
    }
    return lo + 1
  }
}

const flow = (arr: unknown[]) => {
  const s = new YAML.Document(arr)
  ;(s.contents as YAML.YAMLSeq).flow = true
  return s.contents
}

/** Serialise a family back to YAML in the same style as the card-agent registry files. */
export function familyToYaml(f: Family, header = "# Card family definition — edited via Card Agent Console"): string {
  const doc = new YAML.Document({
    family: f.family,
    family_name: f.family_name,
    issuer: f.issuer,
    schema_version: f.schema_version,
    keywords: f.keywords,
    negative_keywords: f.negative_keywords,
    weights: f.weights,
    variants: f.variants,
    fields: f.fields.map((x) => ({ ...x, anchor: x.anchor ?? undefined })),
    rules: f.rules,
  })
  // compact flow style for short lists, like the hand-written registry files
  YAML.visit(doc, {
    Seq(_, node, path) {
      const parent = path[path.length - 1] as YAML.Pair | undefined
      const key = parent && YAML.isPair(parent) ? String((parent.key as YAML.Scalar)?.value) : ""
      if (["keywords", "negative_keywords", "body_color_rgb", "roi"].includes(key)) node.flow = true
    },
    Map(_, node, path) {
      const parent = path[path.length - 1] as YAML.Pair | undefined
      const key = parent && YAML.isPair(parent) ? String((parent.key as YAML.Scalar)?.value) : ""
      if (key === "weights") node.flow = true
      if (YAML.isSeq(parent) || (path.length >= 2 && YAML.isSeq(path[path.length - 1]))) {
        const grand = path[path.length - 2] as YAML.Pair | undefined
        const gk = grand && YAML.isPair(grand) ? String((grand.key as YAML.Scalar)?.value) : ""
        if (gk === "rules") node.flow = true
      }
    },
  })
  void flow
  return `${header}\n${doc.toString({ lineWidth: 0 })}`
}
