// Drives one live validation: uploads the image to /v1/cards/validate/stream and folds the NDJSON
// stage events into the step list the timeline renders.
import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { stream } from "@/api/client"
import { invalidateRuns } from "@/api/hooks"
import { STAGES, type RunSummary, type StepState, type StreamEvent, type ValidationResult } from "@/api/types"

export const initialSteps = (): StepState[] => STAGES.map((s) => ({ ...s, status: "pending", summary: "", ms: 0, detail: null }))

export interface ValidationState {
  steps: StepState[]
  running: boolean
  result: ValidationResult | null
  run: RunSummary | null
  error: string | null
}

export function useValidation() {
  const qc = useQueryClient()
  const [state, setState] = React.useState<ValidationState>({ steps: initialSteps(), running: false, result: null, run: null, error: null })
  const abort = React.useRef<AbortController | null>(null)

  const start = React.useCallback(
    async (file: Blob, opts: { label?: string; requestId?: string } = {}) => {
      abort.current?.abort()
      const ac = new AbortController()
      abort.current = ac
      setState({ steps: initialSteps(), running: true, result: null, run: null, error: null })
      const fd = new FormData()
      fd.append("image", file, opts.label ?? (file instanceof File ? file.name : "card.jpg"))
      fd.append("source", "console")
      if (opts.label) fd.append("label", opts.label)
      if (opts.requestId) fd.append("request_id", opts.requestId)
      try {
        for await (const ev of stream<StreamEvent>("/v1/cards/validate/stream", { method: "POST", body: fd, signal: ac.signal })) {
          if (ev.event === "stage") {
            const { event: _e, ...step } = ev
            void _e
            setState((s) => ({ ...s, steps: s.steps.map((x) => (x.id === step.id ? step : x)) }))
          } else if (ev.event === "result") {
            setState((s) => ({ ...s, running: false, result: ev.result, run: ev.run }))
            invalidateRuns(qc)
          } else if (ev.event === "error") {
            setState((s) => ({ ...s, running: false, error: ev.message }))
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") setState((s) => ({ ...s, error: (e as Error).message }))
      } finally {
        setState((s) => ({ ...s, running: false }))
      }
    },
    [qc]
  )

  const stop = React.useCallback(() => abort.current?.abort(), [])
  const reset = React.useCallback(() => {
    abort.current?.abort()
    setState({ steps: initialSteps(), running: false, result: null, run: null, error: null })
  }, [])
  React.useEffect(() => () => abort.current?.abort(), [])
  return { ...state, start, stop, reset }
}
