// One function per API operation (docs/API.md). Grouped like the API reference.
import { request, streamRequest } from "./client"
import type * as T from "./types"

/**
 * Photos of one card. `image` = one photo, side detected (schema 2.0 field). `front` / `back` = photos
 * of a known side. `images` = up to two photos, sides detected. At most two photos in total (2.1).
 */
export interface CardPhotos {
  image?: Blob
  front?: Blob
  back?: Blob
  images?: Blob[]
}

export function photoCount(p: CardPhotos) {
  return (p.image ? 1 : 0) + (p.front ? 1 : 0) + (p.back ? 1 : 0) + (p.images?.length ?? 0)
}

function photoForm(p: CardPhotos, requestId?: string) {
  const f = new FormData()
  const name = (b: Blob, field: string, i = 0) => (b instanceof File ? b.name : `${field}${i ? i : ""}.jpg`)
  if (p.front) f.append("front", p.front, name(p.front, "front"))
  if (p.back) f.append("back", p.back, name(p.back, "back"))
  if (p.image) f.append("image", p.image, name(p.image, "image"))
  p.images?.forEach((b, i) => f.append("images", b, name(b, "images", i)))
  if (requestId) f.append("request_id", requestId)
  return f
}

const Y = { "Content-Type": "application/yaml" }

export const api = {
  // ------------------------------------------------------------ 1. validation
  /** One photo, as in schema 2.0 (field `image`). */
  validate(image: Blob, filename: string, opts: { requestId?: string; store?: boolean } = {}) {
    return api.validatePhotos({ image: image instanceof File ? image : new File([image], filename, { type: image.type }) }, opts)
  },
  /** One or two photos of one card (front/back/image/images). */
  validatePhotos(photos: CardPhotos, opts: { requestId?: string; store?: boolean } = {}) {
    return request<T.ValidationResult>("/v1/cards/validate", { method: "POST", body: photoForm(photos, opts.requestId), query: { store: opts.store ?? true }, timeoutMs: 120_000 })
  },
  validateStream(
    photos: CardPhotos,
    onEvent: (event: string, data: unknown) => void,
    opts: { requestId?: string; store?: boolean; mode?: "delta" | "snapshot"; signal?: AbortSignal } = {}
  ) {
    return streamRequest("/v1/cards/validate/stream", photoForm(photos, opts.requestId), { store: opts.store ?? true, mode: opts.mode ?? "delta" }, onEvent, opts.signal)
  },
  pipelineSteps: () => request<{ steps: T.PipelineStep[] }>("/v1/pipeline/steps"),

  // ------------------------------------------------------------ 2. cards & references
  listCards: () => request<T.CardList>("/v1/cards"),
  getCard: (id: string) => request<T.CardView>(`/v1/cards/${encodeURIComponent(id)}`),
  getCardYaml: (id: string) => request<string>(`/v1/cards/${encodeURIComponent(id)}`, { query: { format: "yaml" }, headers: { Accept: "application/yaml" }, expect: "text" }),
  putCardYaml: (id: string, yaml: string, force = false) =>
    request<T.PutCardResult>(`/v1/cards/${encodeURIComponent(id)}`, { method: "PUT", body: yaml, headers: Y, query: { force: force || undefined } }),
  putCardJson: (id: string, def: T.CardFamily, force = false) =>
    request<T.PutCardResult>(`/v1/cards/${encodeURIComponent(id)}`, { method: "PUT", json: def, query: { force: force || undefined } }),
  deleteCard: (id: string, force = false) =>
    request<{ family: string; references_deleted: number; registry_version: string; note?: string }>(`/v1/cards/${encodeURIComponent(id)}`, { method: "DELETE", query: { force: force || undefined } }),
  listReferences: (id: string) => request<T.ReferenceList>(`/v1/cards/${encodeURIComponent(id)}/references`),
  referenceImagePath: (id: string, refId: string) => `/v1/cards/${encodeURIComponent(id)}/references/${encodeURIComponent(refId)}/image`,
  uploadReferences(id: string, variant: string, files: File[], detectCard = true, side?: T.Side) {
    const f = new FormData()
    files.forEach((x) => f.append("images", x, x.name))
    return request<T.UploadRefResult>(`/v1/cards/${encodeURIComponent(id)}/variants/${encodeURIComponent(variant)}/references`, {
      method: "POST",
      body: f,
      query: { detect_card: detectCard, side }, // side omitted = front (and for 2.0 servers)
      timeoutMs: 300_000,
    })
  },
  deleteReference: (id: string, refId: string, force = false) =>
    request<{ variant: string; reference_images_in_variant: number }>(`/v1/cards/${encodeURIComponent(id)}/references/${encodeURIComponent(refId)}`, {
      method: "DELETE",
      query: { force: force || undefined },
    }),

  // ------------------------------------------------------------ 3. registry
  registry: () => request<T.RegistrySummary>("/v1/registry"),
  syncRegistry: (prune = true, reembed = false) => request<T.SyncResult>("/v1/registry/sync", { method: "POST", query: { prune, reembed }, timeoutMs: 600_000 }),
  reloadRegistry: () => request<Record<string, unknown>>("/v1/registry/reload", { method: "POST" }),

  // ------------------------------------------------------------ 4. runs, review, stats
  listRuns: (q: { status?: string; family?: string; review_status?: string; since?: string; until?: string; before?: number | null; limit?: number }) =>
    request<T.Page<T.RunSummary>>("/v1/runs", { query: q as Record<string, string> }),
  reviewQueue: (q: { family?: string; before?: number | null; limit?: number } = {}) => request<T.ReviewQueue>("/v1/review", { query: q as Record<string, string> }),
  getRun: (id: string) => request<T.RunDetail>(`/v1/runs/${encodeURIComponent(id)}`),
  /** Main photo by default; `side` or `photo` (upload position) pick one photo of a two-photo run (2.1). */
  runImagePath: (id: string, which?: { side?: T.Side; photo?: number }) =>
    `/v1/runs/${encodeURIComponent(id)}/image` + (which?.side ? `?side=${which.side}` : which?.photo != null ? `?photo=${which.photo}` : ""),
  deleteRun: (id: string) => request<{ deleted: string }>(`/v1/runs/${encodeURIComponent(id)}`, { method: "DELETE" }),
  reviewRun: (id: string, body: T.ReviewIn) => request<T.RunDetail>(`/v1/runs/${encodeURIComponent(id)}/review`, { method: "POST", json: body }),
  pruneRuns: (olderThanDays?: number) => request<{ deleted: number; older_than_days: number }>("/v1/runs/prune", { method: "POST", query: { older_than_days: olderThanDays } }),
  stats: (q: { since?: string; until?: string; family?: string }) => request<T.Stats>("/v1/stats", { query: q }),

  // ------------------------------------------------------------ 5. settings
  settings: () => request<T.SettingsView>("/v1/settings"),
  patchSettings: (patch: T.SettingsValues | Record<string, unknown>) => request<T.SettingsView>("/v1/settings", { method: "PATCH", json: patch }),
  resetSettings: (section?: string) => request<T.SettingsView>("/v1/settings", { method: "DELETE", query: { section } }),

  // ------------------------------------------------------------ 6. evaluation
  uploadEvaluationSet(file: File, name: string) {
    const f = new FormData()
    f.append("file", file, file.name)
    f.append("name", name)
    return request<T.EvaluationSet>("/v1/evaluation-sets", { method: "POST", body: f, timeoutMs: 600_000 })
  },
  evaluationSetFromRuns: (body: { name?: string; since?: string; until?: string; family?: string }) =>
    request<T.EvaluationSet>("/v1/evaluation-sets/from-runs", { method: "POST", json: body, timeoutMs: 300_000 }),
  listEvaluationSets: () => request<{ items: T.EvaluationSet[] }>("/v1/evaluation-sets"),
  getEvaluationSet: (id: string) => request<T.EvaluationSet>(`/v1/evaluation-sets/${encodeURIComponent(id)}`),
  deleteEvaluationSet: (id: string) => request<{ deleted: string }>(`/v1/evaluation-sets/${encodeURIComponent(id)}`, { method: "DELETE" }),
  startEvaluation: (body: { set_id: string; settings?: T.SettingsValues; today?: string }) => request<T.Evaluation>("/v1/evaluations", { method: "POST", json: body }),
  listEvaluations: (setId?: string) => request<{ items: T.Evaluation[] }>("/v1/evaluations", { query: { set_id: setId } }),
  getEvaluation: (id: string, rows = true) => request<T.Evaluation>(`/v1/evaluations/${encodeURIComponent(id)}`, { query: { rows } }),
  deleteEvaluation: (id: string) => request<{ deleted: string }>(`/v1/evaluations/${encodeURIComponent(id)}`, { method: "DELETE" }),

  // ------------------------------------------------------------ 7. health
  live: () => request<{ status: string }>("/health/live", { timeoutMs: 8000 }),
  ready: () => request<T.Ready>("/health/ready", { timeoutMs: 8000 }),
  metrics: () => request<string>("/metrics", { headers: { Accept: "text/plain" }, expect: "text" }),
}
