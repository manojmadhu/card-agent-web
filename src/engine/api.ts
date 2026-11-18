// Client for the card-agent FastAPI service (API mode). Endpoints from the MVP README:
//   POST /v1/cards/validate   multipart image (+request_id) → result JSON
//   GET  /v1/registry          loaded families/variants + reference counts
//   POST /v1/registry/reload   hot-reload YAML + reference images
// Admin endpoints added by backend/admin_api.py in this repo:
//   GET/PUT/DELETE /v1/registry/families/{id}    raw YAML
//   POST /v1/registry/families/{id}/refs/{variant}  multipart reference image
import { STEPS, type PipelineResult, type StepState } from "./pipeline"

export async function apiValidate(base: string, file: Blob, requestId: string): Promise<PipelineResult> {
  const fd = new FormData()
  fd.append("image", file, "card.jpg")
  fd.append("request_id", requestId)
  const r = await fetch(`${base}/cards/validate`, { method: "POST", body: fd })
  if (!r.ok) throw new Error(`validate failed: HTTP ${r.status}`)
  return r.json()
}

export async function apiRegistry(base: string) {
  const r = await fetch(`${base}/registry`)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

export async function apiReload(base: string) {
  const r = await fetch(`${base}/registry/reload`, { method: "POST" })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

export async function apiPutFamily(base: string, id: string, yaml: string) {
  const r = await fetch(`${base}/registry/families/${encodeURIComponent(id)}`, { method: "PUT", headers: { "content-type": "application/yaml" }, body: yaml })
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`)
  return r.json()
}

export async function apiPing(base: string): Promise<{ ok: boolean; detail: string }> {
  try {
    const j = await apiRegistry(base)
    const n = Array.isArray(j?.families) ? j.families.length : Object.keys(j ?? {}).length
    return { ok: true, detail: `connected · ${n} families loaded` }
  } catch (e) {
    return { ok: false, detail: (e as Error).message }
  }
}

/** The service returns only the final envelope — rebuild a per-stage trace from it for the timeline. */
export function traceFromResult(res: PipelineResult): StepState[] {
  const rejectedAtQuality = res.reasons.includes("RETAKE_REQUIRED")
  const unknown = res.reasons.includes("UNKNOWN_CARD")
  return STEPS.map(({ id }) => {
    const s: StepState = { id, status: "pass", summary: "", ms: 0, detail: null }
    const after = (gate: boolean) => gate && !["ingest", "quality", "decision"].includes(id)
    if (after(rejectedAtQuality)) return { ...s, status: "skip", summary: "skipped — quality gate failed" }
    switch (id) {
      case "ingest":
        s.summary = `request ${res.request_id}`
        break
      case "quality":
        s.status = rejectedAtQuality ? "fail" : "pass"
        s.summary = `blur ${res.quality.blur} · brightness ${res.quality.brightness} · glare ${res.quality.glare_ratio}`
        s.detail = { metrics: res.quality, checks: [] }
        break
      case "normalise":
      case "ocr":
      case "embed":
        s.summary = "done by service"
        break
      case "search":
        s.summary = "done by service (see family candidates)"
        break
      case "family": {
        const c = res.candidates ?? []
        s.status = unknown ? "fail" : res.reasons.includes("AMBIGUOUS_FAMILY") ? "warn" : "pass"
        s.summary = unknown ? "unknown card" : `${res.card.family_name} · ${res.card.family_confidence}`
        s.detail = { candidates: c.map((x) => ({ family: x.family, name: x.family, score: x.score })), outcome: unknown ? "unknown" : "decided" }
        break
      }
      default:
        if (unknown && id !== "decision") return { ...s, status: "skip", summary: "skipped — card family not recognised" }
        if (id === "variant") s.summary = `${res.card.variant} · ${res.card.variant_confidence}`
        if (id === "fields") s.summary = `${Object.values(res.fields).filter((f) => f.value).length}/${Object.keys(res.fields).length} fields`
        if (id === "rules") {
          const f = res.validation.filter((v) => v.result === "fail")
          s.status = f.some((x) => x.critical) ? "fail" : f.length ? "warn" : "pass"
          s.summary = `${res.validation.filter((v) => v.result === "pass").length} pass · ${f.length} fail`
          s.detail = { results: res.validation }
        }
        if (id === "decision") {
          s.status = res.status === "ACCEPT" ? "pass" : res.status === "REVIEW" ? "warn" : "fail"
          s.summary = `${res.status}${res.reasons.length ? " · " + res.reasons.join(", ") : ""}`
          s.detail = { status: res.status, reasons: res.reasons }
        }
    }
    return s
  })
}
