import * as React from "react"
import { Link } from "react-router-dom"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ArrowRight, ClipboardCheck, FlaskConical, Gauge, ScanLine, ShieldAlert, Timer, TrendingUp } from "lucide-react"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { AdminRequired, EmptyState, ErrorState, PageHeader } from "@/components/common"
import { useCards, useEvaluations, useReady, useStats } from "@/api/queries"
import { useConnection } from "@/auth/connection"
import { daysAgo, ms, num, pct, reasonLabel } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Decision } from "@/api/types"

const DECS: Decision[] = ["ACCEPT", "REVIEW", "REJECT"]
const chartCfg = {
  ACCEPT: { label: "Accept", color: "var(--accept)" },
  REVIEW: { label: "Review", color: "var(--review)" },
  REJECT: { label: "Reject", color: "var(--reject)" },
} satisfies ChartConfig

const RANGES: Record<string, number> = { "24h": 1, "7d": 7, "30d": 30, "90d": 90 }

export default function OverviewPage() {
  const { isAdmin } = useConnection()
  const [range, setRange] = React.useState("7d")
  const [custom, setCustom] = React.useState<{ since: string; until: string }>({ since: daysAgo(7), until: "" })
  const [family, setFamily] = React.useState("all")
  const cards = useCards()
  const q = range === "custom" ? { since: custom.since || undefined, until: custom.until || undefined } : { since: new Date(Math.floor(Date.now() / 60000) * 60000 - RANGES[range] * 86400000).toISOString().slice(0, 16) + ":00Z" }
  const stats = useStats({ ...q, family: family === "all" ? undefined : family }, isAdmin)
  const ready = useReady()
  const evals = useEvaluations(undefined, isAdmin)
  const perDay = React.useMemo(() => fillDays(stats.data?.per_day ?? [], stats.data?.since ?? null, stats.data?.until ?? null), [stats.data])

  if (!isAdmin)
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Overview" description="Operating statistics from the run history." />
        <AdminRequired what="The overview (run statistics)" />
        <div className="mt-6 flex justify-center">
          <Button asChild variant="outline"><Link to="/validate"><ScanLine /> Validate a card instead</Link></Button>
        </div>
      </div>
    )

  const s = stats.data
  const lastEval = evals.data?.items.find((e) => e.status === "done")

  return (
    <div className="mx-auto max-w-[1440px] space-y-4">
      <PageHeader
        title="Overview"
        description="How the agent is deciding: automation, review load, accuracy signals and latency, from the stored runs."
        actions={
          <>
            <Select value={family} onValueChange={setFamily}>
              <SelectTrigger size="sm" className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All programmes</SelectItem>
                {cards.data?.items.map((f) => <SelectItem key={f.family} value={f.family}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <ToggleGroup type="single" variant="outline" size="sm" value={range} onValueChange={(v) => v && setRange(v)}>
              {Object.keys(RANGES).map((k) => <ToggleGroupItem key={k} value={k} className="px-3">{k}</ToggleGroupItem>)}
              <ToggleGroupItem value="custom" className="px-3">Custom</ToggleGroupItem>
            </ToggleGroup>
            {range === "custom" && (
              <div className="flex items-center gap-1">
                <Input type="date" value={custom.since} onChange={(e) => setCustom((c) => ({ ...c, since: e.target.value }))} className="h-8 w-[140px]" aria-label="since" />
                <span className="text-muted-foreground text-xs">to</span>
                <Input type="date" value={custom.until} onChange={(e) => setCustom((c) => ({ ...c, until: e.target.value }))} className="h-8 w-[140px]" aria-label="until" />
              </div>
            )}
          </>
        }
      />

      {stats.isError && <ErrorState error={stats.error} onRetry={() => stats.refetch()} />}
      {s && s.truncated && <div className="text-review text-xs">Statistics are based on the most recent runs only (runs.stats_max_runs reached) — narrow the date range for exact numbers.</div>}

      {s && s.runs === 0 ? (
        <EmptyState icon={<Gauge />} title="No runs in this period" action={<Button asChild><Link to="/validate"><ScanLine /> Validate a card</Link></Button>}>
          Every validation is stored as a run (unless the caller passed store=false). Try a longer range or validate a card.
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Kpi title="Validations" icon={<ScanLine />} value={num(s?.runs)} foot={s ? `${s.by_status.ACCEPT} accept · ${s.by_status.REVIEW} review · ${s.by_status.REJECT} reject` : ""} loading={!s}>
              {s && (
                <div className="flex h-1.5 overflow-hidden rounded-full">
                  {DECS.map((d) => <div key={d} style={{ width: `${(s.by_status[d] / Math.max(1, s.runs)) * 100}%`, background: `var(--${d.toLowerCase()})` }} />)}
                </div>
              )}
            </Kpi>
            <Kpi title="Auto-accept rate" icon={<TrendingUp />} value={pct(s?.auto_accept_rate)} foot="ACCEPT without a person" loading={!s} />
            <Kpi title="Review rate" icon={<ClipboardCheck />} value={pct(s?.review_rate)} foot={s ? <Link to="/review" className="hover:underline">{s.review_queue.pending} waiting in the queue →</Link> : ""} loading={!s} />
            <Kpi
              title="Reviewer agreement"
              icon={<ShieldAlert />}
              value={pct(s?.review_agreement)}
              foot={s ? `${s.review_queue.accepted} accepted · ${s.review_queue.rejected} rejected by reviewers` : ""}
              loading={!s}
            />
            <Kpi title="Latency p50 / p95" icon={<Timer />} value={s ? `${ms(s.latency_ms.p50)} / ${ms(s.latency_ms.p95)}` : "—"} foot={s ? `max ${ms(s.latency_ms.max)}` : ""} loading={!s} />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>Decisions per day</CardTitle>
                <CardDescription>Stacked by outcome (UTC days)</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartCfg} className="aspect-auto h-[260px] w-full">
                  <AreaChart data={perDay} margin={{ left: 0, right: 8 }}>
                    <defs>
                      {DECS.map((d) => (
                        <linearGradient key={d} id={`g-${d}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={`var(--color-${d})`} stopOpacity={0.7} />
                          <stop offset="95%" stopColor={`var(--color-${d})`} stopOpacity={0.08} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
                    {DECS.map((d) => <Area key={d} dataKey={d} type="monotone" stackId="a" fill={`url(#g-${d})`} stroke={`var(--color-${d})`} strokeWidth={1.5} />)}
                    <ChartLegend content={<ChartLegendContent />} />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Platform</CardTitle>
                <CardDescription>Live state of the agent</CardDescription>
                <CardAction><Button variant="ghost" size="sm" asChild><Link to="/system">Details <ArrowRight /></Link></Button></CardAction>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row k="Status" v={ready.data ? <Badge variant="outline" className="text-accept border-accept/40">ready</Badge> : <Badge variant="outline" className="text-reject">unavailable</Badge>} />
                <Row k="Registry version" v={<span className="font-mono text-xs">{ready.data?.registry ?? "—"}</span>} />
                <Row k="Programmes / references" v={ready.data ? `${ready.data.families} / ${ready.data.references}` : "—"} />
                <Row k="Matcher" v={<span className="font-mono text-xs">{ready.data?.embedder ?? "—"}</span>} />
                <Row k="OCR" v={<span className="font-mono text-xs">{ready.data?.ocr ?? "—"}</span>} />
                <Row k="VLM fallback" v={ready.data ? (ready.data.vlm ? "available" : "off") : "—"} />
                <Row k="Settings" v={ready.data?.settings_overrides ? <Link to="/settings" className="text-review hover:underline">overridden at runtime</Link> : "file defaults"} />
                <Row
                  k="Last evaluation"
                  v={lastEval ? <Link to={`/evaluations/${lastEval.evaluation_id}`} className="hover:underline">{lastEval.summary?.gate.passed ? <span className="text-accept">gate passed</span> : <span className="text-reject">gate failed</span>} · {pct(lastEval.summary?.accept_precision)}</Link> : <Link to="/evaluations" className="text-muted-foreground hover:underline">none yet</Link>}
                />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Outcomes by programme</CardTitle>
                <CardDescription>“unidentified” = no programme recognised</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartCfg} className="aspect-auto h-[240px] w-full">
                  <BarChart data={s?.by_family ?? []} layout="vertical" margin={{ left: 4, right: 8 }}>
                    <CartesianGrid horizontal={false} />
                    <XAxis type="number" hide allowDecimals={false} />
                    <YAxis type="category" dataKey="family" tickLine={false} axisLine={false} width={96} tick={{ fontSize: 11 }} />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                    {DECS.map((d, i) => <Bar key={d} dataKey={d} stackId="a" fill={`var(--color-${d})`} radius={i === 2 ? [0, 4, 4, 0] : 0} />)}
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Top reason codes</CardTitle>
                <CardDescription>Why cards were not accepted automatically</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {!s?.top_reasons.length && <p className="text-muted-foreground text-sm">No reasons recorded.</p>}
                {s?.top_reasons.slice(0, 8).map((r) => (
                  <div key={r.reason} className="space-y-1">
                    <div className="flex justify-between gap-2 text-xs">
                      <span className="truncate" title={r.reason}><span className="font-mono">{r.reason}</span> <span className="text-muted-foreground">· {reasonLabel(r.reason)}</span></span>
                      <span className="tabular text-muted-foreground">{r.count}</span>
                    </div>
                    <div className="bg-muted h-1.5 rounded-full"><div className="bg-chart-2 h-1.5 rounded-full" style={{ width: `${(r.count / s.top_reasons[0].count) * 100}%` }} /></div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Review queue</CardTitle>
                <CardDescription>REVIEW decisions waiting for a person, and reviewer verdicts</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <QueueStat label="Pending" value={s?.review_queue.pending} className="border-review/50 bg-review/8" />
                  <QueueStat label="Accepted" value={s?.review_queue.accepted} />
                  <QueueStat label="Rejected" value={s?.review_queue.rejected} />
                </div>
                <p className="text-muted-foreground text-xs">Reviewer agreement is the share of reviewed runs a person accepted. A low value means the agent sends genuine problems to review; a high one may mean thresholds are too strict.</p>
              </CardContent>
              <CardFooter>
                <Button asChild className="w-full"><Link to="/review"><ClipboardCheck /> Open the review queue</Link></Button>
              </CardFooter>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Shortcut to="/validate" icon={<ScanLine />} title="Validate a card" text="Live, step-by-step validation of a photo." />
            <Shortcut to="/cards/new" icon={<Gauge />} title="Onboard a programme" text="Definition, field layout, references." />
            <Shortcut to="/evaluations" icon={<FlaskConical />} title="Measure accuracy" text="Run an evaluation set, test thresholds what-if." />
          </div>
        </>
      )}
    </div>
  )
}

/** The API lists only days that had runs; fill the gaps with zeros so the trend is continuous. */
function fillDays(rows: { date: string; total: number; ACCEPT: number; REVIEW: number; REJECT: number }[], since: string | null, until: string | null) {
  const start = new Date((since ?? rows[0]?.date ?? new Date().toISOString()).slice(0, 10) + "T00:00:00Z")
  const end = new Date((until ?? new Date().toISOString()).slice(0, 10) + "T00:00:00Z")
  const byDate = new Map(rows.map((r) => [r.date, r]))
  const out = []
  for (let d = start; d <= end && out.length < 400; d = new Date(d.getTime() + 86400000)) {
    const k = d.toISOString().slice(0, 10)
    out.push(byDate.get(k) ?? { date: k, total: 0, ACCEPT: 0, REVIEW: 0, REJECT: 0 })
  }
  return out
}

function Kpi({ title, value, foot, icon, children, loading }: { title: string; value: React.ReactNode; foot: React.ReactNode; icon: React.ReactNode; children?: React.ReactNode; loading?: boolean }) {
  return (
    <Card className="gap-2 py-5">
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5 [&_svg]:size-4">{icon}{title}</CardDescription>
        <CardTitle className={cn("tabular text-2xl font-semibold", loading && "text-muted-foreground animate-pulse")}>{loading ? "…" : value}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {children}
        <div className="text-muted-foreground text-xs">{foot}</div>
      </CardContent>
    </Card>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b pb-2 last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="truncate text-right">{v}</span>
    </div>
  )
}

function QueueStat({ label, value, className }: { label: string; value?: number; className?: string }) {
  return (
    <div className={cn("rounded-lg border py-3", className)}>
      <div className="tabular text-xl font-semibold">{value ?? "—"}</div>
      <div className="text-muted-foreground text-[11px] uppercase">{label}</div>
    </div>
  )
}

function Shortcut({ to, icon, title, text }: { to: string; icon: React.ReactNode; title: string; text: string }) {
  return (
    <Link to={to} className="hover:bg-accent/50 flex items-center gap-3 rounded-xl border p-4 transition-colors">
      <div className="bg-muted flex size-9 items-center justify-center rounded-lg [&_svg]:size-4">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-muted-foreground text-xs">{text}</div>
      </div>
      <ArrowRight className="text-muted-foreground size-4" />
    </Link>
  )
}
