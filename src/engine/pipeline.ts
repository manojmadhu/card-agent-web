// Card validation pipeline — hierarchical Family → Variant → Fields → Rules, identical stage order and
// decision policy to card-agent (cardagent/pipeline.py). Emits a live trace so the UI can show each step.
import type { Family, Variant } from "./schema"
import type { PhotoFx, PrintedToken } from "./render"
import { manualOcr, simulateOcr, type OcrToken } from "./ocr"
import { cosine, embed, EMBEDDER_NAME } from "./embed"
import { bodyColour, colourScore, measureQuality, normalise, rgbHex, type RGB } from "./vision"
import { normaliseValue, expiryIso, runRule, type RuleResult } from "./rules"
import type { Decision } from "./samples"
import type { RefEntry } from "./registry"

export const PIPELINE_VERSION = "0.1.0-web"

export interface Settings {
  tau_family: number
  delta_family: number
  tau_variant: number
  delta_variant: number
  min_blur: number
  min_brightness: number
  max_brightness: number
  max_glare: number
  sim_floor: number
  sim_ceiling: number
  top_k: number
  variant_weights: { colour: number; keyword: number; prefix: number }
  unknown_action: "REJECT" | "REVIEW"
  vlm_enabled: boolean
  step_delay_ms: number
  mode: "browser" | "api"
  api_base: string
}

export const DEFAULT_SETTINGS: Settings = {
  tau_family: 0.5,
  delta_family: 0.15,
  tau_variant: 0.45,
  delta_variant: 0.1,
  min_blur: 60,
  min_brightness: 0.15,
  max_brightness: 0.93,
  max_glare: 0.12,
  sim_floor: 0.55,
  sim_ceiling: 0.97,
  top_k: 5,
  variant_weights: { colour: 0.5, keyword: 0.35, prefix: 0.15 },
  unknown_action: "REJECT",
  vlm_enabled: false,
  step_delay_ms: 450,
  mode: "browser",
  api_base: "/v1",
}

export type StepId = "ingest" | "quality" | "normalise" | "ocr" | "embed" | "search" | "family" | "variant" | "fields" | "rules" | "decision"
export type StepStatus = "pending" | "running" | "pass" | "warn" | "fail" | "skip"

export const STEPS: { id: StepId; title: string; stage: string }[] = [
  { id: "ingest", title: "Ingest", stage: "0" },
  { id: "quality", title: "Quality gate", stage: "1" },
  { id: "normalise", title: "Normalise", stage: "2" },
  { id: "ocr", title: "Full-card OCR", stage: "3" },
  { id: "embed", title: "Embed card", stage: "4a" },
  { id: "search", title: "Reference search (linear)", stage: "4b" },
  { id: "family", title: "Family classification", stage: "4c" },
  { id: "variant", title: "Variant classification", stage: "5" },
  { id: "fields", title: "Field extraction", stage: "6" },
  { id: "rules", title: "Validation rules", stage: "7" },
  { id: "decision", title: "Decision", stage: "8" },
]

export interface StepState {
  id: StepId
  status: StepStatus
  summary: string
  ms: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detail: any
}

export interface FieldOut {
  value: string | null
  confidence: number
  source: "ocr" | "ocr_fulltext" | "vlm" | "none"
  raw?: string
  roi?: number[]
}

export interface PipelineResult {
  schema_version: 1
  request_id: string
  status: Decision
  card: { family: string | null; family_name: string | null; family_confidence: number; variant: string | null; variant_name: string | null; variant_confidence: number }
  fields: Record<string, FieldOut>
  validation: RuleResult[]
  reasons: string[]
  quality: { blur: number; brightness: number; glare_ratio: number }
  candidates: { family: string; score: number }[]
  model_versions: { registry: string; ocr: string; embedder: string; pipeline: string }
  processing_ms: number
}

export interface PipelineInput {
  request_id: string
  image: HTMLCanvasElement
  printed?: PrintedToken[]
  fx?: PhotoFx
  manualText?: string
  origW: number
  origH: number
  sourceLabel: string
}

export interface PipelineCtx {
  families: Family[]
  index: RefEntry[]
  settings: Settings
  registryVersion: string
}

export interface TraceUpdate {
  steps: StepState[]
  normalisedUrl?: string
  result?: PipelineResult
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x))
const r3 = (x: number) => +x.toFixed(3)

function lev(a: string, b: string) {
  const m = a.length,
    n = b.length
  if (!m) return n
  if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[n]
}

/** Fuzzy keyword match against OCR text: 1.0 for exact, similarity ≥ 0.75 for OCR near-misses, else 0. */
export function keywordScore(keywords: string[], tokens: OcrToken[]): { score: number; hit: string | null; token: string | null } {
  const words = tokens.flatMap((t) => [t.text.toUpperCase(), ...t.text.toUpperCase().split(/\s+/)])
  let best = 0,
    hit: string | null = null,
    tok: string | null = null
  for (const k of keywords) {
    const K = k.toUpperCase()
    for (const w of words) {
      if (!w) continue
      const s = w === K || w.includes(K) ? 1 : 1 - lev(K, w) / Math.max(K.length, w.length)
      if (s > best) {
        best = s
        hit = k
        tok = w
      }
    }
  }
  return { score: best >= 0.75 ? r3(best) : 0, hit: best >= 0.75 ? hit : null, token: best >= 0.75 ? tok : null }
}

function findNumber(tokens: OcrToken[]): string | null {
  for (const t of tokens) {
    const d = t.text.replace(/[\s-]/g, "")
    if (/^\d{8,16}$/.test(d)) return d
  }
  return null
}

export async function* runPipeline(input: PipelineInput, ctx: PipelineCtx): AsyncGenerator<TraceUpdate, PipelineResult> {
  const S = ctx.settings
  const delay = S.step_delay_ms
  const t0 = performance.now()
  const steps: StepState[] = STEPS.map((s) => ({ id: s.id, status: "pending", summary: "", ms: 0, detail: null }))
  const get = (id: StepId) => steps.find((s) => s.id === id)!
  const snapshot = (extra: Partial<TraceUpdate> = {}): TraceUpdate => ({ steps: steps.map((s) => ({ ...s })), ...extra })
  let normalisedUrl: string | undefined
  let tStep = performance.now()
  async function* begin(id: StepId) {
    const s = get(id)
    s.status = "running"
    tStep = performance.now()
    yield snapshot({ normalisedUrl })
    if (delay) await sleep(delay)
  }
  const end = (id: StepId, status: StepStatus, summary: string, detail: unknown) => {
    const s = get(id)
    s.status = status
    s.summary = summary
    s.detail = detail
    s.ms = Math.max(1, Math.round(performance.now() - tStep - (delay || 0) - ((detail as { slept?: number })?.slept ?? 0)))
  }
  const skipRest = (from: StepId, why: string) => {
    let on = false
    for (const s of steps) {
      if (s.id === from) on = true
      if (on && s.id !== "decision" && s.status === "pending") {
        s.status = "skip"
        s.summary = why
      }
    }
  }

  const reasons: string[] = []
  let status: Decision | null = null
  let family: Family | null = null
  let variant: Variant | null = null
  let famConf = 0,
    varConf = 0
  let candidates: { family: string; score: number }[] = []
  const fieldsOut: Record<string, FieldOut> = {}
  let ruleResults: RuleResult[] = []
  let quality = { blur: 0, brightness: 0, glare_ratio: 0 }

  // [0] Ingest
  yield* begin("ingest")
  end("ingest", "pass", `${input.origW}×${input.origH} · ${input.sourceLabel}`, { request_id: input.request_id, width: input.origW, height: input.origH, source: input.sourceLabel })

  // [1] Quality gate
  yield* begin("quality")
  const q = measureQuality(input.image, input.origW, input.origH)
  quality = { blur: q.blur, brightness: q.brightness, glare_ratio: q.glare_ratio }
  const checks = [
    { name: "sharpness (Laplacian var.)", value: q.blur, op: "≥", limit: S.min_blur, ok: q.blur >= S.min_blur, code: "TOO_BLURRY" },
    { name: "brightness", value: q.brightness, op: "≥", limit: S.min_brightness, ok: q.brightness >= S.min_brightness, code: "TOO_DARK" },
    { name: "brightness", value: q.brightness, op: "≤", limit: S.max_brightness, ok: q.brightness <= S.max_brightness, code: "TOO_BRIGHT" },
    { name: "glare ratio", value: q.glare_ratio, op: "≤", limit: S.max_glare, ok: q.glare_ratio <= S.max_glare, code: "GLARE" },
  ]
  const failed = checks.filter((c) => !c.ok)
  if (failed.length) {
    end("quality", "fail", `Failed: ${failed.map((f) => f.code).join(", ")} → RETAKE_REQUIRED`, { metrics: q, checks })
    reasons.push("RETAKE_REQUIRED", ...failed.map((f) => f.code))
    status = "REJECT"
    skipRest("normalise", "skipped — quality gate failed")
  } else end("quality", "pass", `blur ${q.blur} · brightness ${q.brightness} · glare ${(q.glare_ratio * 100).toFixed(1)}%`, { metrics: q, checks })

  let tokens: OcrToken[] = []
  let normCanvas: HTMLCanvasElement | null = null
  let vec: number[] = []
  let body: RGB = [0, 0, 0]

  if (!status) {
    // [2] Normalise + orientation (try 0/180, keep the one with best OCR confidence)
    yield* begin("normalise")
    const tried: { deg: number; ocr_conf: number }[] = []
    let orient: 0 | 180 = 0
    if (input.printed) {
      const meanConf = (o: 0 | 180) => {
        const t = simulateOcr(input.printed!, input.fx ?? {}, o)
        return t.length ? t.reduce((a, b) => a + b.conf, 0) / t.length : 0
      }
      const c0 = meanConf(0),
        c180 = meanConf(180)
      tried.push({ deg: 0, ocr_conf: r3(c0) }, { deg: 180, ocr_conf: r3(c180) })
      orient = c180 > c0 ? 180 : 0
    } else tried.push({ deg: 0, ocr_conf: NaN })
    normCanvas = normalise(input.image, orient === 180)
    normalisedUrl = normCanvas.toDataURL("image/jpeg", 0.85)
    end("normalise", "pass", `warped to 1012×638 · rotation ${orient}°`, { size: [1012, 638], orientation: orient, tried })

    // [3] OCR
    yield* begin("ocr")
    let engine = "simulated (renderer text layer)"
    if (input.printed) tokens = simulateOcr(input.printed, input.fx ?? {}, orient)
    else if (input.manualText) {
      tokens = manualOcr(input.manualText)
      engine = "manual entry (operator)"
    } else engine = "none — no OCR engine in browser mode"
    const mc = tokens.length ? tokens.reduce((a, b) => a + b.conf, 0) / tokens.length : 0
    end("ocr", tokens.length ? "pass" : "warn", tokens.length ? `${tokens.length} tokens · mean conf ${mc.toFixed(2)}` : "no text read — text signal will be 0", { engine, tokens, mean_conf: r3(mc) })

    // [4a] Embed
    yield* begin("embed")
    vec = embed(normCanvas)
    body = bodyColour(normCanvas)
    end("embed", "pass", `${vec.length}-d vector · body colour ${rgbHex(body)}`, { embedder: EMBEDDER_NAME, dim: vec.length, vector: vec, body_rgb: body })

    // [4b] Linear reference search — cosine similarity against every enrolled reference
    yield* begin("search")
    const scored: { ref: RefEntry; sim: number }[] = []
    const total = ctx.index.length
    const chunk = Math.max(1, Math.ceil(total / 6))
    let slept = 0
    for (let i = 0; i < total; i++) {
      scored.push({ ref: ctx.index[i], sim: cosine(vec, ctx.index[i].embedding) })
      if (delay && (i + 1) % chunk === 0 && i + 1 < total) {
        const best = [...scored].sort((a, b) => b.sim - a.sim)[0]
        get("search").summary = `scanning ${i + 1}/${total} · best so far ${best.sim.toFixed(3)} (${best.ref.family}/${best.ref.variant})`
        get("search").detail = { scanned: i + 1, total }
        yield snapshot({ normalisedUrl })
        const z = Math.min(120, delay / 3)
        await sleep(z)
        slept += z
      }
    }
    scored.sort((a, b) => b.sim - a.sim)
    const top = scored.slice(0, S.top_k).map((s) => ({ ref_id: s.ref.id, family: s.ref.family, variant: s.ref.variant, sim: r3(s.sim), thumb: s.ref.thumb, source: s.ref.source }))
    const bestSim = scored[0]?.sim ?? 0
    const matched = bestSim >= S.sim_floor
    end(
      "search",
      total === 0 ? "warn" : matched ? "pass" : "warn",
      total === 0 ? "no reference cards enrolled" : matched ? `best match ${top[0].family}/${top[0].variant} · sim ${bestSim.toFixed(3)}` : `no reference above floor ${S.sim_floor} (best ${bestSim.toFixed(3)}) — not matching`,
      { scanned: total, total, top, best: r3(bestSim), slept, floor: S.sim_floor, matched, all: scored.map((s) => ({ ref_id: s.ref.id, family: s.ref.family, variant: s.ref.variant, sim: r3(s.sim) })) }
    )

    // [4c] Family fusion: w_t·S_text + w_v·S_visual + w_c·S_colour, decision needs top1 ≥ τ AND margin ≥ δ
    yield* begin("family")
    const famRows = ctx.families.map((f) => {
      const kw = keywordScore(f.keywords, tokens)
      const neg = f.negative_keywords.length ? keywordScore(f.negative_keywords, tokens) : { score: 0, hit: null }
      const sText = neg.score >= 0.85 ? kw.score * 0.2 : kw.score
      const refSims = scored.filter((s) => s.ref.family === f.family).map((s) => s.sim)
      const bestRef = refSims.length ? Math.max(...refSims) : 0
      const sVis = clamp((bestRef - S.sim_floor) / (S.sim_ceiling - S.sim_floor))
      const sCol = Math.max(...f.variants.map((v) => colourScore(body, v.body_color_rgb as RGB)))
      const score = f.weights.text * sText + f.weights.visual * sVis + f.weights.colour * sCol
      return { family: f.family, name: f.family_name, text: r3(sText), keyword_hit: kw.hit, negative_hit: neg.score >= 0.85 ? neg.hit : null, visual: r3(sVis), best_ref_sim: r3(bestRef), colour: r3(sCol), weights: f.weights, score: r3(score) }
    })
    famRows.sort((a, b) => b.score - a.score)
    candidates = famRows.map((r) => ({ family: r.family, score: r.score }))
    const f1 = famRows[0],
      f2 = famRows[1]
    const margin = f1 ? f1.score - (f2?.score ?? 0) : 0
    let famOutcome: "decided" | "unknown" | "low_confidence" | "ambiguous" = "decided"
    // below τ: if the reference search found nothing either, it's an unknown card (reject);
    // if it visually matched an enrolled card, a human should look (review).
    if (!f1 || f1.score < S.tau_family) famOutcome = matched && f1 ? "low_confidence" : "unknown"
    else if (margin < S.delta_family) famOutcome = "ambiguous"
    const famDetail = { candidates: famRows, tau: S.tau_family, delta: S.delta_family, top1: f1?.score ?? 0, margin: r3(margin), outcome: famOutcome }
    if (famOutcome === "low_confidence") {
      end("family", "warn", `top-1 ${f1.name} ${f1.score.toFixed(2)} < τ ${S.tau_family}, but looks like an enrolled card → human review`, famDetail)
      reasons.push("LOW_CONFIDENCE_FAMILY")
      family = ctx.families.find((f) => f.family === f1.family)!
      famConf = f1.score
    } else if (famOutcome === "unknown") {
      end("family", "fail", `top-1 ${f1 ? `${f1.name} ${f1.score.toFixed(2)}` : "—"} < τ ${S.tau_family} → unknown card`, famDetail)
      reasons.push("UNKNOWN_CARD")
      status = S.unknown_action
      skipRest("variant", "skipped — card family not recognised")
    } else {
      family = ctx.families.find((f) => f.family === f1.family)!
      famConf = f1.score
      if (famOutcome === "ambiguous") {
        reasons.push("AMBIGUOUS_FAMILY")
        end("family", "warn", `${f1.name} ${f1.score.toFixed(2)} vs ${f2.name} ${f2.score.toFixed(2)} — margin ${margin.toFixed(2)} < δ ${S.delta_family}`, famDetail)
      } else end("family", "pass", `${f1.name} · score ${f1.score.toFixed(2)} · margin ${margin.toFixed(2)}`, famDetail)
    }
  }

  if (!status && family) {
    // [5] Variant — only among this family's variants
    yield* begin("variant")
    const num = findNumber(tokens)
    const W = S.variant_weights
    const vRows = family.variants.map((v) => {
      const col = colourScore(body, v.body_color_rgb as RGB, 22)
      const kw = v.keywords.length ? keywordScore(v.keywords, tokens) : { score: 0, hit: null }
      const pre = !v.number_prefix || !num ? 0.5 : num.startsWith(v.number_prefix) ? 1 : 0
      return { variant: v.id, name: v.name, colour: r3(col), keyword: kw.score, keyword_hit: kw.hit, prefix: pre, rgb: v.body_color_rgb, score: r3(W.colour * col + W.keyword * kw.score + W.prefix * pre) }
    })
    vRows.sort((a, b) => b.score - a.score)
    const v1 = vRows[0],
      v2 = vRows[1]
    const vm = v1.score - (v2?.score ?? 0)
    variant = family.variants.find((v) => v.id === v1.variant)!
    varConf = v1.score
    const vDetail = { candidates: vRows, tau: S.tau_variant, delta: S.delta_variant, margin: r3(vm), number_seen: num, body_rgb: body }
    if (v1.score < S.tau_variant || (v2 && vm < S.delta_variant)) {
      reasons.push("AMBIGUOUS_VARIANT")
      end("variant", "warn", `${v1.name} ${v1.score.toFixed(2)} — below τ or margin ${vm.toFixed(2)} < δ`, vDetail)
    } else end("variant", "pass", `${v1.name} · score ${v1.score.toFixed(2)} · margin ${vm.toFixed(2)}`, vDetail)

    // [6] Fields — ROI → regex; fallback full text; optional local VLM
    yield* begin("fields")
    const rows = family.fields.map((fd) => {
      const re = new RegExp(fd.regex)
      const inRoi = tokens.filter((t) => t.box && (t.box[0] + t.box[2]) / 2 >= fd.roi[0] && (t.box[0] + t.box[2]) / 2 <= fd.roi[2] && (t.box[1] + t.box[3]) / 2 >= fd.roi[1] && (t.box[1] + t.box[3]) / 2 <= fd.roi[3])
      const tryCands = (cands: OcrToken[], joined: boolean) => {
        const list = joined && cands.length ? [{ text: cands.map((c) => c.text).join(" "), conf: Math.min(...cands.map((c) => c.conf)) }, ...cands] : cands
        for (const c of list) {
          let t = c.text
          if (fd.anchor) t = t.replace(new RegExp(`^\\s*${fd.anchor}\\s*`, "i"), "")
          const v = normaliseValue(t, fd.normalise)
          if (re.test(v)) return { value: v, raw: c.text, conf: c.conf }
        }
        return null
      }
      let hit = tryCands(inRoi, true)
      let source: FieldOut["source"] = hit ? "ocr" : "none"
      if (!hit) {
        hit = tryCands(tokens, false)
        if (hit) source = "ocr_fulltext"
      }
      const out: FieldOut = { value: hit?.value ?? null, confidence: r3(hit?.conf ?? 0), source, raw: hit?.raw, roi: fd.roi }
      fieldsOut[fd.name] = out
      return { name: fd.name, required: fd.required, roi: fd.roi, regex: fd.regex, normalise: fd.normalise, ...out, iso: fd.normalise === "date_mm_yy" && hit ? expiryIso(hit.value) : null, ok: !!hit }
    })
    const missing = rows.filter((r) => r.required && !r.ok)
    if (missing.length) reasons.push(...missing.map((m) => `FIELD_MISSING:${m.name}`))
    end(
      "fields",
      missing.length ? "warn" : "pass",
      missing.length ? `${rows.length - missing.length}/${rows.length} extracted · missing ${missing.map((m) => m.name).join(", ")}${S.vlm_enabled ? "" : " (VLM fallback off)"}` : `${rows.filter((r) => r.ok).length}/${rows.length} fields extracted`,
      { fields: rows, vlm: S.vlm_enabled ? "enabled (stub)" : "disabled" }
    )

    // [7] Rules
    yield* begin("rules")
    ruleResults = family.rules.map((r) => runRule(r, fieldsOut, family!.fields, variant))
    const critFail = ruleResults.filter((r) => r.result === "fail" && r.critical)
    const softFail = ruleResults.filter((r) => r.result === "fail" && !r.critical)
    critFail.forEach((r) => reasons.push(r.reason ?? "RULE_FAILED"))
    softFail.forEach((r) => reasons.push(r.reason ?? "RULE_FAILED"))
    const pass = ruleResults.filter((r) => r.result === "pass").length
    end("rules", critFail.length ? "fail" : softFail.length ? "warn" : "pass", `${pass} pass · ${critFail.length + softFail.length} fail · ${ruleResults.length - pass - critFail.length - softFail.length} skip`, { results: ruleResults })

    // [8] Decision policy
    if (critFail.length) status = "REJECT"
    else if (reasons.length) status = "REVIEW"
    else status = "ACCEPT"
  }

  yield* begin("decision")
  const final: Decision = status ?? "REVIEW"
  const conf = final === "ACCEPT" ? Math.min(famConf, varConf || famConf) : Math.max(famConf, 0)
  const result: PipelineResult = {
    schema_version: 1,
    request_id: input.request_id,
    status: final,
    card: { family: family?.family ?? null, family_name: family?.family_name ?? null, family_confidence: r3(famConf), variant: variant?.id ?? null, variant_name: variant?.name ?? null, variant_confidence: r3(varConf) },
    fields: fieldsOut,
    validation: ruleResults,
    reasons,
    quality,
    candidates,
    model_versions: { registry: ctx.registryVersion, ocr: input.printed ? "ocr-sim-0.1" : input.manualText ? "manual" : "none", embedder: EMBEDDER_NAME, pipeline: PIPELINE_VERSION },
    processing_ms: delay ? steps.reduce((a, s) => a + s.ms, 0) : Math.round(performance.now() - t0),
  }
  end("decision", final === "ACCEPT" ? "pass" : final === "REVIEW" ? "warn" : "fail", `${final}${reasons.length ? " · " + reasons.join(", ") : ""}`, { status: final, reasons, confidence: r3(conf) })
  yield snapshot({ normalisedUrl, result })
  return result
}
