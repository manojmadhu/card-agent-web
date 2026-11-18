import * as React from "react"
import { Check, Search, X, ImagePlus } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { DecisionBadge } from "@/components/status"
import { FlowStrip } from "@/components/pipeline-trace"
import { RunSheet } from "@/components/run-sheet"
import { useStore, type RunRecord } from "@/store"

export default function RunsPage() {
  const { runs, families, updateRun, addUploads } = useStore()
  const [tab, setTab] = React.useState("all")
  const [q, setQ] = React.useState("")
  const [fam, setFam] = React.useState("all")
  const [open, setOpen] = React.useState<RunRecord | null>(null)
  const [enroll, setEnroll] = React.useState<RunRecord | null>(null)
  const [target, setTarget] = React.useState<{ family: string; variant: string }>({ family: "", variant: "" })

  const list = runs.filter((r) => {
    if (tab === "review" && (r.result.status !== "REVIEW" || r.review)) return false
    if (tab !== "all" && tab !== "review" && r.result.status !== tab) return false
    if (fam !== "all" && (r.result.card.family ?? "unknown") !== fam) return false
    if (q && !`${r.label} ${r.id} ${r.result.reasons.join(" ")}`.toLowerCase().includes(q.toLowerCase())) return false
    return true
  })
  const queue = runs.filter((r) => r.result.status === "REVIEW" && !r.review).length

  const decide = (r: RunRecord, d: "ACCEPT" | "REJECT") => {
    updateRun(r.id, { review: { decision: d, at: new Date().toISOString() } })
    toast.success(`Marked ${d} by reviewer`, { description: r.label })
  }

  const openEnroll = (r: RunRecord) => {
    setEnroll(r)
    const f = r.result.card.family ?? families[0]?.family ?? ""
    setTarget({ family: f, variant: r.result.card.variant ?? families.find((x) => x.family === f)?.variants[0]?.id ?? "" })
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Runs &amp; human review</CardTitle>
          <CardDescription>Every validation with its trace. REVIEW cases wait here; reviewer corrections can be enrolled into the reference set (governance loop).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="all">All <Badge variant="secondary" className="ml-1">{runs.length}</Badge></TabsTrigger>
                <TabsTrigger value="review">Review queue <Badge variant="secondary" className="ml-1">{queue}</Badge></TabsTrigger>
                <TabsTrigger value="ACCEPT">Accepted</TabsTrigger>
                <TabsTrigger value="REJECT">Rejected</TabsTrigger>
              </TabsList>
            </Tabs>
            <Select value={fam} onValueChange={setFam}>
              <SelectTrigger className="w-[170px]" size="sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All families</SelectItem>
                {families.map((f) => <SelectItem key={f.family} value={f.family}>{f.family_name}</SelectItem>)}
                <SelectItem value="unknown">Unknown / retake</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative ml-auto w-full max-w-xs">
              <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search label, id, reason…" className="h-9 pl-8" />
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[70px]" />
                <TableHead>Card</TableHead>
                <TableHead>Pipeline</TableHead>
                <TableHead>Decision</TableHead>
                <TableHead>Reasons</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-muted-foreground h-24 text-center">No runs match.</TableCell></TableRow>
              )}
              {list.slice(0, 200).map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setOpen(r)}>
                  <TableCell>{r.thumb && <img src={r.thumb} className="h-9 w-[57px] rounded border object-cover" />}</TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{r.label}</div>
                    <div className="text-muted-foreground text-[11px]">{new Date(r.at).toLocaleString()} · {r.result.processing_ms} ms</div>
                  </TableCell>
                  <TableCell className="max-w-[460px]"><div className="min-w-[380px]"><FlowStrip steps={r.steps} mini /></div></TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <DecisionBadge status={r.result.status} />
                      {r.review && <span className="text-muted-foreground text-[10px]">reviewer → {r.review.decision}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[200px]">
                    <div className="flex flex-wrap gap-1">{r.result.reasons.slice(0, 3).map((x) => <Badge key={x} variant="secondary" className="font-mono text-[10px]">{x}</Badge>)}</div>
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    {r.result.status === "REVIEW" && !r.review ? (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" className="h-7" onClick={() => decide(r, "ACCEPT")}><Check /> Accept</Button>
                        <Button size="sm" variant="outline" className="h-7" onClick={() => decide(r, "REJECT")}><X /> Reject</Button>
                        <Button size="sm" variant="ghost" className="h-7" onClick={() => openEnroll(r)} title="Enroll as reference"><ImagePlus /></Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="ghost" className="h-7" onClick={() => openEnroll(r)}><ImagePlus /> Enroll</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <RunSheet run={open} onOpenChange={(o) => !o && setOpen(null)} />
      <Dialog open={!!enroll} onOpenChange={(o) => !o && setEnroll(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enroll as reference card</DialogTitle>
            <DialogDescription>The confirmed image is added to the reference set of the chosen variant; the index is rebuilt on save.</DialogDescription>
          </DialogHeader>
          {enroll?.thumb && <img src={enroll.thumb} className="mx-auto h-32 rounded-md border" />}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Family</Label>
              <Select value={target.family} onValueChange={(v) => setTarget({ family: v, variant: families.find((f) => f.family === v)?.variants[0]?.id ?? "" })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{families.map((f) => <SelectItem key={f.family} value={f.family}>{f.family_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Variant</Label>
              <Select value={target.variant} onValueChange={(v) => setTarget((t) => ({ ...t, variant: v }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{families.find((f) => f.family === target.family)?.variants.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnroll(null)}>Cancel</Button>
            <Button
              disabled={!target.family || !target.variant || !enroll?.thumb}
              onClick={() => {
                addUploads([{ id: `review_${enroll!.id}.jpg`, family: target.family, variant: target.variant, dataUrl: enroll!.thumb!, added_at: new Date().toISOString() }])
                toast.success("Reference enrolled", { description: `${target.family}/${target.variant} — re-indexing` })
                setEnroll(null)
              }}
            >
              Enroll
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
