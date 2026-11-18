// Renders the stage trace produced by cardagent/pipeline.py (live from the NDJSON stream, or stored with a run).
import * as React from "react"
import { ArrowRight, ChevronDown } from "lucide-react"
import type { StepState } from "@/api/types"
import { cn } from "@/lib/utils"
import { rgbHex } from "@/lib/color"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DecisionBadge, ScoreBar, StepIcon, stepTone } from "@/components/status"
import { AuthImage, refImagePath } from "@/components/auth-image"

/* eslint-disable @typescript-eslint/no-explicit-any */

const shortTitle: Record<string, string> = {
  ingest: "Ingest",
  quality: "Quality",
  normalise: "Normalise",
  ocr: "OCR",
  family: "Family",
  variant: "Variant",
  fields: "Fields",
  rules: "Rules",
  decision: "Decision",
}

export function shortOutcome(s: StepState): string {
  const d = s.detail
  if (s.status === "pending") return "waiting"
  if (s.status === "running") return "running…"
  if (s.status === "skip") return "skipped"
  switch (s.id) {
    case "ingest":
      return s.status === "fail" ? "invalid image" : "received"
    case "quality":
      return s.status === "fail" ? (d?.issues ?? []).map((x: string) => x.toLowerCase().replace(/_/g, " ")).join(", ") || "retake" : "ok"
    case "normalise":
      return d?.card_detected ? `card found (${d.detector})` : "no outline"
    case "ocr":
      return d?.rotation ? `${d.tokens?.length ?? 0} tokens · 180°` : `${d?.tokens?.length ?? 0} tokens`
    case "family":
      if (d?.outcome === "unknown") return "unknown card"
      if (d?.outcome === "ambiguous") return "ambiguous"
      return d?.candidates?.[0]?.name ?? "done"
    case "variant":
      return s.status === "warn" ? "ambiguous" : (d?.candidates?.[0]?.name?.split(" ").slice(-1)[0] ?? "done")
    case "fields": {
      const f = d?.fields as any[] | undefined
      return f ? `${f.filter((x) => x.valid_format).length}/${f.length} fields` : "done"
    }
    case "rules": {
      const fails = (d?.results as any[] | undefined)?.filter((x) => x.result === "fail") ?? []
      return fails.length ? fails.map((f) => `${f.rule.replace(/_/g, " ")}`).join(", ") : "all pass"
    }
    case "decision":
      return d?.status ?? s.summary
  }
  return s.summary
}

const KEY_STEPS = ["quality", "ocr", "family", "variant", "rules", "decision"]

/** One-line flow, e.g.  Quality → OCR → Family · unknown card → REJECT */
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
              <button type="button" onClick={() => onSelect?.(s.id)} className="rounded-md">
                <DecisionBadge status={s.detail.status} className="h-7 px-3 text-xs" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onSelect?.(s.id)}
                className={cn("flex items-center gap-1.5 rounded-md border px-2 py-1 text-left text-xs transition-colors", stepTone[s.status], selected === s.id && "ring-ring/60 ring-2")}
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
        const open = selected === s.id
        const canOpen = !!s.detail && s.status !== "pending" && s.status !== "running"
        return (
          <li key={s.id} id={`step-${s.id}`} className="relative pl-9">
            {i < steps.length - 1 && <span className={cn("absolute top-8 left-[15px] h-[calc(100%-1rem)] w-px", s.status === "pending" || s.status === "skip" ? "bg-border" : "bg-foreground/20")} />}
            <span className={cn("bg-background absolute top-1.5 left-0 flex size-[31px] items-center justify-center rounded-full border", stepTone[s.status])}>
              <StepIcon status={s.status} />
            </span>
            <div className={cn("bg-card rounded-lg border transition-colors", s.status === "running" && "border-chart-4/50", open && "shadow-sm")}>
              <button type="button" className="flex w-full items-center gap-3 px-3 py-2 text-left disabled:cursor-default" disabled={!canOpen} onClick={() => setSelected(open ? null : s.id)}>
                <span className="text-muted-foreground w-6 font-mono text-[11px]">[{s.stage}]</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{s.title}</span>
                  <span className="text-muted-foreground block truncate text-xs">{s.summary || (s.status === "pending" ? "waiting" : s.status === "running" ? "running…" : "")}</span>
                </span>
                {s.ms > 0 && s.status !== "running" && <span className="text-muted-foreground tabular text-[11px]">{s.ms} ms</span>}
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

const n2 = (x: unknown) => (typeof x === "number" ? x.toFixed(2) : "—")

function RefThumb({ id }: { id?: string | null }) {
  if (!id) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-block align-middle">
          <AuthImage path={refImagePath(id, 160)} className="h-6 w-[38px] rounded border object-cover" />
        </span>
      </TooltipTrigger>
      <TooltipContent>closest reference: {id}</TooltipContent>
    </Tooltip>
  )
}

export function StepDetail({ step }: { step: StepState }) {
  const d = step.detail
  if (!d) return null
  switch (step.id) {
    case "ingest":
      return (
        <dl className="grid grid-cols-[120px_1fr] gap-y-1 text-xs">
          <dt className="text-muted-foreground">request_id</dt>
          <dd><Mono>{d.request_id}</Mono></dd>
          {d.width && (
            <>
              <dt className="text-muted-foreground">resolution</dt>
              <dd className="tabular">{d.width} × {d.height}</dd>
            </>
          )}
          <dt className="text-muted-foreground">size</dt>
          <dd className="tabular">{Math.round((d.bytes ?? 0) / 1024)} KB</dd>
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
                <TableCell className="tabular text-muted-foreground text-right text-xs">{c.op === "between" ? `${c.limit[0]} – ${c.limit[1]}` : `${c.op} ${c.limit}`}</TableCell>
                <TableCell className="text-right">{c.ok ? <Badge variant="outline" className="text-accept">pass</Badge> : <Badge variant="outline" className="text-reject">{c.code}</Badge>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )
    case "normalise":
      return (
        <p className="text-muted-foreground text-xs">
          {d.card_detected ? (
            <>Card outline found by the <b className="text-foreground">{d.detector}</b> detector and perspective-warped to the ISO ID-1 canvas ({d.size?.join("×")}).</>
          ) : (
            <>No card outline was found, so the whole frame was resized to {d.size?.join("×")}. Field ROIs may not line up — crop closer to the card for best results.</>
          )}
        </p>
      )
    case "ocr":
      return (
        <div className="space-y-3">
          <p className="text-muted-foreground text-xs">
            Engine <Mono className="text-foreground">{d.engine}</Mono> · languages <Mono className="text-foreground">{d.languages}</Mono> · mean confidence <Mono className="text-foreground">{n2(d.mean_conf)}</Mono>
          </p>
          {d.orientations?.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {d.orientations.map((o: any) => (
                <div key={o.rotation} className={cn("rounded-md border px-3 py-1.5 text-xs", o.rotation === d.rotation && "border-accept/50 bg-accept/8")}>
                  <div className="font-medium">{o.rotation}°{o.rotation === d.rotation && " · used"}</div>
                  <div className="text-muted-foreground tabular">keyword {n2(o.keyword_score)} · conf {n2(o.mean_conf)}</div>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {d.tokens?.map((t: any, i: number) => (
              <Tooltip key={i}>
                <TooltipTrigger asChild>
                  <span className={cn("rounded border px-1.5 py-0.5 font-mono text-[11px]", t.conf < 0.6 ? "border-review/50 bg-review/10" : "bg-muted/50")} dir="auto">{t.text}</span>
                </TooltipTrigger>
                <TooltipContent>confidence {t.conf}</TooltipContent>
              </Tooltip>
            ))}
            {!d.tokens?.length && <span className="text-muted-foreground text-xs">No text was read from this image.</span>}
          </div>
        </div>
      )
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
                    {c.name ?? c.family}
                    {c.keyword_hit && <span className="text-muted-foreground ml-1 font-normal" dir="auto">“{c.keyword_hit}”</span>}
                    {c.negative_hit && <Badge variant="outline" className="text-reject ml-1">neg: {c.negative_hit}</Badge>}
                  </TableCell>
                  <TableCell className="tabular text-right text-xs">{n2(c.signals?.text)}</TableCell>
                  <TableCell className="tabular text-right text-xs">
                    <span className="inline-flex items-center gap-1.5">{n2(c.signals?.visual)} <RefThumb id={c.best_ref} /></span>
                  </TableCell>
                  <TableCell className="tabular text-right text-xs">{n2(c.signals?.colour)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <ScoreBar value={c.score} threshold={d.tau} tone={i === 0 && c.score >= d.tau ? "bg-accept" : "bg-muted-foreground/50"} />
                      <span className="tabular w-9 text-right text-xs">{n2(c.score)}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-muted-foreground text-xs">
            score = w_t·S_text + w_v·S_visual + w_c·S_colour (weights from each family's YAML) · margin top-1 − top-2 = <Mono className="text-foreground">{d.margin}</Mono> (needs ≥ δ {d.delta}) · outcome <b className="text-foreground">{d.outcome}</b>
            {d.body_rgb && (
              <span className="ml-2 inline-flex items-center gap-1 align-middle">
                · body colour <span className="inline-block size-3 rounded-sm border" style={{ background: rgbHex(d.body_rgb) }} /> <Mono>{rgbHex(d.body_rgb)}</Mono>
              </span>
            )}
          </p>
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
                <TableHead className="text-right">Visual</TableHead>
                <TableHead className="text-right">Prefix</TableHead>
                <TableHead className="w-40">Score (τ {d.tau})</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.candidates?.map((c: any, i: number) => (
                <TableRow key={c.variant}>
                  <TableCell className="text-xs font-medium">
                    <span className="mr-2 inline-block size-3 rounded-sm border align-middle" style={{ background: rgbHex(c.rgb) }} />
                    {c.name ?? c.variant}
                  </TableCell>
                  <TableCell className="tabular text-right text-xs">{n2(c.signals?.colour)}</TableCell>
                  <TableCell className="tabular text-right text-xs">{n2(c.signals?.keyword)}</TableCell>
                  <TableCell className="tabular text-right text-xs">
                    <span className="inline-flex items-center gap-1.5">{n2(c.signals?.visual)} <RefThumb id={c.best_ref} /></span>
                  </TableCell>
                  <TableCell className="tabular text-right text-xs">{c.signals?.prefix ? "yes" : "no"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <ScoreBar value={c.score} threshold={d.tau} tone={i === 0 && step.status === "pass" ? "bg-accept" : "bg-muted-foreground/50"} />
                      <span className="tabular w-9 text-right text-xs">{n2(c.score)}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-muted-foreground text-xs">
            Only this family's variants are compared. Card number seen <Mono className="text-foreground">{d.number_seen ?? "—"}</Mono> · margin <Mono className="text-foreground">{d.margin}</Mono> (δ {d.delta})
          </p>
        </div>
      )
    case "fields":
      return (
        <div className="space-y-2">
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
                  <TableCell className="max-w-[260px]">
                    {f.valid_format ? (
                      <Mono>{f.value}</Mono>
                    ) : (
                      <span className="text-reject text-xs">
                        {f.value ? <>invalid format: <Mono>{f.value}</Mono></> : "not read"}
                        {f.raw && f.raw !== f.value && <span className="text-muted-foreground block truncate">raw “{f.raw}”</span>}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{f.source}</TableCell>
                  <TableCell className={cn("tabular text-right text-xs", f.valid_format && f.confidence < d.min_conf && "text-review font-medium")}>{f.confidence ? n2(f.confidence) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-muted-foreground text-xs">ROI OCR → regex, then full-text regex. VLM fallback: {d.vlm}. Values below confidence {d.min_conf} send the card to review.</p>
        </div>
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
              {r.detail && <span className={cn("ml-auto font-mono text-[11px]", r.result === "fail" ? "text-reject" : "text-muted-foreground")}>{r.detail}</span>}
            </div>
          ))}
          {!d.results?.length && <p className="text-muted-foreground text-xs">This family defines no rules.</p>}
        </div>
      )
    case "decision":
      return (
        <div className="space-y-2 text-xs">
          <DecisionBadge status={d.status} />
          {d.reasons?.length ? (
            <div className="flex flex-wrap gap-1">
              {d.reasons.map((r: string) => <Badge key={r} variant="secondary" className="font-mono text-[10px]">{r}</Badge>)}
            </div>
          ) : (
            <p className="text-muted-foreground">Family and variant above thresholds, all required fields extracted, all rules passed.</p>
          )}
        </div>
      )
  }
  return null
}
