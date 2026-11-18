import * as React from "react"
import { Link } from "react-router-dom"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { FlaskConical, ScanLine, TrendingUp, ShieldAlert, Timer, Trash2 } from "lucide-react"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { DecisionBadge } from "@/components/status"
import { FlowStrip } from "@/components/pipeline-trace"
import { RunSheet } from "@/components/run-sheet"
import { useEvalSuite } from "@/lib/runner"
import { useStore, type RunRecord } from "@/store"
import type { Decision } from "@/engine/samples"
import { cn } from "@/lib/utils"

const decisionConfig = {
  ACCEPT: { label: "Accept", color: "var(--accept)" },
  REVIEW: { label: "Review", color: "var(--review)" },
  REJECT: { label: "Reject", color: "var(--reject)" },
} satisfies ChartConfig

const DECS: Decision[] = ["ACCEPT", "REVIEW", "REJECT"]

function pct(n: number, d: number) {
  return d ? (n / d) * 100 : 0
}
function quantile(xs: number[], q: number) {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]
}

export default function DashboardPage() {
  const { runs, families, clearRuns } = useStore()
  const { runAll, progress } = useEvalSuite()
  const [range, setRange] = React.useState("7d")
  const [open, setOpen] = React.useState<RunRecord | null>(null)

  const filtered = React.useMemo(() => {
    const now = Date.now()
    const lim = range === "24h" ? 86400000 : range === "7d" ? 7 * 86400000 : Infinity
    return runs.filter((r) => now - new Date(r.at).getTime() <= lim)
  }, [runs, range])

  const m = React.useMemo(() => {
    const n = filtered.length
    const by = (d: Decision) => filtered.filter((r) => r.result.status === d).length
    const labelled = filtered.filter((r) => r.expected)
    const correct = labelled.filter((r) => r.expected === r.result.status).length
    const wrongAccept = labelled.filter((r) => r.result.status === "ACCEPT" && r.expected !== "ACCEPT").length
    const lat = filtered.map((r) => r.result.processing_ms)
    // volume by day (or hour for 24h)
    const bucket = (iso: string) => {
      const d = new Date(iso)
      return range === "24h" ? `${String(d.getHours()).padStart(2, "0")}:00` : d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    }
    const keys: string[] = []
    if (range === "24h") for (let h = 23; h >= 0; h--) keys.push(bucket(new Date(Date.now() - h * 3600000).toISOString()))
    else for (let d = 6; d >= 0; d--) keys.push(bucket(new Date(Date.now() - d * 86400000).toISOString()))
    const vol = keys.map((k) => ({ t: k, ACCEPT: 0, REVIEW: 0, REJECT: 0 }))
    for (const r of filtered) {
      const row = vol.find((v) => v.t === bucket(r.at))
      if (row) row[r.result.status]++
    }
    // per family
    const famRows = [...families.map((f) => ({ id: f.family, name: f.family_name })), { id: "__unknown", name: "Unknown / retake" }].map((f) => {
      const rs = filtered.filter((r) => (r.result.card.family ?? "__unknown") === f.id)
      return { family: f.name, ACCEPT: rs.filter((r) => r.result.status === "ACCEPT").length, REVIEW: rs.filter((r) => r.result.status === "REVIEW").length, REJECT: rs.filter((r) => r.result.status === "REJECT").length }
    })
    // reasons
    const reasons: Record<string, number> = {}
    filtered.forEach((r) => r.result.reasons.forEach((x) => (reasons[x.split(":")[0]] = (reasons[x.split(":")[0]] ?? 0) + 1)))
    const topReasons = Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 7)
    // exit stage: where did the run's decision get made
    const exit: Record<string, number> = { "Quality gate": 0, "Reference search / family": 0, "Variant / fields": 0, "Rules": 0, "Accepted": 0 }
    for (const r of filtered) {
      const s = r.steps
      if (r.result.status === "ACCEPT") exit["Accepted"]++
      else if (s.find((x) => x.id === "quality")?.status === "fail") exit["Quality gate"]++
      else if (["fail", "warn"].includes(s.find((x) => x.id === "family")?.status ?? "")) exit["Reference search / family"]++
      else if (s.find((x) => x.id === "rules")?.status === "fail" || s.find((x) => x.id === "rules")?.status === "warn") exit["Rules"]++
      else exit["Variant / fields"]++
    }
    // confusion expected × got
    const conf = DECS.map((e) => DECS.map((g) => labelled.filter((r) => r.expected === e && r.result.status === g).length))
    return { n, acc: by("ACCEPT"), rev: by("REVIEW"), rej: by("REJECT"), labelled: labelled.length, correct, wrongAccept, p50: quantile(lat, 0.5), p95: quantile(lat, 0.95), vol, famRows, topReasons, exit, conf }
  }, [filtered, families, range])

  const empty = runs.length === 0

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Operations</h2>
          <p className="text-muted-foreground text-sm">Live view of every validation the agent has run in this console.</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <ToggleGroup type="single" value={range} onValueChange={(v) => v && setRange(v)} variant="outline" size="sm">
            <ToggleGroupItem value="24h">24 h</ToggleGroupItem>
            <ToggleGroupItem value="7d">7 days</ToggleGroupItem>
            <ToggleGroupItem value="all">All</ToggleGroupItem>
          </ToggleGroup>
          <Button variant="outline" size="sm" disabled={!!progress} onClick={() => runAll(1)}>
            <FlaskConical /> Run evaluation suite
          </Button>
          <Button variant="outline" size="sm" disabled={!!progress} onClick={() => runAll(8)} title="Runs every labelled sample 8× and spreads the results over the past week">
            Simulate a week
          </Button>
          <Button asChild size="sm">
            <Link to="/validate"><ScanLine /> Validate a card</Link>
          </Button>
        </div>
      </div>

      {progress && (
        <Card className="py-3">
          <CardContent className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground whitespace-nowrap">Running labelled samples {progress.done}/{progress.total}</span>
            <Progress value={pct(progress.done, progress.total)} />
          </CardContent>
        </Card>
      )}

      {empty && !progress ? (
        <Card className="items-center py-14 text-center">
          <CardContent className="space-y-3">
            <FlaskConical className="text-muted-foreground mx-auto size-8" />
            <div className="text-lg font-medium">No validations yet</div>
            <p className="text-muted-foreground mx-auto max-w-md text-sm">Run the evaluation suite to push every labelled sample through the pipeline, or validate a single card and watch each step live.</p>
            <div className="flex justify-center gap-2">
              <Button onClick={() => runAll(8)}><FlaskConical /> Simulate a week of traffic</Button>
              <Button variant="outline" asChild><Link to="/validate">Validate a card</Link></Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi title="Validations" value={m.n.toLocaleString()} foot={`${m.labelled} with ground-truth labels`} icon={<ScanLine className="size-4" />} />
            <Kpi title="Auto-accept rate" value={`${pct(m.acc, m.n).toFixed(1)}%`} foot={`${m.rev} to review · ${m.rej} rejected`} icon={<TrendingUp className="size-4" />}>
              <div className="flex h-1.5 w-full overflow-hidden rounded-full">
                <div className="bg-accept" style={{ width: `${pct(m.acc, m.n)}%` }} />
                <div className="bg-review" style={{ width: `${pct(m.rev, m.n)}%` }} />
                <div className="bg-reject" style={{ width: `${pct(m.rej, m.n)}%` }} />
              </div>
            </Kpi>
            <Kpi
              title="Decision accuracy"
              value={m.labelled ? `${pct(m.correct, m.labelled).toFixed(1)}%` : "—"}
              foot={<span className={cn(m.wrongAccept ? "text-reject font-medium" : "")}>{m.wrongAccept} wrong ACCEPTs (target 0)</span>}
              icon={<ShieldAlert className="size-4" />}
            />
            <Kpi title="Latency p50 / p95" value={`${m.p50} / ${m.p95} ms`} foot="browser engine compute time" icon={<Timer className="size-4" />} />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>Decisions over time</CardTitle>
                <CardDescription>{range === "24h" ? "Per hour, last 24 hours" : "Per day"}</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={decisionConfig} className="aspect-auto h-[250px] w-full">
                  <AreaChart data={m.vol} margin={{ left: 0, right: 8 }}>
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
                    {DECS.map((d) => (
                      <Area key={d} dataKey={d} type="monotone" stackId="a" fill={`url(#fill-${d})`} stroke={`var(--color-${d})`} strokeWidth={1.5} />
                    ))}
                    <ChartLegend content={<ChartLegendContent />} />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Where decisions are made</CardTitle>
                <CardDescription>The pipeline stage each run exited at</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(m.exit).map(([k, v]) => (
                  <div key={k} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{k}</span>
                      <span className="tabular text-muted-foreground">{v} · {pct(v, m.n).toFixed(0)}%</span>
                    </div>
                    <div className="bg-muted h-2 rounded-full">
                      <div className={cn("h-2 rounded-full transition-all", k === "Accepted" ? "bg-accept" : k === "Quality gate" ? "bg-chart-4" : k === "Rules" ? "bg-reject" : "bg-review")} style={{ width: `${pct(v, m.n)}%` }} />
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
                <CardDescription>Predicted family</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={decisionConfig} className="aspect-auto h-[220px] w-full">
                  <BarChart data={m.famRows} layout="vertical" margin={{ left: 8, right: 8 }}>
                    <CartesianGrid horizontal={false} />
                    <XAxis type="number" hide allowDecimals={false} />
                    <YAxis type="category" dataKey="family" tickLine={false} axisLine={false} width={110} />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                    {DECS.map((d, i) => (
                      <Bar key={d} dataKey={d} stackId="a" fill={`var(--color-${d})`} radius={i === 2 ? [0, 4, 4, 0] : 0} />
                    ))}
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
                {m.topReasons.length === 0 && <p className="text-muted-foreground text-sm">No reasons recorded.</p>}
                {m.topReasons.map(([k, v]) => (
                  <div key={k} className="flex items-center gap-3">
                    <span className="w-48 truncate font-mono text-xs" title={k}>{k}</span>
                    <div className="bg-muted h-2 flex-1 rounded-full">
                      <div className="bg-chart-2 h-2 rounded-full" style={{ width: `${pct(v, m.topReasons[0][1])}%` }} />
                    </div>
                    <span className="tabular text-muted-foreground w-8 text-right text-xs">{v}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Confusion matrix</CardTitle>
                <CardDescription>Expected label × agent decision ({m.labelled} labelled runs)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-[80px_repeat(3,1fr)] gap-1 text-xs">
                  <div />
                  {DECS.map((d) => <div key={d} className="text-muted-foreground text-center text-[10px] font-medium">got {d}</div>)}
                  {DECS.map((e, i) => (
                    <React.Fragment key={e}>
                      <div className="text-muted-foreground flex items-center text-[10px] font-medium">exp {e}</div>
                      {DECS.map((g, j) => {
                        const v = m.conf[i][j]
                        const max = Math.max(1, ...m.conf.flat())
                        const diag = i === j
                        const danger = g === "ACCEPT" && e !== "ACCEPT" && v > 0
                        return (
                          <div key={g} className={cn("flex h-12 items-center justify-center rounded-md border text-sm font-semibold tabular", danger && "border-reject text-reject")} style={{ background: v ? `color-mix(in oklch, ${diag ? "var(--accept)" : "var(--reject)"} ${10 + (v / max) * 45}%, transparent)` : undefined }}>
                            {v}
                          </div>
                        )
                      })}
                    </React.Fragment>
                  ))}
                </div>
              </CardContent>
              <CardFooter className="text-muted-foreground text-xs">Off-diagonal ACCEPT cells are the costly errors; thresholds τ/δ trade them against review volume.</CardFooter>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent validations</CardTitle>
              <CardDescription>Click a row to open its step-by-step trace</CardDescription>
              <CardAction className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={clearRuns}><Trash2 /> Clear</Button>
                <Button variant="outline" size="sm" asChild><Link to="/runs">All runs</Link></Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[70px]" />
                    <TableHead>Card</TableHead>
                    <TableHead>Pipeline</TableHead>
                    <TableHead>Decision</TableHead>
                    <TableHead className="text-right">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.slice(0, 8).map((r) => (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => setOpen(r)}>
                      <TableCell>{r.thumb && <img src={r.thumb} className="h-9 w-[57px] rounded border object-cover" />}</TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{r.label}</div>
                        <div className="text-muted-foreground font-mono text-[11px]">{r.id}</div>
                      </TableCell>
                      <TableCell className="max-w-[520px]"><div className="min-w-[380px]"><FlowStrip steps={r.steps} mini /></div></TableCell>
                      <TableCell>
                        <DecisionBadge status={r.result.status} />
                        {r.expected && r.expected !== r.result.status && <Badge variant="outline" className="text-reject ml-1 text-[10px]">exp {r.expected}</Badge>}
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular text-right text-xs">{new Date(r.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
      <RunSheet run={open} onOpenChange={(o) => !o && setOpen(null)} />
    </div>
  )
}

function Kpi({ title, value, foot, icon, children }: { title: string; value: string; foot: React.ReactNode; icon: React.ReactNode; children?: React.ReactNode }) {
  return (
    <Card className="@container/card gap-3 py-5">
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">{icon}{title}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular">{value}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {children}
        <div className="text-muted-foreground text-xs">{foot}</div>
      </CardContent>
    </Card>
  )
}
