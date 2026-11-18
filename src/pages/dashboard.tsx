import * as React from "react"
import { Link, useNavigate } from "react-router-dom"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { FlaskConical, ScanLine, ShieldAlert, Timer, TrendingUp, UserCheck } from "lucide-react"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { DecisionBadge } from "@/components/status"
import { AuthImage, runImagePath } from "@/components/auth-image"
import { EvalResults } from "@/components/eval-results"
import { useFamilies, useInfo, useRuns, useStats } from "@/api/hooks"
import { useEvaluation } from "@/hooks/use-eval"
import type { Decision } from "@/api/types"
import { cn } from "@/lib/utils"

const decisionConfig = {
  ACCEPT: { label: "Accept", color: "var(--accept)" },
  REVIEW: { label: "Review", color: "var(--review)" },
  REJECT: { label: "Reject", color: "var(--reject)" },
} satisfies ChartConfig

const DECS: Decision[] = ["ACCEPT", "REVIEW", "REJECT"]
const RANGES: Record<string, number | null> = { "24h": 24, "7d": 168, "30d": 720, all: null }

const EXIT_LABELS: Record<string, string> = {
  accepted: "Accepted",
  ingest: "Invalid image",
  quality: "Quality gate (retake)",
  normalise: "Normalise / OCR",
  ocr: "Normalise / OCR",
  family: "Family (unknown / ambiguous)",
  variant: "Variant ambiguous",
  fields: "Field extraction",
  rules: "Validation rules",
  decision: "Decision policy",
}

const pct = (n: number, d: number) => (d ? (n / d) * 100 : 0)

// bucket keys are already in the viewer's local time (the service shifts them by ?tz=), so format them as-is
function bucketLabel(t: string, bucket: "hour" | "day") {
  if (bucket === "hour") return new Date(`${t}:00:00Z`).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })
  return new Date(`${t}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })
}

export default function DashboardPage() {
  const [range, setRange] = React.useState("7d")
  const { data: s, isLoading, error } = useStats(RANGES[range])
  const recent = useRuns({ limit: 8 }, { refetchInterval: 15_000 })
  const { families } = useFamilies()
  const info = useInfo()
  const ev = useEvaluation()
  const [evalOpen, setEvalOpen] = React.useState(false)
  const nav = useNavigate()

  const famName = (id: string) => (id === "unknown" ? "Unknown / retake" : (families.find((f) => f.family === id)?.family_name ?? id))
  const series = React.useMemo(() => (s ? s.series.points.map((p) => ({ ...p, t: bucketLabel(p.t, s.series.bucket) })) : []), [s])
  const exits = React.useMemo(() => {
    const m: Record<string, number> = {}
    for (const [k, v] of Object.entries(s?.exit_stages ?? {})) m[EXIT_LABELS[k] ?? k] = (m[EXIT_LABELS[k] ?? k] ?? 0) + v
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [s])

  const runEval = () => {
    setEvalOpen(true)
    ev.run()
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Operations</h2>
          <p className="text-muted-foreground text-sm">Every validation processed by the card-agent service, refreshed every 30 s.</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <ToggleGroup type="single" value={range} onValueChange={(v) => v && setRange(v)} variant="outline" size="sm">
            <ToggleGroupItem value="24h">24 h</ToggleGroupItem>
            <ToggleGroupItem value="7d">7 days</ToggleGroupItem>
            <ToggleGroupItem value="30d">30 days</ToggleGroupItem>
            <ToggleGroupItem value="all">All</ToggleGroupItem>
          </ToggleGroup>
          <Button variant="outline" size="sm" disabled={ev.running || !info.data?.evaluation.cases} onClick={runEval} title="Run the service's labelled test set with the live thresholds (not stored as runs)">
            <FlaskConical /> Run evaluation suite
          </Button>
          <Button asChild size="sm">
            <Link to="/validate"><ScanLine /> Validate a card</Link>
          </Button>
        </div>
      </div>

      {error && !info.error && <p className="text-reject text-sm">{error.message}</p>}
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      )}

      {s && s.total === 0 && (
        <Card className="items-center py-14 text-center">
          <CardContent className="space-y-3">
            <ScanLine className="text-muted-foreground mx-auto size-8" />
            <div className="text-lg font-medium">No validations in this period</div>
            <p className="text-muted-foreground mx-auto max-w-md text-sm">Runs appear here as soon as the capture system calls POST /v1/cards/validate, or when you validate a card from this console.</p>
            <div className="flex justify-center gap-2">
              <Button asChild><Link to="/validate">Validate a card</Link></Button>
              {range !== "all" && <Button variant="outline" onClick={() => setRange("all")}>Show all time</Button>}
            </div>
          </CardContent>
        </Card>
      )}

      {s && s.total > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi title="Validations" value={s.total.toLocaleString()} foot={`${s.review.queue} waiting for review`} icon={<ScanLine className="size-4" />} />
            <Kpi title="Auto-accept rate" value={`${(s.auto_accept_rate * 100).toFixed(1)}%`} foot={`${s.by_status.REVIEW} to review · ${s.by_status.REJECT} rejected`} icon={<TrendingUp className="size-4" />}>
              <div className="flex h-1.5 w-full overflow-hidden rounded-full">
                {DECS.map((d) => <div key={d} className={d === "ACCEPT" ? "bg-accept" : d === "REVIEW" ? "bg-review" : "bg-reject"} style={{ width: `${pct(s.by_status[d], s.total)}%` }} />)}
              </div>
            </Kpi>
            <Kpi
              title="Agreement with reviewers"
              value={s.review.agreement == null ? "—" : `${(s.review.agreement * 100).toFixed(1)}%`}
              foot={
                s.review.audited_decisions ? (
                  <span className={cn(s.review.wrong_accepts ? "text-reject font-medium" : "")}>{s.review.wrong_accepts} wrong ACCEPTs (target 0) · {s.review.audited_decisions} audited</span>
                ) : (
                  "Review some ACCEPT/REJECT runs to measure accuracy"
                )
              }
              icon={<ShieldAlert className="size-4" />}
            />
            <Kpi title="Latency p50 / p95" value={`${s.latency_ms.p50} / ${s.latency_ms.p95} ms`} foot={`max ${s.latency_ms.max} ms · service processing time`} icon={<Timer className="size-4" />} />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>Decisions over time</CardTitle>
                <CardDescription>Per {s.series.bucket}</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={decisionConfig} className="aspect-auto h-[250px] w-full">
                  <AreaChart data={series} margin={{ left: 0, right: 8 }}>
                    <defs>
                      {DECS.map((d) => (
                        <linearGradient key={d} id={`fill-${d}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={`var(--color-${d})`} stopOpacity={0.7} />
                          <stop offset="95%" stopColor={`var(--color-${d})`} stopOpacity={0.08} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="t" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
                    <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
                    {DECS.map((d) => <Area key={d} dataKey={d} type="monotone" stackId="a" fill={`url(#fill-${d})`} stroke={`var(--color-${d})`} strokeWidth={1.5} />)}
                    <ChartLegend content={<ChartLegendContent />} />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Where decisions are made</CardTitle>
                <CardDescription>The first stage that failed or warned, per run</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {exits.map(([k, v]) => (
                  <div key={k} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{k}</span>
                      <span className="tabular text-muted-foreground">{v} · {pct(v, s.total).toFixed(0)}%</span>
                    </div>
                    <div className="bg-muted h-2 rounded-full">
                      <div className={cn("h-2 rounded-full transition-all", k === "Accepted" ? "bg-accept" : k.startsWith("Quality") ? "bg-chart-4" : k.startsWith("Validation") ? "bg-reject" : "bg-review")} style={{ width: `${pct(v, s.total)}%` }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Outcomes by card family</CardTitle>
                <CardDescription>Family identified by the agent</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={decisionConfig} className="aspect-auto w-full" style={{ height: Math.max(140, s.by_family.length * 44) }}>
                  <BarChart data={s.by_family.map((f) => ({ ...f, name: famName(f.family) }))} layout="vertical" margin={{ left: 8, right: 8 }}>
                    <CartesianGrid horizontal={false} />
                    <XAxis type="number" hide allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={110} />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                    {DECS.map((d, i) => <Bar key={d} dataKey={d} stackId="a" fill={`var(--color-${d})`} radius={i === 2 ? [0, 4, 4, 0] : 0} />)}
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top reason codes</CardTitle>
                <CardDescription>Why cards were not auto-accepted</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {s.top_reasons.length === 0 && <p className="text-muted-foreground text-sm">No reasons recorded.</p>}
                {s.top_reasons.map(({ reason, count }) => (
                  <div key={reason} className="flex items-center gap-3">
                    <span className="w-44 truncate font-mono text-xs" title={reason}>{reason}</span>
                    <div className="bg-muted h-2 flex-1 rounded-full">
                      <div className="bg-chart-2 h-2 rounded-full" style={{ width: `${pct(count, s.top_reasons[0].count)}%` }} />
                    </div>
                    <span className="tabular text-muted-foreground w-8 text-right text-xs">{count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><UserCheck className="size-4" /> Agent vs reviewer</CardTitle>
                <CardDescription>Agent decision × human reviewer decision ({s.review.audited_decisions + s.review.reviewed_review_cases} reviewed runs)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-[90px_repeat(2,1fr)] gap-1 text-xs">
                  <div />
                  {(["ACCEPT", "REJECT"] as const).map((d) => <div key={d} className="text-muted-foreground text-center text-[10px] font-medium">reviewer {d}</div>)}
                  {DECS.map((a) => (
                    <React.Fragment key={a}>
                      <div className="text-muted-foreground flex items-center text-[10px] font-medium">agent {a}</div>
                      {(["ACCEPT", "REJECT"] as const).map((g) => {
                        const v = s.review.confusion[a][g]
                        const max = Math.max(1, ...DECS.flatMap((x) => [s.review.confusion[x].ACCEPT, s.review.confusion[x].REJECT]))
                        const good = a === g
                        const danger = a === "ACCEPT" && g === "REJECT" && v > 0
                        const tone = a === "REVIEW" ? "var(--review)" : good ? "var(--accept)" : "var(--reject)"
                        return (
                          <div key={g} className={cn("tabular flex h-11 items-center justify-center rounded-md border text-sm font-semibold", danger && "border-reject text-reject")} style={{ background: v ? `color-mix(in oklch, ${tone} ${10 + (v / max) * 45}%, transparent)` : undefined }}>
                            {v}
                          </div>
                        )
                      })}
                    </React.Fragment>
                  ))}
                </div>
              </CardContent>
              <CardFooter className="text-muted-foreground text-xs">Agent ACCEPT × reviewer REJECT is the costly error; raise τ/δ in Settings to trade it for review volume.</CardFooter>
            </Card>
          </div>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent validations</CardTitle>
          <CardDescription>Click a row to open its trace and review it</CardDescription>
          <CardAction><Button variant="outline" size="sm" asChild><Link to="/runs">All runs</Link></Button></CardAction>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[70px]" />
                <TableHead>Card</TableHead>
                <TableHead>Identified as</TableHead>
                <TableHead>Decision</TableHead>
                <TableHead className="text-right">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.data?.items.length === 0 && <TableRow><TableCell colSpan={5} className="text-muted-foreground h-16 text-center">No runs yet.</TableCell></TableRow>}
              {recent.data?.items.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => nav(`/runs?run=${r.id}`)}>
                  <TableCell>{r.has_image ? <AuthImage path={runImagePath(r.id, r.has_card ? "card" : "original", 160)} className="h-9 w-[57px] rounded border object-cover" /> : <span className="bg-muted block h-9 w-[57px] rounded border" />}</TableCell>
                  <TableCell>
                    <div className="max-w-[260px] truncate text-sm font-medium">{r.label || r.request_id}</div>
                    <div className="text-muted-foreground font-mono text-[11px]">{r.id}</div>
                  </TableCell>
                  <TableCell className="text-xs">{r.family ? `${famName(r.family)}${r.variant ? ` / ${r.variant}` : ""}` : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>
                    <DecisionBadge status={r.status} />
                    {r.review && <span className="text-muted-foreground ml-1 text-[10px]">→ {r.review.decision}</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular text-right text-xs">{new Date(r.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={evalOpen} onOpenChange={setEvalOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Evaluation suite</DialogTitle>
            <DialogDescription>The service's labelled test set, run through the live pipeline with the current thresholds. Results are not stored as runs.</DialogDescription>
          </DialogHeader>
          <EvalResults rows={ev.rows} summary={ev.summary} progress={ev.progress} error={ev.error} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Kpi({ title, value, foot, icon, children }: { title: string; value: string; foot: React.ReactNode; icon: React.ReactNode; children?: React.ReactNode }) {
  return (
    <Card className="gap-3 py-5">
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">{icon}{title}</CardDescription>
        <CardTitle className="tabular text-2xl font-semibold">{value}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {children}
        <div className="text-muted-foreground text-xs">{foot}</div>
      </CardContent>
    </Card>
  )
}
