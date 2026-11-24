import * as React from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowDown, ArrowLeft, ArrowUp, CheckCircle2, Trash2, XCircle } from "lucide-react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AdminRequired, ConfirmDialog, DecisionBadge, ErrorState, JsonBlock, LoadingRows, PageHeader, ScoreBar } from "@/components/common"
import { GateBadge } from "@/components/evaluation-ui"
import { useEvaluation, useEvaluationSet, useEvaluations } from "@/api/queries"
import { api } from "@/api/endpoints"
import { useConnection } from "@/auth/connection"
import { dateTime, ms, pct } from "@/lib/format"
import { cn } from "@/lib/utils"

export default function EvaluationDetailPage() {
  const { id = "" } = useParams()
  const { isAdmin } = useConnection()
  const ev = useEvaluation(id, isAdmin)
  const set = useEvaluationSet(ev.data?.set_id ?? "", isAdmin)
  const siblings = useEvaluations(ev.data?.set_id, isAdmin && !!ev.data)
  const [cmpId, setCmpId] = React.useState<string>("none")
  const cmp = useEvaluation(cmpId === "none" ? "" : cmpId, isAdmin)
  const [onlyMismatch, setOnlyMismatch] = React.useState(true)
  const [del, setDel] = React.useState(false)
  const nav = useNavigate()
  const qc = useQueryClient()

  if (!isAdmin) return <AdminRequired what="Evaluation reports" />
  if (ev.isLoading) return <LoadingRows rows={8} />
  if (ev.isError) return <ErrorState error={ev.error} onRetry={() => ev.refetch()} />
  const e = ev.data!
  const r = e.report
  const base = cmp.data?.summary ?? null
  const rows = (r?.rows ?? []).filter((x) => !onlyMismatch || x.expected !== x.got || x.id_correct === false)

  return (
    <div className="mx-auto max-w-[1440px] space-y-4">
      <Button variant="ghost" size="sm" className="-ml-2" asChild><Link to={set.data ? `/evaluations/sets/${set.data.set_id}` : "/evaluations"}><ArrowLeft /> {set.data?.name ?? "Evaluations"}</Link></Button>
      <PageHeader
        title={<span className="flex items-center gap-2">Evaluation report <GateBadge e={e} /></span>}
        description={`${set.data?.name ?? e.set_id} · started ${dateTime(e.created_at)}${e.today ? ` · evaluated as of ${e.today}` : ""}${e.registry_version ? ` · registry ${e.registry_version}` : ""}${e.embedder ? ` · ${e.embedder}` : ""}`}
        actions={
          <Button variant="outline" size="sm" className="text-reject" disabled={["queued", "running"].includes(e.status)} onClick={() => setDel(true)}><Trash2 /> Delete</Button>
        }
      />

      {Object.keys(e.settings_overrides ?? {}).length > 0 && (
        <Card className="border-chart-4/40 gap-2 py-4">
          <CardContent className="flex flex-wrap items-center gap-2 text-sm">
            <Badge className="bg-chart-4">what-if</Badge> evaluated with settings overrides <span className="font-mono text-xs">{JSON.stringify(e.settings_overrides)}</span>
            <Button size="sm" variant="ghost" asChild className="ml-auto"><Link to="/settings">Open decision settings</Link></Button>
          </CardContent>
        </Card>
      )}

      {["queued", "running"].includes(e.status) && (
        <Card className="py-6">
          <CardContent className="flex items-center gap-4">
            <Progress value={e.progress.total ? (e.progress.done / e.progress.total) * 100 : 3} className="max-w-md" />
            <span className="text-muted-foreground text-sm">{e.status === "queued" ? "Queued (one evaluation runs at a time)" : `Running — ${e.progress.done}/${e.progress.total ?? "?"} photos`}</span>
          </CardContent>
        </Card>
      )}
      {e.status === "failed" && <ErrorState error={new Error(e.error ?? "evaluation failed")} />}

      {r && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-sm">Compare with</span>
            <Select value={cmpId} onValueChange={setCmpId}>
              <SelectTrigger size="sm" className="w-[260px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— no comparison —</SelectItem>
                {siblings.data?.items.filter((x) => x.evaluation_id !== e.evaluation_id && x.status === "done").map((x) => (
                  <SelectItem key={x.evaluation_id} value={x.evaluation_id}>{dateTime(x.created_at)}{Object.keys(x.settings_overrides ?? {}).length ? " · what-if" : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Metric label="ACCEPT precision" v={r.accept_precision} base={base?.accept_precision} target={r.gate.min_accept_precision} hint="Share of ACCEPTs with the right card and fields" />
            <Metric label="Status agreement" v={r.status_agreement} base={base?.status_agreement} target={r.gate.min_status_agreement} hint="Decision equals the expected status" />
            <Metric label="Automation rate" v={r.automation_rate} base={base?.automation_rate} hint="Share decided ACCEPT without a person" />
            <Card className="gap-1 py-5">
              <CardHeader>
                <CardDescription>Wrong ACCEPTs</CardDescription>
                <CardTitle className={cn("tabular text-2xl", r.wrong_accepts ? "text-reject" : "text-accept")}>{r.wrong_accepts}</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-xs">{base ? `was ${base.wrong_accepts}` : "the costly error — target 0"}</CardContent>
            </Card>
            <Card className="gap-1 py-5">
              <CardHeader>
                <CardDescription>Latency p50 / p95</CardDescription>
                <CardTitle className="tabular text-2xl">{ms(r.latency_ms.p50)} / {ms(r.latency_ms.p95)}</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-xs">{r.cases} cases · max {ms(r.latency_ms.max)}</CardContent>
            </Card>
          </div>

          <Card className={cn("gap-2 py-4", r.gate.passed ? "border-accept/40" : "border-reject/40")}>
            <CardContent className="flex flex-wrap items-center gap-3 text-sm">
              {r.gate.passed ? <CheckCircle2 className="text-accept size-5" /> : <XCircle className="text-reject size-5" />}
              <b>{r.gate.passed ? "Gate passed" : "Gate failed"}</b>
              <span className="text-muted-foreground">needs ACCEPT precision ≥ {pct(r.gate.min_accept_precision)} and status agreement ≥ {pct(r.gate.min_status_agreement)} (evaluation.* in settings)</span>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="gap-3">
              <CardHeader>
                <CardTitle className="text-sm">Field accuracy</CardTitle>
                <CardDescription>Where the manifest gave expected values</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {!Object.keys(r.field_accuracy).length && <p className="text-muted-foreground text-sm">No expected field values in this set.</p>}
                {Object.entries(r.field_accuracy).map(([k, v]) => (
                  <div key={k} className="space-y-1">
                    <div className="flex justify-between text-sm"><span>{k}</span><span className="tabular">{pct(v)}</span></div>
                    <ScoreBar value={v} tone={v >= 0.98 ? "bg-accept" : v >= 0.9 ? "bg-review" : "bg-reject"} />
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="gap-3 xl:col-span-2">
              <CardHeader>
                <CardTitle className="text-sm">Programme confusion</CardTitle>
                <CardDescription>Expected programme (rows) × identified programme (columns). “None” = not a known card / not identified.</CardDescription>
              </CardHeader>
              <CardContent><Confusion m={r.family_confusion} /></CardContent>
            </Card>
          </div>

          {Object.keys(r.identification_errors ?? {}).length > 0 && (
            <Card className="border-review/50 gap-3">
              <CardHeader>
                <CardTitle className="text-sm">Variant identification errors</CardTitle>
                <CardDescription>Expected variant → what the agent identified</CardDescription>
              </CardHeader>
              <CardContent><JsonBlock value={r.identification_errors} className="max-h-48" /></CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Per-photo results</CardTitle>
              <CardDescription>{r.rows?.length ?? 0} photos</CardDescription>
              <CardAction className="flex items-center gap-2">
                <Switch id="mm" checked={onlyMismatch} onCheckedChange={setOnlyMismatch} />
                <Label htmlFor="mm" className="text-sm">Only disagreements</Label>
              </CardAction>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <p className="text-muted-foreground text-sm">{onlyMismatch ? "No disagreements — every photo got the expected outcome." : "No rows."}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Photo</TableHead>
                      <TableHead>Expected</TableHead>
                      <TableHead>Got</TableHead>
                      <TableHead>Expected card</TableHead>
                      <TableHead>Identified</TableHead>
                      <TableHead>Reasons</TableHead>
                      <TableHead className="text-right">Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((x) => (
                      <TableRow key={x.file} className={cn(x.expected !== x.got && "bg-reject/5")}>
                        <TableCell className="max-w-48 truncate font-mono text-xs">{x.file}</TableCell>
                        <TableCell><DecisionBadge status={x.expected} /></TableCell>
                        <TableCell><DecisionBadge status={x.got} /></TableCell>
                        <TableCell className="font-mono text-xs">{x.expected_family ? `${x.expected_family}/${x.expected_variant ?? "—"}` : "none"}</TableCell>
                        <TableCell className={cn("font-mono text-xs", x.id_correct === false && "text-reject")}>{x.family ? `${x.family}/${x.variant ?? "—"}` : "none"}</TableCell>
                        <TableCell className="max-w-64 truncate text-xs">{x.reasons.join(", ") || "—"}</TableCell>
                        <TableCell className="tabular text-right text-xs">{ms(x.ms)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <ConfirmDialog
        open={del}
        onOpenChange={setDel}
        destructive
        title="Delete this evaluation report?"
        description="The report is removed. The evaluation set itself is kept."
        confirmLabel="Delete"
        onConfirm={async () => {
          await api.deleteEvaluation(e.evaluation_id)
          qc.invalidateQueries({ queryKey: ["evaluations"] })
          toast.success("Evaluation deleted")
          nav("/evaluations")
        }}
      />
    </div>
  )
}

function Metric({ label, v, base, target, hint }: { label: string; v: number | null; base?: number | null; target?: number; hint: string }) {
  const delta = v != null && base != null ? v - base : null
  const ok = target == null || (v != null && v >= target)
  return (
    <Card className="gap-1 py-5">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className={cn("tabular flex items-center gap-2 text-2xl", !ok && "text-reject")}>
          {pct(v)}
          {delta != null && Math.abs(delta) > 0.0001 && (
            <span className={cn("flex items-center text-xs font-medium", delta > 0 ? "text-accept" : "text-reject")}>
              {delta > 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
              {(Math.abs(delta) * 100).toFixed(1)} pt
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-xs">{hint}{target != null && ` · gate ≥ ${pct(target, 0)}`}</CardContent>
    </Card>
  )
}

function Confusion({ m }: { m: Record<string, Record<string, number>> }) {
  const rowsK = Object.keys(m)
  const cols = [...new Set(rowsK.flatMap((k) => Object.keys(m[k])))].sort()
  const max = Math.max(1, ...rowsK.flatMap((k) => Object.values(m[k])))
  if (!rowsK.length) return <p className="text-muted-foreground text-sm">No data.</p>
  return (
    <div className="overflow-x-auto">
      <table className="text-xs">
        <thead>
          <tr>
            <th className="text-muted-foreground p-1 text-left font-normal">expected ↓ / got →</th>
            {cols.map((c) => <th key={c} className="p-1 font-mono font-medium">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rowsK.map((rk) => (
            <tr key={rk}>
              <td className="p-1 pr-3 font-mono font-medium">{rk}</td>
              {cols.map((c) => {
                const v = m[rk][c] ?? 0
                const diag = rk === c
                return (
                  <td key={c} className="p-0.5">
                    <div className={cn("tabular flex h-10 min-w-14 items-center justify-center rounded-md border font-semibold", !diag && v && "border-reject text-reject")} style={{ background: v ? `color-mix(in oklch, ${diag ? "var(--accept)" : "var(--reject)"} ${12 + (v / max) * 40}%, transparent)` : undefined }}>
                      {v || ""}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

