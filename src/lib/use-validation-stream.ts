// Drives POST /v1/cards/validate/stream and exposes the live StepState list to React.
import * as React from "react"
import { api } from "@/api/endpoints"
import { ApiError } from "@/api/client"
import type { StepState, StreamSnapshot, ValidationResult } from "@/api/types"

export const STEP_IDS = ["ingest", "quality", "normalise", "ocr", "embed", "search", "family", "variant", "fields", "rules", "decision"] as const

export const pendingSteps = (): StepState[] => STEP_IDS.map((id) => ({ id, status: "pending", summary: "", ms: 0, detail: null }))

export interface StreamState {
  steps: StepState[]
  normalisedUrl?: string
  result?: ValidationResult
  error?: string
  running: boolean
  startedAt?: number
  elapsedMs?: number
}

export function useValidationStream() {
  const [state, setState] = React.useState<StreamState>({ steps: pendingSteps(), running: false })
  const ctl = React.useRef<AbortController | null>(null)

  const start = React.useCallback(async (file: Blob, filename: string, opts: { requestId?: string; store?: boolean }) => {
    ctl.current?.abort()
    const ac = new AbortController()
    ctl.current = ac
    const t0 = performance.now()
    setState({ steps: pendingSteps(), running: true, startedAt: Date.now() })
    try {
      await api.validateStream(
        file,
        filename,
        (event, data) => {
          setState((s) => {
            switch (event) {
              case "snapshot": {
                const d = data as StreamSnapshot
                return { ...s, steps: d.steps, normalisedUrl: d.normalisedUrl ?? s.normalisedUrl }
              }
              case "step": {
                const st = data as StepState
                return { ...s, steps: s.steps.map((x) => (x.id === st.id ? st : x)) }
              }
              case "image":
                return { ...s, normalisedUrl: (data as { normalisedUrl: string }).normalisedUrl }
              case "result": {
                const d = data as StreamSnapshot
                return { ...s, steps: d.steps, normalisedUrl: d.normalisedUrl ?? s.normalisedUrl, result: d.result, running: false, elapsedMs: performance.now() - t0 }
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
    setState({ steps: pendingSteps(), running: false })
  }
  React.useEffect(() => () => ctl.current?.abort(), [])
  return { ...state, start, cancel, reset }
}

export const newRequestId = () => `web-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 8)}`
