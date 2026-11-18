import * as React from "react"
import { ArrowRight, ChevronDown } from "lucide-react"
import { STEPS, type StepState } from "@/engine/pipeline"
import { cn } from "@/lib/utils"
import { useStore } from "@/store"
import { rgbHex } from "@/engine/vision"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DecisionBadge, ScoreBar, StepIcon, stepTone } from "@/components/status"

/* eslint-disable @typescript-eslint/no-explicit-any */

export function shortOutcome(s: StepState): string {
  const d = s.detail
  if (s.status === "pending") return "waiting"
  if (s.status === "running") return s.id === "search" && d?.scanned ? `scanning ${d.scanned}/${d.total}` : "running…"
  if (s.status === "skip") return "skipped"
  switch (s.id) {
    case "ingest":
      return "received"
    case "quality":
      return s.status === "fail" ? "retake" : "ok"
    case "normalise":
      return d?.orientation ? `rotated ${d.orientation}°` : "aligned"
    case "ocr":
      return d?.tokens ? `${d.tokens.length} tokens` : "done"
    case "embed":
      return d?.dim ? `${d.dim}-d` : "done"
    case "search":
      return d?.matched === false ? "not matching" : d?.best != null ? `match ${d.best.toFixed(2)}` : "done"
    case "family":
      if (s.status === "fail") return "unknown card"
      if (d?.outcome === "ambiguous") return "ambiguous"
      if (d?.outcome === "low_confidence") return "low confidence"
      return d?.candidates?.[0]?.name ?? "done"
    case "variant":
      return d?.candidates?.[0]?.name?.split(" ").slice(-1)[0] ?? s.summary
    case "fields": {
      const f = d?.fields as any[] | undefined
      return f ? `${f.filter((x) => x.ok).length}/${f.length} fields` : s.summary
    }
    case "rules": {
      const r = d?.results as any[] | undefined
      const fails = r?.filter((x) => x.result === "fail") ?? []
      return fails.length ? fails.map((f) => (f.reason ?? "fail").toLowerCase().replace(/_/g, " ")).join(", ") : "all pass"
    }
    case "decision":
      return d?.status ?? s.summary
  }
}

const shortTitle: Record<string, string> = {
  ingest: "Ingest",
  quality: "Quality",
  normalise: "Normalise",
  ocr: "OCR",
  embed: "Embed card",
  search: "Linear search",
  family: "Family",
  variant: "Variant",
  fields: "Fields",
  rules: "Rules",
  decision: "Decision",
}

/** The one-line flow, e.g.  Embed card → Linear search → not matching → Rejected */
const KEY_STEPS = ["embed", "search", "family", "variant", "rules", "decision"]

export function FlowStrip({ steps, onSelect, selected, compact, mini }: { steps: StepState[]; onSelect?: (id: string) => void; selected?: string | null; compact?: boolean; mini?: boolean }) {
  const visible = mini
    ? steps.filter((s) => s.status !== "skip" && s.status !== "pending" && (KEY_STEPS.includes(s.id) || s.status === "fail" || s.status === "warn"))
    : compact
      ? steps.filter((s) => s.status !== "skip" && s.status !== "pending")
      : steps
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.map((s, i) => {
        const isDecision = s.id === "decision" && s.detail?.status
        return (
          <React.Fragment key={s.id}>
            {i > 0 && <ArrowRight className={cn("size-3.5 shrink-0", s.status === "pending" || s.status === "skip" ? "text-muted-foreground/40" : "text-muted-foreground")} />}
            {isDecision ? (
              <button onClick={() => onSelect?.(s.id)} className="rounded-md">
                <DecisionBadge status={s.detail.status} className="h-7 px-3 text-xs" />
              </button>
            ) : (
              <button
                onClick={() => onSelect?.(s.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-2 py-1 text-left text-xs transition-colors",
                  stepTone[s.status],
                  selected === s.id && "ring-2 ring-ring/60"
                )}
              >
                <StepIcon status={s.status} className="size-3.5" />
                <span className="font-medium">{shortTitle[s.id]}</span>
                {s.status !== "pending" && s.status !== "skip" && <span className="text-muted-foreground max-w-40 truncate">· {shortOutcome(s)}</span>}
              </button>
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

export function StepTimeline({ steps, selected, setSelected }: { steps: StepState[]; selected: string | null; setSelected: (id: string | null) => void }) {
  return (
    <ol className="relative space-y-2">
      {steps.map((s, i) => {
        const meta = STEPS.find((x) => x.id === s.id)!
        const open = selected === s.id
        const canOpen = !!s.detail && s.status !== "pending"
        return (
          <li key={s.id} id={`step-${s.id}`} className="relative pl-9">
            {i < steps.length - 1 && <span className={cn("absolute top-8 left-[15px] h-[calc(100%-1rem)] w-px", s.status === "pending" || s.status === "skip" ? "bg-border" : "bg-foreground/20")} />}
            <span className={cn("absolute top-1.5 left-0 flex size-[31px] items-center justify-center rounded-full border bg-background", stepTone[s.status])}>
              <StepIcon status={s.status} />
            </span>
            <div className={cn("rounded-lg border bg-card transition-colors", s.status === "running" && "border-chart-4/50", open && "shadow-sm")}>
              <button className="flex w-full items-center gap-3 px-3 py-2 text-left disabled:cursor-default" disabled={!canOpen} onClick={() => setSelected(open ? null : s.id)}>
                <span className="text-muted-foreground w-6 font-mono text-[11px]">[{meta.stage}]</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{meta.title}</span>
                  <span className="text-muted-foreground block truncate text-xs">{s.summary || (s.status === "pending" ? "waiting" : "")}</span>
                </span>
                {s.ms > 0 && <span className="text-muted-foreground tabular text-[11px]">{s.ms} ms</span>}
                {canOpen && <ChevronDown className={cn("text-muted-foreground size-4 transition-transform", open && "rotate-180")} />}
              </button>
              {open && canOpen && (
                <div className="animate-in fade-in-0 slide-in-from-top-1 border-t px-3 py-3">
                  <StepDetail step={s} />
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("font-mono text-xs", className)}>{children}</span>
}

export function StepDetail({ step }: { step: StepState }) {
  const d = step.detail
  const { index } = useStore()
  switch (step.id) {
    case "ingest":
      return (
        <dl className="grid grid-cols-[120px_1fr] gap-y-1 text-xs">
          <dt className="text-muted-foreground">request_id</dt>
          <dd><Mono>{d.request_id}</Mono></dd>
          <dt className="text-muted-foreground">source</dt>
          <dd>{d.source}</dd>
          <dt className="text-muted-foreground">resolution</dt>
          <dd className="tabular">{d.width} × {d.height}</dd>
        </dl>
      )
    case "quality":
      return (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Check</TableHead>
              <TableHead className="text-right">Measured</TableHead>
              <TableHead className="text-right">Limit</TableHead>
              <TableHead className="text-right">Result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(d.checks ?? []).map((c: any, i: number) => (
              <TableRow key={i}>
                <TableCell className="text-xs">{c.name}</TableCell>
                <TableCell className="tabular text-right text-xs">{c.value}</TableCell>
                <TableCell className="tabular text-muted-foreground text-right text-xs">{c.op} {c.limit}</TableCell>
                <TableCell className="text-right">{c.ok ? <Badge variant="outline" className="text-accept">pass</Badge> : <Badge variant="outline" className="text-reject">{c.code}</Badge>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )
    case "normalise":
      return (
        <div className="space-y-2 text-xs">
          <p className="text-muted-foreground">Card warped to the ISO ID-1 canvas (1012×638). Orientation is chosen by the OCR confidence of each rotation.</p>
          <div className="flex gap-2">
            {d.tried?.map((t: any) => (
              <div key={t.deg} className={cn("rounded-md border px-3 py-2", t.deg === d.orientation && "border-accept/50 bg-accept/8")}>
                <div className="font-medium">{t.deg}°</div>
                <div className="text-muted-foreground tabular">OCR conf {Number.isNaN(t.ocr_conf) ? "n/a" : t.ocr_conf}</div>
              </div>
            ))}
          </div>
        </div>
      )
    case "ocr":
      return (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">Engine: {d.engine}</p>
          <div className="flex flex-wrap gap-1.5">
            {d.tokens?.map((t: any, i: number) => (
              <Tooltip key={i}>
                <TooltipTrigger asChild>
                  <span className={cn("rounded border px-1.5 py-0.5 font-mono text-[11px]", t.conf < 0.6 ? "border-review/50 bg-review/10" : "bg-muted/50")} dir="auto">
                    {t.text}
                  </span>
                </TooltipTrigger>
                <TooltipContent>confidence {t.conf}</TooltipContent>
              </Tooltip>
            ))}
            {!d.tokens?.length && <span className="text-muted-foreground text-xs">No text. In browser mode you can type the printed text for uploads, or switch to API mode for Tesseract OCR.</span>}
          </div>
        </div>
      )
    case "embed":
      return (
        <div className="space-y-3 text-xs">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">embedder</span>
            <Mono>{d.embedder}</Mono>
            <span className="text-muted-foreground ml-4">body colour</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-4 rounded border" style={{ background: rgbHex(d.body_rgb) }} />
              <Mono>{rgbHex(d.body_rgb)}</Mono>
            </span>
          </div>
          <VectorBars v={d.vector} />
          <p className="text-muted-foreground">36 hue×saturation bins · 40 layout cells · 32 gradient-orientation bins (L2-normalised). Production swaps in a local DINOv2/CLIP embedder.</p>
        </div>
      )
    case "search": {
      if (!d?.top) return <p className="text-muted-foreground text-xs">Scanning {d?.scanned}/{d?.total}…</p>
      return (
        <div className="space-y-3">
          <p className="text-muted-foreground text-xs">
            Linear scan: cosine similarity against all <b className="text-foreground">{d.total}</b> enrolled reference cards. Match floor <Mono>{d.floor}</Mono>.
            {!d.matched && <span className="text-reject font-medium"> No reference is similar enough — not matching.</span>}
          </p>
          <div className="space-y-1.5">
            {d.top.map((t: any, i: number) => {
              const ref = index.find((r) => r.id === t.ref_id)
              return (
                <div key={t.ref_id} className="flex items-center gap-3">
                  <span className="text-muted-foreground w-4 text-xs">{i + 1}</span>
                  {ref ? <img src={ref.thumb} className="h-8 w-[51px] rounded border object-cover" /> : <span className="bg-muted h-8 w-[51px] rounded border" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="truncate font-medium">{t.family} / {t.variant}</span>
                      <span className="tabular">{t.sim.toFixed(3)}</span>
                    </div>
                    <ScoreBar value={t.sim} threshold={d.floor} tone={t.sim >= d.floor ? "bg-accept" : "bg-reject/70"} className="mt-1" />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )
    }
    case "family":
      return (
        <div className="space-y-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Family</TableHead>
                <TableHead className="text-right">S_text</TableHead>
                <TableHead className="text-right">S_visual</TableHead>
                <TableHead className="text-right">S_colour</TableHead>
                <TableHead className="w-40">Fused score (τ {d.tau})</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.candidates?.map((c: any, i: number) => (
                <TableRow key={c.family}>
                  <TableCell className="text-xs font-medium">
                    {c.name}
                    {c.keyword_hit && <span className="text-muted-foreground ml-1 font-normal" dir="auto">“{c.keyword_hit}”</span>}
                    {c.negative_hit && <Badge variant="outline" className="text-reject ml-1">neg: {c.negative_hit}</Badge>}
                  </TableCell>
                  <TableCell className="tabular text-right text-xs">{c.text?.toFixed?.(2) ?? "—"}</TableCell>
                  <TableCell className="tabular text-right text-xs">{c.visual?.toFixed?.(2) ?? "—"}</TableCell>
                  <TableCell className="tabular text-right text-xs">{c.colour?.toFixed?.(2) ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <ScoreBar value={c.score} threshold={d.tau} tone={i === 0 && c.score >= d.tau ? "bg-accept" : "bg-muted-foreground/50"} />
                      <span className="tabular w-9 text-right text-xs">{c.score.toFixed(2)}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {d.margin != null && (
            <p className="text-muted-foreground text-xs">
              score = w_t·S_text + w_v·S_visual + w_c·S_colour · margin top1−top2 = <Mono className="text-foreground">{d.margin}</Mono> (needs ≥ δ {d.delta}) · outcome <b className="text-foreground">{d.outcome}</b>
            </p>
          )}
        </div>
      )
    case "variant":
      return (
        <div className="space-y-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Variant</TableHead>
                <TableHead className="text-right">Colour</TableHead>
                <TableHead className="text-right">Keyword</TableHead>
                <TableHead className="text-right">Prefix</TableHead>
                <TableHead className="w-40">Score (τ {d.tau})</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.candidates?.map((c: any, i: number) => (
                <TableRow key={c.variant}>
                  <TableCell className="text-xs font-medium">
                    <span className="mr-2 inline-block size-3 rounded-sm border align-middle" style={{ background: rgbHex(c.rgb) }} />
                    {c.name}
                  </TableCell>
                  <TableCell className="tabular text-right text-xs">{c.colour.toFixed(2)}</TableCell>
                  <TableCell className="tabular text-right text-xs">{c.keyword.toFixed(2)}</TableCell>
                  <TableCell className="tabular text-right text-xs">{c.prefix.toFixed(1)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <ScoreBar value={c.score} threshold={d.tau} tone={i === 0 ? "bg-accept" : "bg-muted-foreground/50"} />
                      <span className="tabular w-9 text-right text-xs">{c.score.toFixed(2)}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-muted-foreground text-xs">
            Only this family's variants are compared. Card number seen: <Mono className="text-foreground">{d.number_seen ?? "—"}</Mono> · margin <Mono className="text-foreground">{d.margin}</Mono> (δ {d.delta})
          </p>
        </div>
      )
    case "fields":
      return (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Field</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Conf.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {d.fields?.map((f: any) => (
              <TableRow key={f.name}>
                <TableCell className="text-xs">
                  {f.name}
                  {f.required && <span className="text-reject">*</span>}
                </TableCell>
                <TableCell>
                  {f.value ? <Mono>{f.value}{f.iso && <span className="text-muted-foreground"> → {f.iso}</span>}</Mono> : <span className="text-reject text-xs">not found</span>}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">{f.source}</TableCell>
                <TableCell className="tabular text-right text-xs">{f.confidence ? f.confidence.toFixed(2) : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )
    case "rules":
      return (
        <div className="space-y-1.5">
          {d.results?.map((r: any, i: number) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <StepIcon status={r.result === "pass" ? "pass" : r.result === "skip" ? "skip" : r.critical ? "fail" : "warn"} className="size-3.5" />
              <Mono className="w-44">{r.rule}</Mono>
              <span className="text-muted-foreground w-28">{r.field}</span>
              {r.critical && <Badge variant="outline" className="text-[10px]">critical</Badge>}
              {r.reason && <span className={cn("ml-auto font-mono text-[11px]", r.result === "fail" ? "text-reject" : "text-muted-foreground")}>{r.reason}</span>}
            </div>
          ))}
        </div>
      )
    case "decision":
      return (
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <DecisionBadge status={d.status} />
            {d.confidence != null && <span className="text-muted-foreground">confidence {d.confidence}</span>}
          </div>
          {d.reasons?.length ? (
            <div className="flex flex-wrap gap-1">
              {d.reasons.map((r: string) => (
                <Badge key={r} variant="secondary" className="font-mono text-[10px]">{r}</Badge>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">All thresholds met, all required fields extracted, all critical rules passed.</p>
          )}
        </div>
      )
  }
  return null
}

function VectorBars({ v }: { v: number[] }) {
  if (!v?.length) return null
  const max = Math.max(...v.map(Math.abs)) || 1
  const W = 2.6
  return (
    <svg viewBox={`0 0 ${v.length * W} 40`} className="h-10 w-full" preserveAspectRatio="none">
      <line x1={0} x2={v.length * W} y1={20} y2={20} className="stroke-border" strokeWidth={0.3} />
      {v.map((x, i) => {
        const h = (Math.abs(x) / max) * 19
        const seg = i < 36 ? "fill-chart-2" : i < 76 ? "fill-chart-4" : "fill-chart-1"
        return <rect key={i} x={i * W} y={x >= 0 ? 20 - h : 20} width={W - 0.6} height={Math.max(0.4, h)} className={seg} />
      })}
    </svg>
  )
}
