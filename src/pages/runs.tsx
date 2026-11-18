import * as React from "react"
import { useSearchParams } from "react-router-dom"
import { Check, ChevronLeft, ChevronRight, ImagePlus, RefreshCw, Search, X } from "lucide-react"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DecisionBadge } from "@/components/status"
import { RunSheet } from "@/components/run-sheet"
import { EnrollDialog } from "@/components/enroll-dialog"
import { AuthImage, runImagePath } from "@/components/auth-image"
import { useFamilies, useReview, useRuns, type RunQuery } from "@/api/hooks"
import type { RunSummary } from "@/api/types"

const PAGE = 25

function useDebounced<T>(v: T, ms = 300) {
  const [d, setD] = React.useState(v)
  React.useEffect(() => {
    const t = setTimeout(() => setD(v), ms)
    return () => clearTimeout(t)
  }, [v, ms])
  return d
}

export default function RunsPage() {
  const [params, setParams] = useSearchParams()
  const { families } = useFamilies()
  const review = useReview()
  const tab = params.get("tab") ?? "all"
  const fam = params.get("family") ?? "all"
  const page = Math.max(0, Number(params.get("page") ?? 0))
  const openId = params.get("run")
  const [q, setQ] = React.useState(params.get("q") ?? "")
  const dq = useDebounced(q)
  const [enroll, setEnroll] = React.useState<RunSummary | null>(null)

  const set = React.useCallback((patch: Record<string, string | null>) => {
    setParams((p) => {
      const n = new URLSearchParams(p)
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "" || (k === "tab" && v === "all") || (k === "family" && v === "all") || (k === "page" && v === "0")) n.delete(k)
        else n.set(k, v)
      }
      return n
    }, { replace: true })
  }, [setParams])

  React.useEffect(() => {
    if ((params.get("q") ?? "") !== dq) set({ q: dq, page: null })
  }, [dq]) // eslint-disable-line react-hooks/exhaustive-deps

  const query: RunQuery = {
    queue: tab === "queue" || undefined,
    status: ["ACCEPT", "REVIEW", "REJECT"].includes(tab) ? tab : undefined,
    reviewed: tab === "reviewed" ? true : undefined,
    family: fam === "all" ? undefined : fam,
    q: dq || undefined,
    limit: PAGE,
    offset: page * PAGE,
  }
  const { data, isLoading, isFetching, error, refetch } = useRuns(query, { refetchInterval: 15_000 })
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE)) : 1

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Runs &amp; human review</CardTitle>
          <CardDescription>Every validation the service has processed — from the capture system and from this console. REVIEW cases wait in the queue; reviewer decisions become the ground truth for accuracy.</CardDescription>
          <CardAction>
            <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}><RefreshCw className={isFetching ? "animate-spin" : ""} /> Refresh</Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={tab} onValueChange={(v) => set({ tab: v, page: null })}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="queue">Review queue {data && <Badge variant="secondary" className="ml-1">{data.review_queue}</Badge>}</TabsTrigger>
                <TabsTrigger value="ACCEPT">Accepted</TabsTrigger>
                <TabsTrigger value="REVIEW">Review</TabsTrigger>
                <TabsTrigger value="REJECT">Rejected</TabsTrigger>
                <TabsTrigger value="reviewed">Reviewed</TabsTrigger>
              </TabsList>
            </Tabs>
            <Select value={fam} onValueChange={(v) => set({ family: v, page: null })}>
              <SelectTrigger className="w-[170px]" size="sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All families</SelectItem>
                {families.map((f) => <SelectItem key={f.family} value={f.family}>{f.family_name}</SelectItem>)}
                <SelectItem value="unknown">Unknown / retake</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative ml-auto w-full max-w-xs">
              <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search label, run / request id, reason…" className="h-9 pl-8" />
            </div>
          </div>

          {error && <p className="text-reject text-sm">{error.message}</p>}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[70px]" />
                  <TableHead>Card</TableHead>
                  <TableHead>Identified as</TableHead>
                  <TableHead>Decision</TableHead>
                  <TableHead>Reasons</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-9 w-full" /></TableCell></TableRow>
                  ))}
                {data?.items.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-muted-foreground h-24 text-center">{tab === "queue" ? "The review queue is empty." : "No runs match."}</TableCell></TableRow>
                )}
                {data?.items.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => set({ run: r.id })}>
                    <TableCell>{r.has_image ? <AuthImage path={runImagePath(r.id, r.has_card ? "card" : "original", 160)} className="h-9 w-[57px] rounded border object-cover" /> : <span className="bg-muted block h-9 w-[57px] rounded border" />}</TableCell>
                    <TableCell>
                      <div className="max-w-[240px] truncate text-sm font-medium">{r.label || r.request_id}</div>
                      <div className="text-muted-foreground text-[11px]">{new Date(r.created_at).toLocaleString()} · {r.processing_ms} ms · {r.source}</div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.family ? <span>{r.family}{r.variant ? ` / ${r.variant}` : " / ?"}</span> : <span className="text-muted-foreground">—</span>}
                      {r.family_confidence != null && <div className="text-muted-foreground tabular text-[11px]">conf {r.family_confidence.toFixed(2)}</div>}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <DecisionBadge status={r.status} />
                        {r.review && <span className="text-muted-foreground text-[10px]">reviewer → {r.review.decision}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[260px]">
                      <div className="flex flex-wrap gap-1">{r.reasons.slice(0, 3).map((x) => <Badge key={x} variant="secondary" className="font-mono text-[10px]">{x}</Badge>)}{r.reasons.length > 3 && <span className="text-muted-foreground text-[10px]">+{r.reasons.length - 3}</span>}</div>
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        {r.status === "REVIEW" && !r.review && (
                          <>
                            <Button size="sm" variant="outline" className="h-7" disabled={review.isPending} onClick={() => review.mutate({ id: r.id, decision: "ACCEPT" })}><Check /> Accept</Button>
                            <Button size="sm" variant="outline" className="h-7" disabled={review.isPending} onClick={() => review.mutate({ id: r.id, decision: "REJECT" })}><X /> Reject</Button>
                          </>
                        )}
                        <Button size="sm" variant="ghost" className="h-7" disabled={!r.has_card} onClick={() => setEnroll(r)} title="Enroll as reference"><ImagePlus /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {data && data.total > 0 && (
            <div className="text-muted-foreground flex items-center justify-between text-xs">
              <span>{data.offset + 1}–{Math.min(data.offset + data.items.length, data.total)} of {data.total}</span>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="outline" className="size-8" disabled={page === 0} onClick={() => set({ page: String(page - 1) })} aria-label="Previous page"><ChevronLeft /></Button>
                <span className="tabular px-2">page {page + 1} / {pages}</span>
                <Button size="icon" variant="outline" className="size-8" disabled={page + 1 >= pages} onClick={() => set({ page: String(page + 1) })} aria-label="Next page"><ChevronRight /></Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <RunSheet runId={openId} onOpenChange={(o) => !o && set({ run: null })} />
      <EnrollDialog run={enroll} onOpenChange={(o) => !o && setEnroll(null)} />
    </div>
  )
}
