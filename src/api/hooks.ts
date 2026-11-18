// react-query bindings for every card-agent endpoint the console uses.
import * as React from "react"
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { json, request } from "./client"
import type {
  EvalCase,
  FamilyFile,
  HistoryEntry,
  Info,
  RefImage,
  RegistrySummary,
  RunDetail,
  RunList,
  RunSummary,
  Separability,
  SettingsResponse,
  Stats,
  Thresholds,
} from "./types"
import { parseFamilyYaml, type Family } from "@/lib/schema"

export const qk = {
  info: ["info"] as const,
  registry: ["registry"] as const,
  families: ["families"] as const,
  family: (id: string) => ["families", id] as const,
  history: (id: string) => ["families", id, "history"] as const,
  refs: (family?: string) => ["refs", family ?? "all"] as const,
  separability: ["separability"] as const,
  runs: (p: object) => ["runs", p] as const,
  run: (id: string) => ["run", id] as const,
  stats: (hours: number | null) => ["stats", hours] as const,
  settings: ["settings"] as const,
  evalCases: ["eval-cases"] as const,
}

/** After any registry write: everything derived from the registry is stale. */
export function invalidateRegistry(qc: QueryClient) {
  for (const k of [qk.registry, qk.families, ["refs"], qk.separability, qk.info]) qc.invalidateQueries({ queryKey: k })
}

export function invalidateRuns(qc: QueryClient) {
  for (const k of [["runs"], ["run"], ["stats"]]) qc.invalidateQueries({ queryKey: k })
}

const onError = (title: string) => (e: Error) => toast.error(title, { description: e.message })

// ---- queries ------------------------------------------------------------------------------------
export const useInfo = () => useQuery({ queryKey: qk.info, queryFn: () => request<Info>("/v1/info"), retry: 0, refetchInterval: 60_000 })
export const useRegistry = () => useQuery({ queryKey: qk.registry, queryFn: () => request<RegistrySummary>("/v1/registry") })
export const useFamilyFiles = () => useQuery({ queryKey: qk.families, queryFn: () => request<FamilyFile[]>("/v1/registry/families") })
export const useFamilyFile = (id: string) =>
  useQuery({ queryKey: qk.family(id), queryFn: () => request<FamilyFile>(`/v1/registry/families/${encodeURIComponent(id)}`), retry: (n, e) => (e as { status?: number }).status !== 404 && n < 2 })
export const useFamilyHistory = (id: string) =>
  useQuery({ queryKey: qk.history(id), queryFn: () => request<HistoryEntry[]>(`/v1/registry/families/${encodeURIComponent(id)}/history`) })
export const useRefs = (family?: string) =>
  useQuery({ queryKey: qk.refs(family), queryFn: () => request<RefImage[]>(`/v1/registry/refs${family ? `?family=${encodeURIComponent(family)}` : ""}`) })
export const useSeparability = (enabled = true) =>
  useQuery({ queryKey: qk.separability, queryFn: () => request<Separability>("/v1/registry/separability"), enabled, staleTime: 5 * 60_000 })
export const useSettings = () => useQuery({ queryKey: qk.settings, queryFn: () => request<SettingsResponse>("/v1/settings") })
export const useEvalCases = () => useQuery({ queryKey: qk.evalCases, queryFn: () => request<EvalCase[]>("/v1/eval/cases"), staleTime: 5 * 60_000 })

export interface RunQuery {
  status?: string
  family?: string
  queue?: boolean
  reviewed?: boolean
  q?: string
  limit?: number
  offset?: number
}

export function useRuns(p: RunQuery, opts: { refetchInterval?: number } = {}) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== "" && v !== false) qs.set(k, String(v))
  return useQuery({ queryKey: qk.runs(p), queryFn: () => request<RunList>(`/v1/runs?${qs}`), placeholderData: keepPreviousData, ...opts })
}

export const useRun = (id: string | null) =>
  useQuery({ queryKey: qk.run(id ?? ""), queryFn: () => request<RunDetail>(`/v1/runs/${id}`), enabled: !!id })

const TZ = -new Date().getTimezoneOffset() // minutes east of UTC, so chart buckets follow the viewer's day

export const useStats = (hours: number | null) =>
  useQuery({
    queryKey: qk.stats(hours),
    queryFn: () => request<Stats>(hours ? `/v1/stats?hours=${hours}&tz=${TZ}` : `/v1/stats/all?tz=${TZ}`),
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  })

/** Families parsed from the YAML the service holds. Files that fail to parse are listed in `invalid`. */
export function useFamilies() {
  const q = useFamilyFiles()
  const parsed = React.useMemo(() => {
    const families: Family[] = []
    const invalid: { id: string; error: string }[] = []
    for (const f of q.data ?? []) {
      const p = parseFamilyYaml(f.yaml)
      if (p.family && f.loaded) families.push(p.family)
      else invalid.push({ id: f.family, error: f.error ?? p.issues[0]?.message ?? "invalid" })
    }
    families.sort((a, b) => a.family_name.localeCompare(b.family_name))
    return { families, invalid }
  }, [q.data])
  return { ...q, ...parsed }
}

// ---- mutations ----------------------------------------------------------------------------------
export function useSaveFamily() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, yaml, create }: { id: string; yaml: string; create?: boolean }) =>
      request<{ ok: boolean; changed: boolean; registry_version: string }>(`/v1/registry/families/${encodeURIComponent(id)}${create ? "?create=true" : ""}`, {
        method: "PUT",
        headers: { "content-type": "application/yaml" },
        body: yaml,
      }),
    onSuccess: (_, v) => {
      invalidateRegistry(qc)
      qc.invalidateQueries({ queryKey: qk.history(v.id) })
    },
  })
}

export function useDeleteFamily() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => request(`/v1/registry/families/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: () => invalidateRegistry(qc),
    onError: onError("Could not delete the family"),
  })
}

export function useUploadRefs() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ family, variant, files, warp = true }: { family: string; variant: string; files: File[]; warp?: boolean }) => {
      const fd = new FormData()
      files.forEach((f) => fd.append("images", f, f.name))
      return request<{ added: (RefImage & { card_detected: boolean | null })[] }>(
        `/v1/registry/refs/${encodeURIComponent(family)}/${encodeURIComponent(variant)}?warp=${warp}`,
        { method: "POST", body: fd }
      )
    },
    onSuccess: (r, v) => {
      invalidateRegistry(qc)
      const undetected = r.added.filter((a) => a.card_detected === false).length
      toast.success(`${r.added.length} reference image(s) added to ${v.family}/${v.variant}`, {
        description: undetected ? `${undetected} had no detectable card outline and were used as the full frame.` : "Registry re-indexed.",
      })
    },
    onError: onError("Upload failed"),
  })
}

export function useDeleteRef() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ref: RefImage) => request(`/v1/registry/refs/${ref.family}/${ref.variant}/${encodeURIComponent(ref.file)}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidateRegistry(qc)
      toast.success("Reference removed", { description: "Moved to registry/.trash and the index rebuilt." })
    },
    onError: onError("Could not remove the reference"),
  })
}

export function useReloadRegistry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => request<RegistrySummary>("/v1/registry/reload", { method: "POST" }),
    onSuccess: (r) => {
      invalidateRegistry(qc)
      toast.success("Registry reloaded", { description: `version ${r.version} · ${r.families.length} families` })
    },
    onError: onError("Reload failed"),
  })
}

export function useReview() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, decision, note }: { id: string; decision: "ACCEPT" | "REJECT"; note?: string }) =>
      request<RunSummary>(`/v1/runs/${id}/review`, json("POST", { decision, note: note || null })),
    onSuccess: (r) => {
      invalidateRuns(qc)
      toast.success(`Reviewer decision: ${r.review?.decision}`, { description: r.label ?? r.id })
    },
    onError: onError("Review not saved"),
  })
}

export function useClearReview() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => request<RunSummary>(`/v1/runs/${id}/review`, { method: "DELETE" }),
    onSuccess: () => invalidateRuns(qc),
    onError: onError("Could not reopen the review"),
  })
}

export function useEnroll() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, family, variant }: { id: string; family: string; variant: string }) =>
      request<RefImage>(`/v1/runs/${id}/enroll`, json("POST", { family, variant })),
    onSuccess: (r) => {
      invalidateRuns(qc)
      invalidateRegistry(qc)
      toast.success("Enrolled as reference", { description: r.id })
    },
    onError: onError("Enroll failed"),
  })
}

export function useDeleteRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => request(`/v1/runs/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidateRuns(qc)
      toast.success("Run deleted")
    },
    onError: onError("Could not delete the run"),
  })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<Thresholds>) => request<SettingsResponse>("/v1/settings", json("PUT", patch)),
    onSuccess: (r) => qc.setQueryData(qk.settings, r),
  })
}

export function useResetSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => request<SettingsResponse>("/v1/settings", { method: "DELETE" }),
    onSuccess: (r) => {
      qc.setQueryData(qk.settings, r)
      toast.success("Thresholds reset to defaults")
    },
    onError: onError("Reset failed"),
  })
}
