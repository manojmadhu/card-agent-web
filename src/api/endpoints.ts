// One function per API operation (docs/API.md). Grouped like the API reference.
import { request, streamRequest } from "./client"
import type * as T from "./types"

const Y = { "Content-Type": "application/yaml" }

export const api = {
  // ------------------------------------------------------------ 1. validation
  validate(image: Blob, filename: string, opts: { requestId?: string; store?: boolean } = {}) {
    const f = new FormData()
    f.append("image", image, filename)
    if (opts.requestId) f.append("request_id", opts.requestId)
    return request<T.ValidationResult>("/v1/cards/validate", { method: "POST", body: f, query: { store: opts.store ?? true }, timeoutMs: 120_000 })
  },
  validateStream(
    image: Blob,
    filename: string,
    onEvent: (event: string, data: unknown) => void,
    opts: { requestId?: string; store?: boolean; mode?: "delta" | "snapshot"; signal?: AbortSignal } = {}
  ) {
    const f = new FormData()
    f.append("image", image, filename)
    if (opts.requestId) f.append("request_id", opts.requestId)
    return streamRequest("/v1/cards/validate/stream", f, { store: opts.store ?? true, mode: opts.mode ?? "delta" }, onEvent, opts.signal)
  },
  pipelineSteps: () => request<{ steps: T.PipelineStep[] }>("/v1/pipeline/steps"),

  // ------------------------------------------------------------ 2. cards & references
  listCards: () => request<T.CardList>("/v1/cards"),
  getCard: (id: string) => request<T.CardView>(`/v1/cards/${encodeURIComponent(id)}`),
  getCardYaml: (id: string) => request<string>(`/v1/cards/${encodeURIComponent(id)}`, { query: { format: "yaml" }, headers: { Accept: "application/yaml" } }),
  putCardYaml: (id: string, yaml: string, force = false) =>
    request<T.PutCardResult>(`/v1/cards/${encodeURIComponent(id)}`, { method: "PUT", body: yaml, headers: Y, query: { force: force || undefined } }),
  putCardJson: (id: string, def: T.CardFamily, force = false) =>
    request<T.PutCardResult>(`/v1/cards/${encodeURIComponent(id)}`, { method: "PUT", json: def, query: { force: force || undefined } }),
  deleteCard: (id: string, force = false) =>
    request<{ family: string; references_deleted: number; registry_version: string; note?: string }>(`/v1/cards/${encodeURIComponent(id)}`, { method: "DELETE", query: { force: force || undefined } }),
  listReferences: (id: string) => request<T.ReferenceList>(`/v1/cards/${encodeURIComponent(id)}/references`),
  referenceImagePath: (id: string, refId: string) => `/v1/cards/${encodeURIComponent(id)}/references/${encodeURIComponent(refId)}/image`,
  uploadReferences(id: string, variant: string, files: File[], detectCard = true) {
    const f = new FormData()
    files.forEach((x) => f.append("images", x, x.name))
    return request<T.UploadRefResult>(`/v1/cards/${encodeURIComponent(id)}/variants/${encodeURIComponent(variant)}/references`, {
      method: "POST",
      body: f,
      query: { detect_card: detectCard },
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
  runImagePath: (id: string) => `/v1/runs/${encodeURIComponent(id)}/image`,
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
  metrics: () => request<string>("/metrics", { headers: { Accept: "text/plain" } }),
}
