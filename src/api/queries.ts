// TanStack Query keys and hooks. Mutations invalidate exactly the data they change.
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "./endpoints"
import type * as T from "./types"

export const qk = {
  ready: ["health", "ready"] as const,
  steps: ["pipeline", "steps"] as const,
  cards: ["cards"] as const,
  card: (id: string) => ["cards", id] as const,
  cardYaml: (id: string) => ["cards", id, "yaml"] as const,
  refs: (id: string) => ["cards", id, "references"] as const,
  registry: ["registry"] as const,
  runs: (q: object) => ["runs", q] as const,
  run: (id: string) => ["run", id] as const,
  review: (q: object) => ["review", q] as const,
  stats: (q: object) => ["stats", q] as const,
  settings: ["settings"] as const,
  sets: ["evaluation-sets"] as const,
  set: (id: string) => ["evaluation-sets", id] as const,
  evaluations: (setId?: string) => ["evaluations", setId ?? "all"] as const,
  evaluation: (id: string) => ["evaluation", id] as const,
  metrics: ["metrics"] as const,
}

export const useReady = (enabled = true) =>
  useQuery({ queryKey: qk.ready, queryFn: api.ready, refetchInterval: 15_000, retry: 0, enabled })
export const usePipelineSteps = () => useQuery({ queryKey: qk.steps, queryFn: api.pipelineSteps, staleTime: Infinity })
export const useCards = () => useQuery({ queryKey: qk.cards, queryFn: api.listCards })
export const useCard = (id: string) => useQuery({ queryKey: qk.card(id), queryFn: () => api.getCard(id), enabled: !!id })
export const useCardYaml = (id: string) => useQuery({ queryKey: qk.cardYaml(id), queryFn: () => api.getCardYaml(id), enabled: !!id })
export const useReferences = (id: string, enabled = true) => useQuery({ queryKey: qk.refs(id), queryFn: () => api.listReferences(id), enabled: !!id && enabled })
export const useRegistry = () => useQuery({ queryKey: qk.registry, queryFn: api.registry })
export const useSettings = () => useQuery({ queryKey: qk.settings, queryFn: api.settings })
export const useStats = (q: { since?: string; until?: string; family?: string }, enabled = true) =>
  useQuery({ queryKey: qk.stats(q), queryFn: () => api.stats(q), placeholderData: keepPreviousData, refetchInterval: 30_000, enabled })
export const useRun = (id: string, enabled = true) => useQuery({ queryKey: qk.run(id), queryFn: () => api.getRun(id), enabled: !!id && enabled })
export const useEvaluationSets = (enabled = true) => useQuery({ queryKey: qk.sets, queryFn: api.listEvaluationSets, enabled })
export const useEvaluationSet = (id: string, enabled = true) => useQuery({ queryKey: qk.set(id), queryFn: () => api.getEvaluationSet(id), enabled: !!id && enabled })
export const useEvaluations = (setId?: string, enabled = true) =>
  useQuery({
    queryKey: qk.evaluations(setId),
    queryFn: () => api.listEvaluations(setId),
    enabled,
    // poll while anything is still queued or running
    refetchInterval: (q) => (q.state.data?.items.some((e) => e.status === "queued" || e.status === "running") ? 2000 : false),
  })
export const useEvaluation = (id: string, enabled = true) =>
  useQuery({
    queryKey: qk.evaluation(id),
    queryFn: () => api.getEvaluation(id),
    enabled: !!id && enabled,
    refetchInterval: (q) => (q.state.data && ["queued", "running"].includes(q.state.data.status) ? 1500 : false),
  })
export const useMetrics = () => useQuery({ queryKey: qk.metrics, queryFn: api.metrics, refetchInterval: 15_000 })

type RunFilter = { status?: string; family?: string; review_status?: string; since?: string; until?: string; limit?: number }
export const useRunsInfinite = (q: RunFilter, enabled = true) =>
  useInfiniteQuery({
    enabled,
    queryKey: qk.runs(q),
    queryFn: ({ pageParam }) => api.listRuns({ ...q, before: pageParam }),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.next_before ?? undefined,
    refetchInterval: 20_000,
  })
export const useReviewQueue = (q: { family?: string }, enabled = true) =>
  useInfiniteQuery({
    enabled,
    queryKey: qk.review(q),
    queryFn: ({ pageParam }) => api.reviewQueue({ ...q, before: pageParam, limit: 50 }),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.next_before ?? undefined,
    refetchInterval: 15_000,
  })

/** Invalidate everything a card/reference change can affect. */
export function useInvalidateCards() {
  const qc = useQueryClient()
  return (id?: string) => {
    qc.invalidateQueries({ queryKey: qk.cards })
    qc.invalidateQueries({ queryKey: qk.registry })
    qc.invalidateQueries({ queryKey: qk.ready })
    if (id) qc.invalidateQueries({ queryKey: qk.card(id) })
  }
}

export function useReviewMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: T.ReviewIn }) => api.reviewRun(id, body),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["review"] })
      qc.invalidateQueries({ queryKey: ["runs"] })
      qc.invalidateQueries({ queryKey: qk.run(v.id) })
      qc.invalidateQueries({ queryKey: ["stats"] })
      if (v.body.enroll) qc.invalidateQueries({ queryKey: qk.cards })
    },
  })
}
