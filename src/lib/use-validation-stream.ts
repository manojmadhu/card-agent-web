// Drives POST /v1/cards/validate/stream and exposes the live StepState list to React.
import * as React from "react"
import { api, type CardPhotos } from "@/api/endpoints"
import { ApiError } from "@/api/client"
import type { StepState, StreamPhoto, StreamSnapshot, ValidationResult } from "@/api/types"

export const STEP_IDS = ["ingest", "quality", "normalise", "ocr", "embed", "search", "family", "variant", "fields", "rules", "decision"] as const

const STAGE_TEXT: Record<string, string> = {
  ingest: "Receiving the photo…",
  quality: "Checking photo quality…",
  normalise: "Finding and straightening the card…",
  ocr: "Reading the text…",
  embed: "Computing the card fingerprint…",
  search: "Comparing with reference cards…",
  family: "Identifying the programme…",
  variant: "Identifying the tier…",
  fields: "Reading the fields…",
  rules: "Checking the rules…",
  decision: "Making the decision…",
}

/** Plain-language label of the stage in progress (the running step, else the next pending one). */
export function stageLabel(steps: StepState[]): string {
  const cur = steps.find((x) => x.status === "running") ?? steps.find((x) => x.status === "pending")
  return (cur && STAGE_TEXT[cur.id]) ?? "Processing…"
}

export const pendingSteps = (): StepState[] => STEP_IDS.map((id) => ({ id, status: "pending", summary: "", ms: 0, detail: null }))

export interface StreamState {
  steps: StepState[]
  normalisedUrl?: string
  /** 2.1: one entry per photo with its straightened image; a single-photo 2.0 stream leaves this empty. */
  photos: StreamPhoto[]
  result?: ValidationResult
  error?: string
  running: boolean
  startedAt?: number
  elapsedMs?: number
}

export function useValidationStream() {
  const [state, setState] = React.useState<StreamState>({ steps: pendingSteps(), photos: [], running: false })
  const ctl = React.useRef<AbortController | null>(null)

  const start = React.useCallback(async (photos: CardPhotos, opts: { requestId?: string; store?: boolean }) => {
    ctl.current?.abort()
    const ac = new AbortController()
    ctl.current = ac
    const t0 = performance.now()
    setState({ steps: pendingSteps(), photos: [], running: true, startedAt: Date.now() })
    // merge photo info from snapshots without losing images that arrived in photo_image events
    const mergePhotos = (old: StreamPhoto[], incoming?: StreamPhoto[]) =>
      incoming ? incoming.map((p) => ({ ...p, normalisedUrl: p.normalisedUrl ?? old.find((o) => o.photo === p.photo)?.normalisedUrl ?? null })) : old
    try {
      await api.validateStream(
        photos,
        (event: string, data: unknown) => {
          setState((s) => {
            switch (event) {
              case "snapshot": {
                const d = data as StreamSnapshot
                return { ...s, steps: d.steps, normalisedUrl: d.normalisedUrl ?? s.normalisedUrl, photos: mergePhotos(s.photos, d.photos) }
              }
              case "photo_image": {
                const d = data as { photo: number; label: string; normalisedUrl: string }
                const rest = s.photos.filter((p) => p.photo !== d.photo)
                const prev = s.photos.find((p) => p.photo === d.photo)
                return { ...s, photos: [...rest, { photo: d.photo, label: d.label, side: prev?.side ?? null, normalisedUrl: d.normalisedUrl }].sort((a, b) => a.photo - b.photo) }
              }
              case "step": {
                const st = data as StepState
                return { ...s, steps: s.steps.map((x) => (x.id === st.id ? st : x)) }
              }
              case "image":
                return { ...s, normalisedUrl: (data as { normalisedUrl: string }).normalisedUrl }
              case "result": {
                const d = data as StreamSnapshot
                return { ...s, steps: d.steps, normalisedUrl: d.normalisedUrl ?? s.normalisedUrl, photos: mergePhotos(s.photos, d.photos), result: d.result, running: false, elapsedMs: performance.now() - t0 }
              }
              case "error":
                return { ...s, error: (data as { detail: string }).detail, running: false }
              default:
                return s
            }
          })
        },
        { ...opts, signal: ac.signal }
      )
      setState((s) => (s.running ? { ...s, running: false, error: s.result ? undefined : "The stream ended before a result arrived" } : s))
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setState((s) => ({ ...s, running: false, error: "Cancelled" }))
        return
      }
      setState((s) => ({ ...s, running: false, error: e instanceof ApiError ? e.message : String(e) }))
    }
  }, [])

  const cancel = () => ctl.current?.abort()
  const reset = () => {
    ctl.current?.abort()
    setState({ steps: pendingSteps(), photos: [], running: false })
  }
  React.useEffect(() => () => ctl.current?.abort(), [])
  return { ...state, start, cancel, reset }
}

export const newRequestId = () => `web-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 8)}`
