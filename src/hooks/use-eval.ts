// Runs the service's labelled-set evaluation (POST /v1/eval) and exposes streaming progress.
import * as React from "react"
import { stream, json } from "@/api/client"
import type { EvalEvent, EvalRow, EvalSummary, Thresholds } from "@/api/types"

export function useEvaluation() {
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null)
  const [rows, setRows] = React.useState<EvalRow[]>([])
  const [summary, setSummary] = React.useState<EvalSummary | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const run = React.useCallback(async (thresholds?: Partial<Thresholds>) => {
    setRows([])
    setSummary(null)
    setError(null)
    setProgress({ done: 0, total: 0 })
    try {
      for await (const ev of stream<EvalEvent>("/v1/eval", json("POST", { thresholds: thresholds ?? null }))) {
        if (ev.event === "start") setProgress({ done: 0, total: ev.total })
        else if (ev.event === "case") {
          setRows((r) => [...r, ev])
          setProgress((p) => ({ done: ev.index + 1, total: p?.total ?? 0 }))
        } else if (ev.event === "summary") setSummary(ev)
        else if (ev.event === "error") setError(ev.message)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setProgress(null)
    }
  }, [])

  return { run, progress, rows, summary, error, running: progress !== null }
}
