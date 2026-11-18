import * as React from "react"
import { Check, ImagePlus, RotateCcw, Trash2, X } from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { DecisionBadge } from "@/components/status"
import { FlowStrip, StepTimeline } from "@/components/pipeline-trace"
import { CardPreview } from "@/components/card-preview"
import { runImagePath } from "@/components/auth-image"
import { EnrollDialog } from "@/components/enroll-dialog"
import { useClearReview, useDeleteRun, useReview, useRun } from "@/api/hooks"
import type { StepState } from "@/api/types"

export function fieldRois(steps: StepState[] | undefined) {
  const f = steps?.find((s) => s.id === "fields")?.detail?.fields as { name: string; roi: number[]; valid_format: boolean }[] | undefined
  return f?.map((x) => ({ name: x.name, roi: x.roi, ok: x.valid_format }))
}

export function RunSheet({ runId, onOpenChange }: { runId: string | null; onOpenChange: (o: boolean) => void }) {
  const { data: run, isLoading, error } = useRun(runId)
  const review = useReview()
  const reopen = useClearReview()
  const del = useDeleteRun()
  const [selected, setSelected] = React.useState<string | null>(null)
  const [note, setNote] = React.useState("")
  const [enroll, setEnroll] = React.useState(false)

  React.useEffect(() => {
    setSelected(run?.trace.find((s) => (s.status === "fail" || s.status === "warn") && s.id !== "decision")?.id ?? "decision")
    setNote("")
  }, [run?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Sheet open={!!runId} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        {isLoading && (
          <div className="space-y-3 p-6">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="aspect-[1012/638] w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}
        {error && <p className="text-reject p-6 text-sm">{error.message}</p>}
        {run && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 pr-8">
                <span className="truncate">{run.label || run.request_id}</span> <DecisionBadge status={run.status} />
              </SheetTitle>
              <SheetDescription className="font-mono text-xs">
                {run.id} · {new Date(run.created_at).toLocaleString()} · {run.processing_ms} ms · registry {run.registry_version} · {run.source}
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-4 px-4 pb-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-muted-foreground text-[11px] uppercase">Uploaded image</div>
                  <CardPreview path={run.has_image ? runImagePath(run.id, "original", 800) : null} fit="contain" empty="Image not stored" />
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground text-[11px] uppercase">Normalised card · field ROIs</div>
                  <CardPreview path={run.has_card ? runImagePath(run.id, "card", 800) : null} rois={fieldRois(run.trace)} empty="Stopped before normalisation" />
                </div>
              </div>

              <div className="grid gap-2 rounded-lg border p-3 text-xs sm:grid-cols-3">
                <div><span className="text-muted-foreground">Family</span><div className="font-medium">{run.result.card?.family_name ?? "—"}</div></div>
                <div><span className="text-muted-foreground">Variant</span><div className="font-medium">{run.result.card?.variant_name ?? "—"}</div></div>
                <div><span className="text-muted-foreground">Request id</span><div className="truncate font-mono">{run.request_id}</div></div>
              </div>

              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  Human review
                  {run.review && <Badge variant="outline">reviewer → {run.review.decision}</Badge>}
                  {run.review && run.review.decision !== run.status && run.status !== "REVIEW" && <Badge variant="outline" className="text-reject">overrides agent</Badge>}
                </div>
                {run.review ? (
                  <div className="text-muted-foreground flex items-start gap-2 text-xs">
                    <div className="flex-1">
                      {run.review.reviewer ?? "reviewer"} · {new Date(run.review.at).toLocaleString()}
                      {run.review.note && <p className="text-foreground mt-1">“{run.review.note}”</p>}
                    </div>
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => reopen.mutate(run.id)}><RotateCcw /> Reopen</Button>
                  </div>
                ) : (
                  <>
                    <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Optional note for the audit trail" className="text-xs" />
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" disabled={review.isPending} onClick={() => review.mutate({ id: run.id, decision: "ACCEPT", note })}><Check /> Confirm valid (ACCEPT)</Button>
                      <Button size="sm" variant="outline" disabled={review.isPending} onClick={() => review.mutate({ id: run.id, decision: "REJECT", note })}><X /> Invalid (REJECT)</Button>
                    </div>
                    <p className="text-muted-foreground text-[11px]">Reviewer decisions are the ground truth for the dashboard's accuracy and confusion matrix.</p>
                  </>
                )}
                <div className="flex flex-wrap items-center gap-2 border-t pt-2">
                  <Button size="sm" variant="ghost" className="h-7" disabled={!run.has_card} onClick={() => setEnroll(true)}><ImagePlus /> Enroll as reference</Button>
                  {run.enrolled.length > 0 && <span className="text-muted-foreground text-[11px]">enrolled: {run.enrolled.join(", ")}</span>}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="ghost" className="text-reject ml-auto h-7"><Trash2 /> Delete run</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this run?</AlertDialogTitle>
                        <AlertDialogDescription>The result, trace, review and stored images are removed from the service permanently.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => del.mutate(run.id, { onSuccess: () => onOpenChange(false) })}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>

              <FlowStrip steps={run.trace} compact onSelect={setSelected} selected={selected} />
              <Tabs defaultValue="steps">
                <TabsList>
                  <TabsTrigger value="steps">Steps</TabsTrigger>
                  <TabsTrigger value="json">Result JSON</TabsTrigger>
                </TabsList>
                <TabsContent value="steps" className="mt-3">
                  <StepTimeline steps={run.trace} selected={selected} setSelected={setSelected} />
                </TabsContent>
                <TabsContent value="json" className="mt-3">
                  <pre className="bg-muted/50 overflow-auto rounded-md p-3 font-mono text-[11px]">{JSON.stringify(run.result, null, 2)}</pre>
                </TabsContent>
              </Tabs>
            </div>
            <EnrollDialog run={enroll ? run : null} onOpenChange={(o) => !o && setEnroll(false)} />
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
