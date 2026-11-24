import * as React from "react"
import { useNavigate } from "react-router-dom"
import { FileArchive, FlaskConical, History, Loader2, Upload } from "lucide-react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AdminRequired, EmptyState, ErrorState, LoadingRows, PageHeader } from "@/components/common"
import { EvalProgress, GateBadge, StartEvaluationDialog } from "@/components/evaluation-ui"
import { useCards, useEvaluationSets, useEvaluations } from "@/api/queries"
import { api } from "@/api/endpoints"
import { useConnection } from "@/auth/connection"
import { pct, relTime } from "@/lib/format"

export default function EvaluationsPage() {
  const { isAdmin } = useConnection()
  const sets = useEvaluationSets(isAdmin)
  const evals = useEvaluations(undefined, isAdmin)
  const nav = useNavigate()
  if (!isAdmin) return <AdminRequired what="Evaluation" />
  const setName = (id: string) => sets.data?.items.find((s) => s.set_id === id)?.name ?? id

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <PageHeader
        title="Evaluations"
        description="Measure accuracy on labelled photos before trusting automatic ACCEPTs, before a threshold change, after adding programmes, and in CI. The gate passes when ACCEPT precision and status agreement meet the configured minimums."
        actions={<StartEvaluationDialog />}
      />

      <Card>
        <CardHeader>
          <CardTitle>Evaluation runs</CardTitle>
          <CardDescription>Newest first. Queued and running evaluations update live.</CardDescription>
        </CardHeader>
        <CardContent>
          {evals.isError && <ErrorState error={evals.error} onRetry={() => evals.refetch()} compact />}
          {evals.isLoading ? (
            <LoadingRows rows={3} />
          ) : !evals.data?.items.length ? (
            <EmptyState icon={<FlaskConical />} title="No evaluations yet">Create an evaluation set below, then run it.</EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Set</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Cases</TableHead>
                  <TableHead className="text-right">ACCEPT precision</TableHead>
                  <TableHead className="text-right">Status agreement</TableHead>
                  <TableHead className="text-right">Automation</TableHead>
                  <TableHead className="text-right">Wrong ACCEPTs</TableHead>
                  <TableHead>What-if</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {evals.data.items.map((e) => (
                  <TableRow key={e.evaluation_id} className="cursor-pointer" onClick={() => nav(`/evaluations/${e.evaluation_id}`)}>
                    <TableCell className="text-xs whitespace-nowrap">{relTime(e.created_at)}</TableCell>
                    <TableCell className="max-w-48 truncate text-sm">{setName(e.set_id)}</TableCell>
                    <TableCell><div className="flex items-center gap-2"><GateBadge e={e} /><EvalProgress e={e} /></div></TableCell>
                    <TableCell className="tabular text-right">{e.summary?.cases ?? "—"}</TableCell>
                    <TableCell className="tabular text-right">{pct(e.summary?.accept_precision)}</TableCell>
                    <TableCell className="tabular text-right">{pct(e.summary?.status_agreement)}</TableCell>
                    <TableCell className="tabular text-right">{pct(e.summary?.automation_rate)}</TableCell>
                    <TableCell className={`tabular text-right ${e.summary?.wrong_accepts ? "text-reject font-semibold" : ""}`}>{e.summary?.wrong_accepts ?? "—"}</TableCell>
                    <TableCell>{Object.keys(e.settings_overrides ?? {}).length ? <Badge variant="outline" className="border-chart-4/50">what-if</Badge> : <span className="text-muted-foreground text-xs">live</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Evaluation sets</CardTitle>
          <CardDescription>Labelled photos with the expected outcome: uploaded as a zip, or built from runs a reviewer accepted or rejected.</CardDescription>
          <CardAction className="flex gap-2">
            <FromRunsDialog />
            <UploadSetDialog />
          </CardAction>
        </CardHeader>
        <CardContent>
          {sets.isLoading ? (
            <LoadingRows rows={3} />
          ) : !sets.data?.items.length ? (
            <EmptyState icon={<FileArchive />} title="No evaluation sets">Upload a zip with manifest.json and photos, or build one from reviewed runs.</EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Origin</TableHead>
                  <TableHead className="text-right">Cases</TableHead>
                  <TableHead>Expected</TableHead>
                  <TableHead>Programmes</TableHead>
                  <TableHead className="text-right">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sets.data.items.map((s) => (
                  <TableRow key={s.set_id} className="cursor-pointer" onClick={() => nav(`/evaluations/sets/${s.set_id}`)}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell><Badge variant="secondary">{s.origin === "reviewed_runs" ? "reviewed runs" : "zip upload"}</Badge></TableCell>
                    <TableCell className="tabular text-right">{s.cases}</TableCell>
                    <TableCell className="text-xs">{s.expected.ACCEPT} accept · {s.expected.REVIEW} review · {s.expected.REJECT} reject</TableCell>
                    <TableCell className="max-w-64 truncate font-mono text-xs">{s.families.join(", ") || "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-right text-xs">{relTime(s.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="gap-3">
        <CardHeader>
          <CardTitle className="text-sm">Zip format</CardTitle>
          <CardDescription>A <span className="font-mono">manifest.json</span> plus the photos it lists (paths relative to the manifest), up to 500 MB.</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted/50 overflow-auto rounded-md p-3 font-mono text-[11px]">{`[
  {"file": "photos/001.jpg", "family": "ae.fazaa", "variant": "gold", "expected_status": "ACCEPT",
   "fields": {"card_number": "2210457783", "expiry_date": "11/27"}},
  {"file": "photos/002.jpg", "family": "ae.esaad", "variant": "platinum", "expected_status": "REJECT"},
  {"file": "photos/003.jpg", "family": null, "variant": null, "expected_status": "REJECT"}
]`}</pre>
          <p className="text-muted-foreground mt-2 text-xs">The same evaluation runs in CI with <span className="font-mono">python tools/evaluate.py --manifest set/manifest.json</span> (exit code 1 when the gate fails).</p>
        </CardContent>
      </Card>
    </div>
  )
}

function UploadSetDialog() {
  const [open, setOpen] = React.useState(false)
  const [file, setFile] = React.useState<File | null>(null)
  const [name, setName] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const qc = useQueryClient()
  const nav = useNavigate()
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Upload /> Upload zip</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload an evaluation set</DialogTitle>
          <DialogDescription>A zip with manifest.json and the photos it lists.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="setname">Name</Label>
            <Input id="setname" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fazaa field photos, Nov 2026" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="zip">Zip file</Label>
            <Input id="zip" type="file" accept=".zip,application/zip" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={!file || busy}
            onClick={async () => {
              setBusy(true)
              try {
                const s = await api.uploadEvaluationSet(file!, name || file!.name.replace(/\.zip$/, ""))
                qc.invalidateQueries({ queryKey: ["evaluation-sets"] })
                toast.success(`Set created: ${s.cases} cases`)
                setOpen(false)
                nav(`/evaluations/sets/${s.set_id}`)
              } catch (e) {
                toast.error("Set rejected", { description: (e as Error).message })
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Upload />} Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FromRunsDialog() {
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [since, setSince] = React.useState("")
  const [until, setUntil] = React.useState("")
  const [family, setFamily] = React.useState("all")
  const [busy, setBusy] = React.useState(false)
  const cards = useCards()
  const qc = useQueryClient()
  const nav = useNavigate()
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><History /> From reviewed runs</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Build a set from reviewed runs</DialogTitle>
          <DialogDescription>Accepted reviews become expected ACCEPT (with the reviewer's identification and corrected fields); rejected reviews expected REJECT. Runs without a stored photo are skipped.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Reviewed in November" />
          </div>
          <div className="space-y-1.5">
            <Label>From</Label>
            <Input type="date" value={since} onChange={(e) => setSince(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Programme</Label>
            <Select value={family} onValueChange={setFamily}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All programmes</SelectItem>
                {cards.data?.items.map((c) => <SelectItem key={c.family} value={c.family}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                const s = await api.evaluationSetFromRuns({ name: name || undefined, since: since || undefined, until: until || undefined, family: family === "all" ? undefined : family })
                qc.invalidateQueries({ queryKey: ["evaluation-sets"] })
                toast.success(`Set created: ${s.cases} cases`, { description: s.runs_skipped ? `${s.runs_skipped} run(s) skipped (no photo)` : undefined })
                setOpen(false)
                nav(`/evaluations/sets/${s.set_id}`)
              } catch (e) {
                toast.error("Could not build the set", { description: (e as Error).message })
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? <Loader2 className="animate-spin" /> : <History />} Build set
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

