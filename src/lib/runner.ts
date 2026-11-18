import * as React from "react"
import { runPipeline, STEPS, type PipelineResult, type StepState, type TraceUpdate } from "@/engine/pipeline"
import { buildSample, SAMPLE_CASES, type SampleCase } from "@/engine/samples"
import { apiValidate, traceFromResult } from "@/engine/api"
import { loadImage, makeCanvas } from "@/engine/vision"
import { useStore, type RunRecord } from "@/store"

export const newRequestId = () => "req_" + Math.random().toString(36).slice(2, 10)

export type RunInput =
  | { kind: "sample"; sample: SampleCase }
  | { kind: "upload"; file: File; dataUrl: string; manualText?: string }

export function initialSteps(): StepState[] {
  return STEPS.map((s) => ({ id: s.id, status: "pending", summary: "", ms: 0, detail: null }))
}

function thumb(src: HTMLCanvasElement | HTMLImageElement, w = 253, h = 160) {
  const c = makeCanvas(w, h)
  c.getContext("2d")!.drawImage(src, 0, 0, w, h)
  return c.toDataURL("image/jpeg", 0.75)
}

/** Drives one validation and exposes the live trace to React. */
export function useRunner() {
  const store = useStore()
  const [trace, setTrace] = React.useState<TraceUpdate>({ steps: initialSteps() })
  const [running, setRunning] = React.useState(false)
  const [inputUrl, setInputUrl] = React.useState<string | null>(null)
  const cancel = React.useRef(false)

  const run = React.useCallback(
    async (input: RunInput, opts: { delay?: number } = {}): Promise<RunRecord | null> => {
      cancel.current = false
      setRunning(true)
      setTrace({ steps: initialSteps() })
      const request_id = newRequestId()
      try {
        let canvas: HTMLCanvasElement
        let label: string
        let rec: Partial<RunRecord>
        if (input.kind === "sample") {
          const s = buildSample(input.sample, store.families)
          if (!s) throw new Error("sample family/variant no longer in registry")
          canvas = s.canvas
          label = input.sample.label
          rec = { source: "sample", sampleId: input.sample.id, expected: input.sample.expected, truth: { family: input.sample.custom ? undefined : input.sample.family, variant: input.sample.variant } }
          setInputUrl(canvas.toDataURL("image/jpeg", 0.85))
          if (store.settings.mode === "api") {
            const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), "image/jpeg", 0.92))
            return await viaApi(blob, request_id, label, { ...rec, thumb: thumb(canvas) })
          }
          const gen = runPipeline(
            { request_id, image: canvas, printed: s.tokens, fx: input.sample.fx, origW: canvas.width, origH: canvas.height, sourceLabel: "labelled sample" },
            { families: store.families, index: store.index, settings: { ...store.settings, step_delay_ms: opts.delay ?? store.settings.step_delay_ms }, registryVersion: store.version }
          )
          return await drain(gen, request_id, label, { ...rec, thumb: thumb(canvas) })
        } else {
          const im = await loadImage(input.dataUrl)
          canvas = makeCanvas(im.width, im.height)
          canvas.getContext("2d")!.drawImage(im, 0, 0)
          label = input.file.name
          setInputUrl(input.dataUrl)
          if (store.settings.mode === "api") return await viaApi(input.file, request_id, label, { source: "api", thumb: thumb(im) })
          const gen = runPipeline(
            { request_id, image: canvas, manualText: input.manualText, origW: im.width, origH: im.height, sourceLabel: "uploaded photo" },
            { families: store.families, index: store.index, settings: { ...store.settings, step_delay_ms: opts.delay ?? store.settings.step_delay_ms }, registryVersion: store.version }
          )
          return await drain(gen, request_id, label, { source: "upload", thumb: thumb(im) })
        }
      } catch (e) {
        setTrace((t) => ({ ...t, error: (e as Error).message }) as TraceUpdate)
        return null
      } finally {
        setRunning(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store.families, store.index, store.settings, store.version]
  )

  async function drain(gen: AsyncGenerator<TraceUpdate, PipelineResult>, id: string, label: string, rec: Partial<RunRecord>) {
    let last: TraceUpdate | null = null
    for await (const u of gen) {
      last = u
      setTrace(u)
      if (cancel.current) break
    }
    if (!last?.result) return null
    const r: RunRecord = { id, at: new Date().toISOString(), label, result: last.result, steps: stripHeavy(last.steps), source: "sample", ...rec } as RunRecord
    store.addRun(r)
    return r
  }

  async function viaApi(blob: Blob, id: string, label: string, rec: Partial<RunRecord>) {
    const steps = initialSteps()
    steps[0].status = "running"
    setTrace({ steps })
    const result = await apiValidate(store.settings.api_base, blob, id)
    const st = traceFromResult(result)
    setTrace({ steps: st, result })
    const r: RunRecord = { id, at: new Date().toISOString(), label, result, steps: st, source: "api", ...rec } as RunRecord
    store.addRun(r)
    return r
  }

  return { trace, running, run, inputUrl, stop: () => (cancel.current = true), reset: () => (setTrace({ steps: initialSteps() }), setInputUrl(null)) }
}

/** Keep stored runs small: drop thumbnails / full vectors from step details. */
export function stripHeavy(steps: StepState[]): StepState[] {
  return steps.map((s) => {
    if (!s.detail) return s
    const d = { ...s.detail }
    if (s.id === "search") {
      d.top = d.top?.map((t: { thumb?: string }) => ({ ...t, thumb: undefined }))
    }
    return { ...s, detail: d }
  })
}

/** Batch evaluation over every labelled sample (no animation) — the console twin of tests/run_eval.py. */
export function useEvalSuite() {
  const store = useStore()
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null)
  const runAll = React.useCallback(
    async (repeat = 1) => {
      const cases = SAMPLE_CASES.filter((c) => c.custom || store.families.some((f) => f.family === c.family))
      const total = cases.length * repeat
      let done = 0
      setProgress({ done, total })
      for (let k = 0; k < repeat; k++)
        for (const c of cases) {
          const s = buildSample(c, store.families)
          if (!s) continue
          const request_id = newRequestId()
          const gen = runPipeline(
            { request_id, image: s.canvas, printed: s.tokens, fx: c.fx, origW: s.canvas.width, origH: s.canvas.height, sourceLabel: "evaluation suite" },
            { families: store.families, index: store.index, settings: { ...store.settings, step_delay_ms: 0 }, registryVersion: store.version }
          )
          let last: TraceUpdate | null = null
          for await (const u of gen) last = u
          if (last?.result) {
            // spread runs over the last 7 days so the dashboard trend has shape in the demo
            const at = new Date(Date.now() - (repeat > 1 ? Math.random() * 6.5 * 86400000 : 0)).toISOString()
            store.addRun({ id: request_id, at, source: "sample", sampleId: c.id, label: c.label, expected: c.expected, truth: { family: c.custom ? undefined : c.family, variant: c.variant }, thumb: thumb(s.canvas, 126, 80), result: last.result, steps: stripHeavy(last.steps) })
          }
          done++
          setProgress({ done, total })
          await new Promise((r) => setTimeout(r, 0))
        }
      setProgress(null)
      return total
    },
    [store]
  )
  return { runAll, progress }
}
