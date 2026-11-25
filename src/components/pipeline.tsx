// Live pipeline rendering for the server's StepState stream (POST /v1/cards/validate/stream).
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from "react"
import { ArrowRight, ChevronDown } from "lucide-react"
import type { StepState } from "@/api/types"
import { api } from "@/api/endpoints"
import { cn } from "@/lib/utils"
import { rgbHex } from "@/lib/format"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AuthImage, DecisionBadge, ScoreBar, StepIcon } from "@/components/common"
import { useConnection } from "@/auth/connection"
import { SideBadge } from "@/components/photos"

export const STEP_META: Record<string, { title: string; short: string; stage: string; explain: string }> = {
  ingest: { title: "Ingest", short: "Ingest", stage: "0", explain: "Photo received and decoded." },
  quality: { title: "Quality gate", short: "Quality", stage: "1", explain: "Sharpness, exposure, glare and resolution. Fails fast with RETAKE_REQUIRED." },
  normalise: { title: "Normalise", short: "Normalise", stage: "2", explain: "Card found, straightened to 1012×638 and rotated upright." },
  ocr: { title: "Full-card OCR", short: "OCR", stage: "3", explain: "Local OCR (Tesseract or PaddleOCR) reads all printed text." },
  embed: { title: "Embed card", short: "Embed", stage: "4a", explain: "Visual signature, body colour and keypoints of the card." },
  search: { title: "Reference search", short: "Search", stage: "4b", explain: "Nearest reference images in Qdrant, then ORB + RANSAC geometric verification." },
  family: { title: "Family classification", short: "Family", stage: "4c", explain: "Text, visual, geometry and colour signals fused; needs score ≥ τ and margin ≥ δ." },
  variant: { title: "Variant classification", short: "Variant", stage: "5", explain: "Only this programme's variants: colour, tier keyword, geometry, number prefix." },
  fields: { title: "Field extraction", short: "Fields", stage: "6", explain: "Card aligned to the reference; each field read from its ROI and checked against its regex." },
  rules: { title: "Validation rules", short: "Rules", stage: "7", explain: "Declarative rules from the card definition. A critical failure rejects." },
  decision: { title: "Decision", short: "Decision", stage: "8", explain: "ACCEPT, REVIEW or REJECT with reason codes." },
}

export const tone: Record<string, string> = {
  pending: "border-dashed border-border text-muted-foreground bg-background",
  running: "border-chart-4/60 bg-chart-4/8 text-foreground step-running",
  pass: "border-accept/40 bg-accept/8 text-foreground",
  warn: "border-review/50 bg-review/10 text-foreground",
  fail: "border-reject/50 bg-reject/10 text-foreground",
  skip: "border-border bg-muted/40 text-muted-foreground",
}

export function outcome(s: StepState): string {
  const d = s.detail
  if (s.status === "pending") return "waiting"
  if (s.status === "running") return "running…"
  if (s.status === "skip") return "skipped"
  switch (s.id) {
    case "quality":
      return s.status === "fail" ? "retake" : "ok"
    case "normalise":
      return d?.orientation ? `rotated ${d.orientation}°` : d?.card_detected === false ? "no edges" : "aligned"
    case "ocr":
      return d?.tokens ? `${d.tokens.length} tokens` : "done"
    case "embed":
      return d?.dim ? `${d.dim}-d` : "done"
    case "search":
      return d?.matched === false ? "not matching" : d?.best != null ? `match ${Number(d.best).toFixed(2)}` : "done"
    case "family":
      return s.status === "fail" ? "unknown card" : d?.outcome === "ambiguous" ? "ambiguous" : d?.candidates?.[0]?.name ?? "done"
    case "variant":
      return d?.candidates?.[0]?.name ?? "done"
    case "fields": {
      const f = d?.fields as any[] | undefined
      return f ? `${f.filter((x) => x.ok).length}/${f.length}` : "done"
    }
    case "rules": {
      const fails = (d?.results as any[] | undefined)?.filter((x) => x.result === "fail") ?? []
      return fails.length ? fails.map((f) => f.rule.replace(/_/g, " ")).join(", ") : "all pass"
    }
    case "decision":
      return d?.status ?? s.summary
    default:
      return "ok"
  }
}

/** One-line flow, e.g. Embed → Search · not matching → Family · unknown card → REJECT */
export function FlowStrip({ steps, selected, onSelect, mini }: { steps: StepState[]; selected?: string | null; onSelect?: (id: string) => void; mini?: boolean }) {
  const KEY = ["embed", "search", "family", "variant", "rules", "decision"]
  const list = mini ? steps.filter((s) => s.status !== "pending" && s.status !== "skip" && (KEY.includes(s.id) || s.status === "fail" || s.status === "warn")) : steps
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="list" aria-label="pipeline steps">
      {list.map((s, i) => (
        <React.Fragment key={s.id}>
          {i > 0 && <ArrowRight className={cn("size-3.5 shrink-0", ["pending", "skip"].includes(s.status) ? "text-muted-foreground/40" : "text-muted-foreground")} aria-hidden />}
          {s.id === "decision" && s.detail?.status ? (
            <button role="listitem" onClick={() => onSelect?.(s.id)} className="rounded-md">
              <DecisionBadge status={s.detail.status} className="h-7 px-3 text-xs" />
            </button>
          ) : (
            <button
              role="listitem"
              onClick={() => onSelect?.(s.id)}
              className={cn("flex items-center gap-1.5 rounded-md border px-2 py-1 text-left text-xs transition-colors", tone[s.status], selected === s.id && "ring-ring/60 ring-2")}
            >
              <StepIcon status={s.status} className="size-3.5" />
              <span className="font-medium">{STEP_META[s.id]?.short ?? s.id}</span>
              {!["pending", "skip"].includes(s.status) && <span className="text-muted-foreground max-w-40 truncate">· {outcome(s)}</span>}
            </button>
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

export function StepTimeline({ steps, selected, setSelected }: { steps: StepState[]; selected: string | null; setSelected: (id: string | null) => void }) {
  return (
    <ol className="relative space-y-2">
      {steps.map((s, i) => {
        const meta = STEP_META[s.id]
        const open = selected === s.id
        const canOpen = !!s.detail && s.status !== "pending"
        return (
          <li key={s.id} id={`step-${s.id}`} className="relative pl-9">
            {i < steps.length - 1 && <span className={cn("absolute top-8 left-[15px] h-[calc(100%-1rem)] w-px", ["pending", "skip"].includes(s.status) ? "bg-border" : "bg-foreground/20")} />}
            <span className={cn("bg-background absolute top-1.5 left-0 flex size-[31px] items-center justify-center rounded-full border", tone[s.status])}>
              <StepIcon status={s.status} />
            </span>
            <div className={cn("bg-card rounded-lg border transition-colors", s.status === "running" && "border-chart-4/50", open && "shadow-sm")}>
              <button className="flex w-full items-center gap-3 px-3 py-2 text-left disabled:cursor-default" disabled={!canOpen} onClick={() => setSelected(open ? null : s.id)} aria-expanded={open}>
                <span className="text-muted-foreground w-7 font-mono text-[11px]">[{meta?.stage}]</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{meta?.title ?? s.id}</span>
                  <span className="text-muted-foreground block truncate text-xs">{s.summary || (s.status === "pending" ? meta?.explain : "")}</span>
                </span>
                {s.ms > 1 && <span className="text-muted-foreground tabular text-[11px]">{s.ms} ms</span>}
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

const Mono = ({ children, className }: { children: React.ReactNode; className?: string }) => <span className={cn("font-mono text-xs", className)}>{children}</span>
const n2 = (v: unknown) => (typeof v === "number" ? v.toFixed(2) : "—")

/** Steps run once per photo (2.1) carry detail.photos = [{photo, label, status, summary, detail}]. */
const PER_PHOTO = ["ingest", "quality", "normalise", "ocr", "embed"]

export function StepDetail({ step }: { step: StepState }) {
  const per = step.detail?.photos as { photo: number; label: string; status: StepState["status"]; summary: string; detail: unknown }[] | undefined
  if (PER_PHOTO.includes(step.id) && per && per.length > 1 && per[0]?.label !== undefined) {
    return (
      <div className="space-y-3">
        {per.map((p) => (
          <div key={p.photo} className="rounded-md border">
            <div className="bg-muted/40 flex items-center gap-2 border-b px-3 py-1.5 text-xs">
              <StepIcon status={p.status} className="size-3.5" />
              <span className="font-medium capitalize">{p.label}</span>
              <span className="text-muted-foreground truncate">{p.summary}</span>
            </div>
            <div className="p-3">{p.detail ? <SingleStepDetail step={{ ...step, status: p.status, detail: p.detail }} /> : <span className="text-muted-foreground text-xs">no detail</span>}</div>
          </div>
        ))}
      </div>
    )
  }
  return <SingleStepDetail step={step} />
}

function SingleStepDetail({ step }: { step: StepState }) {
  const d = step.detail
  const { isAdmin } = useConnection()
  switch (step.id) {
    case "ingest":
      return (
        <dl className="grid grid-cols-[120px_1fr] gap-y-1 text-xs">
          <dt className="text-muted-foreground">request_id</dt>
          <dd><Mono>{d.request_id}</Mono></dd>
          <dt className="text-muted-foreground">source</dt>
          <dd>{d.source}</dd>
          {d.width && (
            <>
              <dt className="text-muted-foreground">resolution</dt>
              <dd className="tabular">{d.width} × {d.height}</dd>
            </>
          )}
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
        <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <Fact k="card detected" v={d.card_detected ? "yes" : "no — full frame used"} bad={d.card_detected === false} />
          <Fact k="detector" v={d.detector ?? "—"} />
          <Fact k="orientation" v={`${d.orientation ?? 0}°`} />
          <Fact k="output" v={`${d.size?.[0]}×${d.size?.[1]}`} />
        </div>
      )
    case "ocr":
      return (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">Engine <Mono>{d.engine}</Mono> · mean confidence {n2(d.mean_conf)}{d.rotation ? ` · read at ${d.rotation}°` : ""}</p>
          <div className="flex flex-wrap gap-1.5">
            {d.tokens?.map((t: any, i: number) => (
              <span key={i} className={cn("rounded border px-1.5 py-0.5 font-mono text-[11px]", t.conf < 0.6 ? "border-review/50 bg-review/10" : "bg-muted/50")} dir="auto">
                {t.text}
              </span>
            ))}
            {!d.tokens?.length && <span className="text-muted-foreground text-xs">No text was read — the family decision relies on the visual and geometry signals.</span>}
          </div>
        </div>
      )
    case "embed":
      return (
        <div className="space-y-3 text-xs">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <span>embedder <Mono>{d.embedder}</Mono></span>
            <span>dimensions <Mono>{d.dim}</Mono>{d.vector_truncated && <span className="text-muted-foreground"> (first {d.vector?.length} drawn)</span>}</span>
            <span className="inline-flex items-center gap-1.5">body colour <span className="size-4 rounded border" style={{ background: rgbHex(d.body_rgb) }} /> <Mono>{rgbHex(d.body_rgb)}</Mono></span>
            <span>keypoints <Mono>{d.keypoints}</Mono></span>
          </div>
          <VectorBars v={d.vector} />
        </div>
      )
    case "search":
      return (
        <div className="space-y-3">
          <p className="text-muted-foreground text-xs">
            Stage 1 shortlisted the nearest of <b className="text-foreground">{d.total}</b> reference images (cosine floor <Mono>{d.floor}</Mono>).
            {d.candidate_families?.length ? <> Families in play: {d.candidate_families.map((f: string) => <Mono key={f} className="text-foreground mr-1">{f}</Mono>)}</> : null}
            {d.matched === false && <span className="text-reject font-medium"> No reference is similar enough — not matching.</span>}
            {d.sides_mismatch && <span className="text-review font-medium"> The two photos match different programmes (SIDES_MISMATCH).</span>}
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-1.5">
              <div className="text-xs font-medium">Nearest references</div>
              {(d.top ?? []).slice(0, 6).map((t: any, i: number) => (
                <div key={t.ref_id + i} className="flex items-center gap-2">
                  {isAdmin ? <AuthImage path={api.referenceImagePath(t.family, t.ref_id)} alt="" className="h-8 w-[51px] rounded border object-cover" /> : <span className="bg-muted h-8 w-[51px] rounded border" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between text-xs">
                      <span className="truncate font-medium">{t.family} / {t.variant}</span>
                      <span className="tabular">{Number(t.sim).toFixed(3)}</span>
                    </div>
                    <ScoreBar value={t.sim} threshold={d.floor} tone={t.sim >= d.floor ? "bg-accept" : "bg-reject/70"} className="mt-1" />
                  </div>
                </div>
              ))}
            </div>
            {d.verified?.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-medium">Geometric verification (ORB + RANSAC)</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-7">Reference</TableHead>
                      <TableHead className="h-7 text-right">Matches</TableHead>
                      <TableHead className="h-7 text-right">Inliers</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.verified.slice(0, 6).map((v: any, i: number) => (
                      <TableRow key={v.ref_id + i}>
                        <TableCell className="py-1 text-xs">{v.family}/{v.variant}</TableCell>
                        <TableCell className="tabular py-1 text-right text-xs">{v.good_matches}</TableCell>
                        <TableCell className={cn("tabular py-1 text-right text-xs font-medium", v.inliers >= 25 ? "text-accept" : "text-muted-foreground")}>{v.inliers}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      )
    case "family":
      return (
        <div className="space-y-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Programme</TableHead>
                <TableHead className="text-right">Text</TableHead>
                <TableHead className="text-right">Visual</TableHead>
                <TableHead className="text-right">Geometry</TableHead>
                <TableHead className="text-right">Colour</TableHead>
                <TableHead className="w-44">Fused score (τ {d.tau})</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.candidates?.map((c: any, i: number) => (
                <TableRow key={c.family}>
                  <TableCell className="text-xs font-medium">{c.name} <span className="text-muted-foreground font-mono font-normal">{c.family}</span></TableCell>
                  <TableCell className="tabular text-right text-xs">{n2(c.text)}</TableCell>
                  <TableCell className="tabular text-right text-xs">{n2(c.visual)}</TableCell>
                  <TableCell className="tabular text-right text-xs">{n2(c.geometry)}</TableCell>
                  <TableCell className="tabular text-right text-xs">{n2(c.colour)}</TableCell>
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
            weights {d.candidates?.[0]?.weights ? Object.entries(d.candidates[0].weights).map(([k, v]) => `${k} ${v}`).join(" · ") : "—"} · margin <Mono className="text-foreground">{n2(d.margin)}</Mono> (needs ≥ δ {d.delta}) · outcome <b className="text-foreground">{d.outcome}</b>
            {d.text_missing && <span className="text-review"> · no issuer text read</span>}
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
                <TableHead className="text-right">Geometry</TableHead>
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
                    {c.name}
                  </TableCell>
                  {["colour", "keyword", "geometry", "embed", "prefix"].map((k) => (
                    <TableCell key={k} className="tabular text-right text-xs">{n2(c[k])}</TableCell>
                  ))}
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <ScoreBar value={c.score} threshold={d.tau} tone={i === 0 ? "bg-accept" : "bg-muted-foreground/50"} />
                      <span className="tabular w-9 text-right text-xs">{n2(c.score)}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-muted-foreground text-xs">Number read: <Mono className="text-foreground">{d.number_seen ?? "—"}</Mono> · margin <Mono className="text-foreground">{n2(d.margin)}</Mono> (δ {d.delta})</p>
        </div>
      )
    case "fields":
      return (
        <div className="space-y-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Field</TableHead>
                {d.fields?.some((f: any) => f.side) && <TableHead>Side</TableHead>}
                <TableHead>Value</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Conf.</TableHead>
                <TableHead className="text-right">Format</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.fields?.map((f: any) => (
                <TableRow key={f.name}>
                  <TableCell className="text-xs">{f.name}{f.required && <span className="text-reject">*</span>}</TableCell>
                  {d.fields?.some((x: any) => x.side) && <TableCell><SideBadge side={f.side} /></TableCell>}
                  <TableCell>{f.value ? <Mono>{f.value}{f.iso && <span className="text-muted-foreground"> → valid until {f.iso}</span>}</Mono> : (d.missing_sides ?? []).includes(f.side) ? <span className="text-muted-foreground text-xs">not photographed</span> : <span className="text-reject text-xs">not read</span>}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{f.source}</TableCell>
                  <TableCell className="tabular text-right text-xs">{f.confidence ? n2(f.confidence) : "—"}</TableCell>
                  <TableCell className="text-right">{f.ok ? <StepIcon status="pass" className="ml-auto size-3.5" /> : <StepIcon status="fail" className="ml-auto size-3.5" />}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-muted-foreground text-xs">Aligned to reference: {d.aligned_to_reference ? "yes" : "no"} · VLM fallback {d.vlm}</p>
          {d.missing_sides?.length > 0 && <p className="text-reject text-xs font-medium">Missing side: {d.missing_sides.join(", ")} — its fields were not read (SIDE_REQUIRED).</p>}
          {d.side_assignment?.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-medium">Side assignment (how strongly each photo matches each side's references)</div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="h-7">Photo</TableHead>
                    <TableHead className="h-7 text-right">Front affinity</TableHead>
                    <TableHead className="h-7 text-right">Back affinity</TableHead>
                    <TableHead className="h-7">Used as</TableHead>
                    <TableHead className="h-7">Fields read</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.side_assignment.map((a: any) => {
                    const used = d.photos?.find((p: any) => p.photo === a.photo)
                    return (
                      <TableRow key={a.photo}>
                        <TableCell className="py-1 text-xs">{a.photo + 1}</TableCell>
                        <TableCell className="tabular py-1 text-right text-xs">{n2(a.affinity?.front)}</TableCell>
                        <TableCell className="tabular py-1 text-right text-xs">{n2(a.affinity?.back)}</TableCell>
                        <TableCell className="py-1"><SideBadge side={used?.side} /></TableCell>
                        <TableCell className="py-1 text-xs">{used?.fields?.join(", ") || "—"}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )
    case "rules":
      return <RulesList results={d.results} />
    case "decision":
      return (
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <DecisionBadge status={d.status} />
            {d.confidence != null && <span className="text-muted-foreground">confidence {n2(d.confidence)}</span>}
          </div>
          {d.reasons?.length ? (
            <div className="flex flex-wrap gap-1">{d.reasons.map((r: string) => <Badge key={r} variant="secondary" className="font-mono text-[10px]">{r}</Badge>)}</div>
          ) : (
            <p className="text-muted-foreground">All thresholds met, required fields read, critical rules passed.</p>
          )}
        </div>
      )
  }
  return null
}

export function RulesList({ results }: { results: { rule: string; field: string; critical: boolean; result: string; detail?: string | null }[] }) {
  return (
    <div className="space-y-2">
      {results?.map((r, i) => (
        <div key={i} className="flex items-start gap-2 text-xs">
          <StepIcon status={r.result === "pass" ? "pass" : r.result === "skip" ? "skip" : r.critical ? "fail" : "warn"} className="mt-px size-3.5" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <Mono>{r.rule}</Mono>
              <span className="text-muted-foreground">{r.field}</span>
              {r.critical && <Badge variant="outline" className="h-4 px-1 text-[10px]">critical</Badge>}
              <span className={cn("ml-auto text-[11px]", r.result === "fail" ? "text-reject font-medium" : "text-muted-foreground")}>{r.result}</span>
            </div>
            {r.detail && <div className={cn("mt-0.5 font-mono text-[11px] break-all", r.result === "fail" ? "text-reject" : "text-muted-foreground")}>{r.detail}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

function Fact({ k, v, bad }: { k: string; v: React.ReactNode; bad?: boolean }) {
  return (
    <div className={cn("rounded-md border px-3 py-2", bad && "border-review/50 bg-review/8")}>
      <div className="text-muted-foreground text-[10px] uppercase">{k}</div>
      <div className="font-medium">{v}</div>
    </div>
  )
}

function VectorBars({ v }: { v: number[] }) {
  if (!v?.length) return null
  const max = Math.max(...v.map(Math.abs)) || 1
  const W = 600 / v.length
  return (
    <svg viewBox={`0 0 600 40`} className="h-10 w-full" preserveAspectRatio="none" aria-label="embedding vector">
      <line x1={0} x2={600} y1={20} y2={20} className="stroke-border" strokeWidth={0.4} />
      {v.map((x, i) => {
        const h = (Math.abs(x) / max) * 19
        return <rect key={i} x={i * W} y={x >= 0 ? 20 - h : 20} width={Math.max(0.3, W * 0.8)} height={Math.max(0.4, h)} className="fill-chart-4" />
      })}
    </svg>
  )
}
