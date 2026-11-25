import * as React from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Loader2, RefreshCcw, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { AdminRequired, AuthImage, ConfirmDialog, CopyButton, DecisionBadge, ErrorState, JsonBlock, Kv, LoadingRows, PageHeader, ReviewBadge } from "@/components/common"
import { DecisionHeadline, ResultDetails, ResultSummary } from "@/components/result-view"
import { SideBadge } from "@/components/photos"
import { ExistingReview, ReviewPanel } from "@/components/review-panel"
import { useRun } from "@/api/queries"
import { api } from "@/api/endpoints"
import { fetchBlob } from "@/api/client"
import type { ValidationResult } from "@/api/types"
import { useConnection } from "@/auth/connection"
import { dateTime, ms, relTime } from "@/lib/format"

export default function RunDetailPage() {
  const { id = "" } = useParams()
  const { isAdmin } = useConnection()
  const run = useRun(id, isAdmin)
  const nav = useNavigate()
  const qc = useQueryClient()
  const [del, setDel] = React.useState(false)
  const [rerun, setRerun] = React.useState<ValidationResult | null>(null)
  const [rerunning, setRerunning] = React.useState(false)

  if (!isAdmin) return <AdminRequired what="Run details" />
  if (run.isLoading) return <LoadingRows rows={8} />
  if (run.isError) return <ErrorState error={run.error} onRetry={() => run.refetch()} />
  const r = run.data!

  const revalidate = async () => {
    setRerunning(true)
    try {
      const imgs = r.images ?? []
      if (imgs.length > 1) {
        // two-photo run: send each photo again as the side the agent used it as (sides detected if unknown)
        const blobs = await Promise.all(imgs.map((im) => fetchBlob(api.runImagePath(r.run_id, { photo: im.photo }))))
        const sides = imgs.map((im) => r.result.photos?.find((p) => p.photo === im.photo)?.side ?? null)
        const photos = sides.every(Boolean) && new Set(sides).size === sides.length ? Object.fromEntries(sides.map((sd, i) => [sd!, blobs[i]])) : { images: blobs }
        setRerun(await api.validatePhotos(photos, { store: false }))
      } else {
        const blob = await fetchBlob(api.runImagePath(r.run_id))
        setRerun(await api.validate(blob, `run-${r.run_id}.jpg`, { store: false }))
      }
    } catch (e) {
      toast.error("Re-validation failed", { description: (e as Error).message })
    } finally {
      setRerunning(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1440px]">
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => nav(-1)}><ArrowLeft /> Back</Button>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-2">Run <span className="font-mono text-base">{r.run_id.slice(0, 12)}…</span> <DecisionBadge status={r.status} /> <ReviewBadge status={r.review_status} /></span>}
        description={`${dateTime(r.created_at)} (${relTime(r.created_at)}) · source ${r.source} · ${ms(r.processing_ms)} · registry ${r.registry_version ?? "—"}`}
        actions={
          <>
            <CopyButton text={r.run_id} label="Copy id" />
            <Button variant="outline" size="sm" onClick={revalidate} disabled={!r.has_image || rerunning} title="Run the stored photo again with today's cards and settings (not recorded)">
              {rerunning ? <Loader2 className="animate-spin" /> : <RefreshCcw />} Re-validate now
            </Button>
            <Button variant="outline" size="sm" className="text-reject" onClick={() => setDel(true)}><Trash2 /> Delete</Button>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="gap-3">
            <CardHeader>
              <CardTitle className="text-sm">{(r.images?.length ?? 1) > 1 ? `Uploaded photos (${r.images!.length})` : "Uploaded photo"}</CardTitle>
              <CardDescription>Kept for review and enrolment; deleted after the retention period.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!r.has_image ? (
                <div className="text-muted-foreground rounded-lg border p-8 text-center text-sm">No photo stored (runs.store_images is off, or it was pruned).</div>
              ) : (r.images?.length ?? 0) > 1 ? (
                r.images!.map((im) => {
                  const info = r.result.photos?.find((p) => p.photo === im.photo)
                  return (
                    <div key={im.photo} className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs">
                        Photo {im.photo + 1} <SideBadge side={info?.side ?? im.side} />
                        <span className="text-muted-foreground">uploaded as “{im.upload}”{info?.side_corrected ? " · side corrected" : ""}{info && info.status !== "used" ? ` · ${info.status.replace("_", " ")}` : ""}</span>
                      </div>
                      <AuthImage path={api.runImagePath(r.run_id, { photo: im.photo })} alt={`photo ${im.photo + 1}`} className="w-full rounded-lg border object-contain" />
                    </div>
                  )
                })
              ) : (
                <AuthImage path={api.runImagePath(r.run_id)} alt="uploaded card photo" className="w-full rounded-lg border object-contain" />
              )}
            </CardContent>
          </Card>
          <Card className="gap-3">
            <CardHeader><CardTitle className="text-sm">Identifiers</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <Kv k="Run id" v={r.run_id} mono />
              <Kv k="Request id" v={r.request_id ?? "—"} mono />
              <Kv k="Registry" v={r.registry_version ?? "—"} mono />
              <Kv k="Schema" v={r.result?.schema_version ?? "—"} />
            </CardContent>
          </Card>
          {rerun && (
            <Card className="border-chart-4/40 gap-3">
              <CardHeader>
                <CardTitle className="text-sm">Re-validated just now</CardTitle>
                <CardDescription>Same photo, current cards and settings. Not recorded.</CardDescription>
                <CardAction><Button size="sm" variant="ghost" onClick={() => setRerun(null)}>Dismiss</Button></CardAction>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  then <DecisionBadge status={r.status} /> → now <DecisionBadge status={rerun.status} />
                  {rerun.status !== r.status && <Badge variant="secondary">changed</Badge>}
                </div>
                <div className="text-muted-foreground text-xs">{rerun.card ? `${rerun.card.family_name} · ${rerun.card.variant_name ?? "—"}` : "not identified"} · {rerun.reasons.join(", ") || "no reasons"}</div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <DecisionHeadline r={r.result} />
            </CardHeader>
            <CardContent><ResultSummary r={r.result} runLink={false} runId={r.run_id} /></CardContent>
          </Card>
          <Tabs defaultValue={r.review_status === "pending" ? "review" : "result"}>
            <TabsList>
              <TabsTrigger value="result">Result</TabsTrigger>
              <TabsTrigger value="review">Review {r.review_status === "pending" && <Badge className="bg-review text-foreground ml-1 h-4 px-1 text-[10px]">pending</Badge>}</TabsTrigger>
              <TabsTrigger value="json">JSON</TabsTrigger>
            </TabsList>
            <TabsContent value="result" className="mt-3"><ResultDetails r={r.result} runId={r.run_id} /></TabsContent>
            <TabsContent value="review" className="mt-3">
              <Card>
                <CardHeader>
                  <CardTitle>Human review</CardTitle>
                  <CardDescription>Any run can be reviewed — including a wrong ACCEPT found later. Verdicts feed evaluation sets built from runs.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ExistingReview run={r} />
                  <ReviewPanel run={r} />
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="json" className="mt-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Stored run</CardTitle>
                  <CardAction><CopyButton text={JSON.stringify(r, null, 2)} /></CardAction>
                </CardHeader>
                <CardContent><JsonBlock value={r} /></CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <ConfirmDialog
        open={del}
        onOpenChange={setDel}
        destructive
        title="Delete this run?"
        description="The run, its result and its stored photo are removed permanently. Statistics and evaluation sets built later will no longer include it."
        confirmLabel="Delete run"
        onConfirm={async () => {
          await api.deleteRun(r.run_id)
          qc.invalidateQueries({ queryKey: ["runs"] })
          qc.invalidateQueries({ queryKey: ["review"] })
          qc.invalidateQueries({ queryKey: ["stats"] })
          toast.success("Run deleted")
          nav("/runs")
        }}
      />
      <div className="text-muted-foreground mt-6 text-xs"><Link to="/runs" className="hover:underline">All runs</Link></div>
    </div>
  )
}
