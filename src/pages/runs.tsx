import * as React from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { Eraser, History, Loader2, Scissors } from "lucide-react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { AdminRequired, ConfirmDialog, DecisionBadge, EmptyState, ErrorState, LoadingRows, PageHeader, ReviewBadge } from "@/components/common"
import { useCards, useRunsInfinite, useSettings } from "@/api/queries"
import { api } from "@/api/endpoints"
import { useConnection } from "@/auth/connection"
import { dateTime, ms, relTime } from "@/lib/format"

const ALL = "all"

export default function RunsPage() {
  const { isAdmin } = useConnection()
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const cards = useCards()
  const settings = useSettings()
  const [prune, setPrune] = React.useState(false)
  const [days, setDays] = React.useState("")
  const f = {
    status: params.get("status") ?? undefined,
    family: params.get("family") ?? undefined,
    review_status: params.get("review") ?? undefined,
    since: params.get("since") ?? undefined,
    until: params.get("until") ?? undefined,
    limit: 50,
  }
  const runs = useRunsInfinite(f, isAdmin)
  const set = (k: string, v?: string) => {
    const p = new URLSearchParams(params)
    if (v && v !== ALL) p.set(k, v)
    else p.delete(k)
    setParams(p, { replace: true })
  }
  if (!isAdmin) return <AdminRequired what="Run history" />
  const items = runs.data?.pages.flatMap((p) => p.items) ?? []
  const retention = settings.data?.fixed?.runs?.retention_days

  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeader
        title="Run history"
        description={<>Every stored validation, newest first. Runs hold personal data and are deleted after {retention ?? "the configured"} days.</>}
        actions={<Button variant="outline" size="sm" onClick={() => setPrune(true)}><Scissors /> Prune old runs</Button>}
      />
      <Card className="mb-4 py-4">
        <CardContent className="flex flex-wrap items-end gap-3">
          <FilterSelect label="Decision" value={f.status} onChange={(v) => set("status", v)} options={[["ACCEPT", "Accept"], ["REVIEW", "Review"], ["REJECT", "Reject"]]} />
          <FilterSelect label="Programme" value={f.family} onChange={(v) => set("family", v)} options={(cards.data?.items ?? []).map((c) => [c.family, c.name])} width="w-[190px]" />
          <FilterSelect label="Review" value={f.review_status} onChange={(v) => set("review", v)} options={[["pending", "Pending"], ["accepted", "Accepted"], ["rejected", "Rejected"], ["none", "Not needed"]]} />
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" value={f.since ?? ""} onChange={(e) => set("since", e.target.value)} className="h-9 w-[150px]" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" value={f.until ?? ""} onChange={(e) => set("until", e.target.value)} className="h-9 w-[150px]" />
          </div>
          {[...params.keys()].length > 0 && <Button variant="ghost" size="sm" onClick={() => setParams({}, { replace: true })}><Eraser /> Clear</Button>}
          <span className="text-muted-foreground ml-auto text-xs">{items.length} loaded{runs.hasNextPage ? " · more available" : ""}</span>
        </CardContent>
      </Card>

      {runs.isError && <ErrorState error={runs.error} onRetry={() => runs.refetch()} />}
      {runs.isLoading ? (
        <LoadingRows rows={8} />
      ) : items.length === 0 ? (
        <EmptyState icon={<History />} title="No runs match these filters" action={<Button asChild variant="outline"><Link to="/validate">Validate a card</Link></Button>} />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Decision</TableHead>
                <TableHead>Programme / variant</TableHead>
                <TableHead>Reasons</TableHead>
                <TableHead>Review</TableHead>
                <TableHead className="text-right">Time</TableHead>
                <TableHead>Request id</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((r) => (
                <TableRow key={r.run_id} className="cursor-pointer" onClick={() => nav(`/runs/${r.run_id}`)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && nav(`/runs/${r.run_id}`)}>
                  <TableCell className="text-xs whitespace-nowrap" title={dateTime(r.created_at)}>{relTime(r.created_at)}</TableCell>
                  <TableCell><DecisionBadge status={r.status} /></TableCell>
                  <TableCell className="text-sm">{r.family ? <><span className="font-medium">{r.family}</span>{r.variant && <span className="text-muted-foreground"> / {r.variant}</span>}</> : <span className="text-muted-foreground">not identified</span>}</TableCell>
                  <TableCell className="max-w-[280px]">
                    <div className="flex flex-wrap gap-1">
                      {r.reasons.slice(0, 2).map((x) => <Badge key={x} variant="secondary" className="max-w-full truncate font-mono text-[10px]" title={x}>{x}</Badge>)}
                      {r.reasons.length > 2 && <Badge variant="outline" className="text-[10px]">+{r.reasons.length - 2}</Badge>}
                    </div>
                  </TableCell>
                  <TableCell><ReviewBadge status={r.review_status} /></TableCell>
                  <TableCell className="tabular text-right text-xs">{ms(r.processing_ms)}{(r.photos ?? 1) > 1 && <div className="text-muted-foreground">{r.photos} photos</div>}</TableCell>
                  <TableCell className="text-muted-foreground max-w-[160px] truncate font-mono text-[11px]">{r.request_id ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {runs.hasNextPage && (
            <div className="border-t p-3 text-center">
              <Button variant="outline" size="sm" onClick={() => runs.fetchNextPage()} disabled={runs.isFetchingNextPage}>
                {runs.isFetchingNextPage && <Loader2 className="animate-spin" />} Load older runs
              </Button>
            </div>
          )}
        </Card>
      )}

      <ConfirmDialog
        open={prune}
        onOpenChange={setPrune}
        destructive
        title="Prune old runs now?"
        description={<>Runs and their photos older than the given number of days are deleted permanently. Leave empty to use the configured retention ({retention ?? "?"} days). This also happens automatically every hour.</>}
        confirmLabel="Prune"
        onConfirm={async () => {
          const out = await api.pruneRuns(days ? Number(days) : undefined)
          toast.success(`${out.deleted} run(s) deleted`, { description: `older than ${out.older_than_days} days` })
          qc.invalidateQueries({ queryKey: ["runs"] })
          qc.invalidateQueries({ queryKey: ["stats"] })
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="days" className="text-xs">Older than (days)</Label>
          <Input id="days" type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} placeholder={String(retention ?? "")} />
        </div>
      </ConfirmDialog>
    </div>
  )
}

function FilterSelect({ label, value, onChange, options, width = "w-[150px]" }: { label: string; value?: string; onChange: (v: string) => void; options: (string[] | [string, string])[]; width?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value ?? ALL} onValueChange={onChange}>
        <SelectTrigger className={width}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All</SelectItem>
          {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}
