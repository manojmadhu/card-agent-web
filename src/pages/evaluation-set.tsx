import * as React from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, FlaskConical, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AdminRequired, ConfirmDialog, ErrorState, Kv, LoadingRows, PageHeader } from "@/components/common"
import { EvalProgress, GateBadge, StartEvaluationDialog } from "@/components/evaluation-ui"
import { useEvaluationSet, useEvaluations } from "@/api/queries"
import { api } from "@/api/endpoints"
import { useConnection } from "@/auth/connection"
import { dateTime, pct, relTime } from "@/lib/format"

export default function EvaluationSetPage() {
  const { id = "" } = useParams()
  const { isAdmin } = useConnection()
  const set = useEvaluationSet(id, isAdmin)
  const evals = useEvaluations(id, isAdmin)
  const nav = useNavigate()
  const qc = useQueryClient()
  const [del, setDel] = React.useState(false)
  if (!isAdmin) return <AdminRequired what="Evaluation sets" />
  if (set.isLoading) return <LoadingRows rows={6} />
  if (set.isError) return <ErrorState error={set.error} onRetry={() => set.refetch()} />
  const s = set.data!

  return (
    <div className="mx-auto max-w-[1200px] space-y-4">
      <Button variant="ghost" size="sm" className="-ml-2" asChild><Link to="/evaluations"><ArrowLeft /> Evaluations</Link></Button>
      <PageHeader
        title={s.name}
        description={`Evaluation set · ${s.origin === "reviewed_runs" ? "built from reviewed runs" : "uploaded zip"} · created ${dateTime(s.created_at)}`}
        actions={
          <>
            <StartEvaluationDialog setId={s.set_id} trigger={<Button size="sm"><FlaskConical /> Run this set</Button>} />
            <Button variant="outline" size="sm" className="text-reject" onClick={() => setDel(true)}><Trash2 /> Delete set</Button>
          </>
        }
      />
      <Card className="py-4">
        <CardContent className="grid gap-4 sm:grid-cols-5">
          <Kv k="Cases" v={s.cases} />
          <Kv k="Expected ACCEPT" v={s.expected.ACCEPT} />
          <Kv k="Expected REVIEW" v={s.expected.REVIEW} />
          <Kv k="Expected REJECT" v={s.expected.REJECT} />
          <Kv k="Set id" v={s.set_id} mono />
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-1">{s.families.map((f) => <Badge key={f} variant="outline" className="font-mono">{f}</Badge>)}</div>
      <Card>
        <CardHeader>
          <CardTitle>Evaluations of this set</CardTitle>
          <CardDescription>Compare runs over time — e.g. before and after adding references or changing thresholds.</CardDescription>
        </CardHeader>
        <CardContent>
          {!evals.data?.items.length ? (
            <p className="text-muted-foreground text-sm">Not evaluated yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">ACCEPT precision</TableHead>
                  <TableHead className="text-right">Agreement</TableHead>
                  <TableHead className="text-right">Automation</TableHead>
                  <TableHead className="text-right">Wrong ACCEPTs</TableHead>
                  <TableHead>Settings</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {evals.data.items.map((e) => (
                  <TableRow key={e.evaluation_id} className="cursor-pointer" onClick={() => nav(`/evaluations/${e.evaluation_id}`)}>
                    <TableCell className="text-xs">{relTime(e.created_at)}</TableCell>
                    <TableCell><div className="flex items-center gap-2"><GateBadge e={e} /><EvalProgress e={e} /></div></TableCell>
                    <TableCell className="tabular text-right">{pct(e.summary?.accept_precision)}</TableCell>
                    <TableCell className="tabular text-right">{pct(e.summary?.status_agreement)}</TableCell>
                    <TableCell className="tabular text-right">{pct(e.summary?.automation_rate)}</TableCell>
                    <TableCell className="tabular text-right">{e.summary?.wrong_accepts ?? "—"}</TableCell>
                    <TableCell className="max-w-56 truncate font-mono text-[11px]">{Object.keys(e.settings_overrides ?? {}).length ? JSON.stringify(e.settings_overrides) : "live"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <ConfirmDialog
        open={del}
        onOpenChange={setDel}
        destructive
        title={`Delete “${s.name}”?`}
        description="The set's photos and manifest are removed. Evaluation reports already produced stay available."
        confirmLabel="Delete set"
        onConfirm={async () => {
          await api.deleteEvaluationSet(s.set_id)
          qc.invalidateQueries({ queryKey: ["evaluation-sets"] })
          toast.success("Set deleted")
          nav("/evaluations")
        }}
      />
    </div>
  )
}
