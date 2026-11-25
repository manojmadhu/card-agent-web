import * as React from "react"
import { Link } from "react-router-dom"
import { CheckCheck, ClipboardCheck, ExternalLink, Loader2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Kbd } from "@/components/ui/kbd"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { AdminRequired, AuthImage, DecisionBadge, EmptyState, ErrorState, LoadingRows, PageHeader } from "@/components/common"
import { FieldsTable, ResultSummary } from "@/components/result-view"
import { RulesList } from "@/components/pipeline"
import { ReviewPanel } from "@/components/review-panel"
import { SideBadge } from "@/components/photos"
import { useCards, useReviewQueue, useRun } from "@/api/queries"
import { api } from "@/api/endpoints"
import { useConnection } from "@/auth/connection"
import { ms, reasonLabel, relTime } from "@/lib/format"
import { cn } from "@/lib/utils"

export default function ReviewPage() {
  const { isAdmin } = useConnection()
  const cards = useCards()
  const [family, setFamily] = React.useState("all")
  const queue = useReviewQueue({ family: family === "all" ? undefined : family }, isAdmin)
  const items = queue.data?.pages.flatMap((p) => p.items) ?? []
  const [sel, setSel] = React.useState<string | null>(null)
  const current = items.find((i) => i.run_id === sel) ?? items[0]
  const run = useRun(current?.run_id ?? "", isAdmin)

  // J / K to move through the queue (ignored while typing)
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable || e.metaKey || e.ctrlKey) return
      const idx = items.findIndex((i) => i.run_id === current?.run_id)
      if (e.key === "j" && idx < items.length - 1) setSel(items[idx + 1].run_id)
      if (e.key === "k" && idx > 0) setSel(items[idx - 1].run_id)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [items, current])

  if (!isAdmin) return <AdminRequired what="The review queue" />

  const next = () => {
    const idx = items.findIndex((i) => i.run_id === current?.run_id)
    setSel(items[idx + 1]?.run_id ?? items[idx - 1]?.run_id ?? null)
  }

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        title={<span className="flex items-center gap-2">Review queue {queue.data && <Badge variant="outline" className="border-review/50 bg-review/10">{queue.data.pages[0].pending} pending</Badge>}</span>}
        description={<>Cards the agent would not decide alone. Accept or reject each one; optionally correct the identification or field values and enroll the photo as a reference. <span className="whitespace-nowrap"><Kbd>J</Kbd> / <Kbd>K</Kbd> next / previous.</span></>}
        actions={
          <Select value={family} onValueChange={setFamily}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All programmes</SelectItem>
              {cards.data?.items.map((c) => <SelectItem key={c.family} value={c.family}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        }
      />
      {queue.isError && <ErrorState error={queue.error} onRetry={() => queue.refetch()} />}
      {queue.isLoading ? (
        <LoadingRows rows={6} />
      ) : items.length === 0 ? (
        <EmptyState icon={<CheckCheck />} title="Queue is empty">Nothing is waiting for a decision. New REVIEW outcomes appear here automatically.</EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="gap-0 py-0">
            <ScrollArea className="h-[calc(100vh-220px)]">
              <ul className="divide-y">
                {items.map((it) => (
                  <li key={it.run_id}>
                    <button onClick={() => setSel(it.run_id)} className={cn("hover:bg-accent/60 flex w-full gap-3 p-3 text-left", current?.run_id === it.run_id && "bg-accent")} aria-current={current?.run_id === it.run_id}>
                      <AuthImage path={it.has_image ? api.runImagePath(it.run_id) : null} alt="" className="h-12 w-[76px] shrink-0 rounded border object-cover" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{it.family ? `${it.family}${it.variant ? " / " + it.variant : ""}` : "Not identified"}</div>
                        <div className="text-muted-foreground truncate text-xs">{it.reasons[0] ? reasonLabel(it.reasons[0]) : "—"}</div>
                        <div className="text-muted-foreground text-[11px]">{relTime(it.created_at)}{(it.photos ?? 1) > 1 ? ` · ${it.photos} photos` : ""}</div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              {queue.hasNextPage && (
                <div className="p-3 text-center">
                  <Button size="sm" variant="outline" onClick={() => queue.fetchNextPage()} disabled={queue.isFetchingNextPage}>{queue.isFetchingNextPage && <Loader2 className="animate-spin" />} Load more</Button>
                </div>
              )}
            </ScrollArea>
          </Card>

          {run.isLoading || !run.data ? (
            run.isError ? <ErrorState error={run.error} /> : <LoadingRows rows={6} />
          ) : (
            <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_420px]">
              <div className="min-w-0 space-y-4">
                <Card className="gap-3">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><DecisionBadge status={run.data.status} /> {run.data.result.card?.family_name ?? "Unidentified card"}</CardTitle>
                    <CardDescription>{relTime(run.data.created_at)} · {ms(run.data.processing_ms)} · request <span className="font-mono">{run.data.request_id}</span></CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {run.data.has_image && (run.data.images?.length ?? 0) > 1 ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {run.data.images!.map((im) => (
                          <div key={im.photo} className="space-y-1">
                            <div className="flex items-center gap-1.5 text-xs">Photo {im.photo + 1} <SideBadge side={run.data!.result.photos?.find((p) => p.photo === im.photo)?.side ?? im.side} /></div>
                            <AuthImage path={api.runImagePath(run.data!.run_id, { photo: im.photo })} alt={`photo ${im.photo + 1}`} className="max-h-[260px] w-full rounded-lg border bg-black/5 object-contain" />
                          </div>
                        ))}
                      </div>
                    ) : run.data.has_image ? (
                      <AuthImage path={api.runImagePath(run.data.run_id)} alt="card photo" className="max-h-[360px] w-full rounded-lg border bg-black/5 object-contain" />
                    ) : null}
                    <ResultSummary r={run.data.result} runId={run.data.run_id} />
                    <Button asChild variant="ghost" size="sm"><Link to={`/runs/${run.data.run_id}`}><ExternalLink /> Full run details</Link></Button>
                  </CardContent>
                </Card>
                <Card className="gap-3">
                  <CardHeader><CardTitle className="text-sm">What the agent read</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <FieldsTable r={run.data.result} />
                    {run.data.result.validation?.length > 0 && <RulesList results={run.data.result.validation} />}
                  </CardContent>
                </Card>
              </div>
              <Card className="h-fit 2xl:sticky 2xl:top-20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><ClipboardCheck className="size-4" /> Decision</CardTitle>
                  <CardDescription>Your verdict is stored with the run and becomes ground truth for evaluation sets.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ReviewPanel run={run.data} onDone={next} compact />
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
