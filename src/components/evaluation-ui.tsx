// Shared evaluation widgets: gate badge, status, start dialog.
import * as React from "react"
import { useNavigate } from "react-router-dom"
import { FlaskConical, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import { useEvaluationSets } from "@/api/queries"
import { api } from "@/api/endpoints"
import type { Evaluation } from "@/api/types"

export function GateBadge({ e }: { e: Pick<Evaluation, "status" | "summary"> }) {
  if (e.status === "failed") return <Badge variant="outline" className="text-reject border-reject/40">failed to run</Badge>
  if (e.status !== "done" || !e.summary) return <Badge variant="outline">{e.status}</Badge>
  return e.summary.gate.passed ? <Badge variant="outline" className="text-accept border-accept/40 bg-accept/8">gate passed</Badge> : <Badge variant="outline" className="text-reject border-reject/40 bg-reject/8">gate failed</Badge>
}

export function EvalProgress({ e }: { e: Evaluation }) {
  if (!["queued", "running"].includes(e.status)) return null
  const { done, total } = e.progress ?? { done: 0, total: null }
  return (
    <div className="flex items-center gap-2">
      <Progress value={total ? (done / total) * 100 : 5} className="w-28" />
      <span className="text-muted-foreground tabular text-xs">{total ? `${done}/${total}` : e.status}</span>
    </div>
  )
}

export function StartEvaluationDialog({ setId: fixedSet, trigger }: { setId?: string; trigger?: React.ReactNode }) {
  const sets = useEvaluationSets()
  const nav = useNavigate()
  const qc = useQueryClient()
  const [open, setOpen] = React.useState(false)
  const [setId, setSetId] = React.useState(fixedSet ?? "")
  const [today, setToday] = React.useState("")
  const [whatIf, setWhatIf] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)

  const start = async () => {
    setErr(null)
    let settings: Record<string, Record<string, unknown>> | undefined
    if (whatIf.trim()) {
      try {
        settings = JSON.parse(whatIf)
      } catch {
        return setErr("What-if settings must be JSON, e.g. {\"scoring\": {\"family_min\": 0.6}}")
      }
    }
    setBusy(true)
    try {
      const ev = await api.startEvaluation({ set_id: setId, settings, today: today || undefined })
      qc.invalidateQueries({ queryKey: ["evaluations"] })
      toast.success("Evaluation started")
      setOpen(false)
      nav(`/evaluations/${ev.evaluation_id}`)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? <Button size="sm"><FlaskConical /> Run evaluation</Button>}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Run an evaluation</DialogTitle>
          <DialogDescription>Every photo in the set goes through the pipeline in the background (one evaluation at a time per server).</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!fixedSet && (
            <div className="space-y-1.5">
              <Label>Evaluation set</Label>
              <Select value={setId} onValueChange={setSetId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Choose a set" /></SelectTrigger>
                <SelectContent>{sets.data?.items.map((s) => <SelectItem key={s.set_id} value={s.set_id}>{s.name} · {s.cases} cases</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="today">Evaluate as of (optional)</Label>
            <Input id="today" type="date" value={today} onChange={(e) => setToday(e.target.value)} className="w-48" />
            <p className="text-muted-foreground text-xs">Fixes “today” for expiry rules so results stay reproducible.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="whatif">What-if settings (optional JSON)</Label>
            <Textarea id="whatif" value={whatIf} onChange={(e) => setWhatIf(e.target.value)} rows={3} className="font-mono text-xs" placeholder='{"scoring": {"family_min": 0.6}}' />
            <p className="text-muted-foreground text-xs">Same shape as PATCH /v1/settings, applied only to this evaluation. Easier: edit values on the Decision settings page and choose “What-if evaluate”.</p>
          </div>
          {err && <p className="text-reject text-sm">{err}</p>}
        </div>
        <DialogFooter>
          <Button onClick={start} disabled={!setId || busy}>{busy ? <Loader2 className="animate-spin" /> : <FlaskConical />} Start</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
