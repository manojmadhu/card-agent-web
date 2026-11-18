import * as React from "react"
import { AlertTriangle, ImagePlus, Trash2, Upload as UploadIcon } from "lucide-react"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { useDeleteRef, useFamilies, useRefs, useUploadRefs } from "@/api/hooks"
import { request } from "@/api/client"
import type { RefImage } from "@/api/types"
import { AuthImage, forgetImages, refImagePath } from "@/components/auth-image"
import { ScoreBar } from "@/components/status"
import { rgbHex } from "@/lib/color"
import { cn } from "@/lib/utils"
import { useQuery } from "@tanstack/react-query"

const RECOMMENDED = 5

export function RefGallery({ familyId }: { familyId?: string }) {
  const { families } = useFamilies()
  const { data: refs, isLoading } = useRefs(familyId)
  const upload = useUploadRefs()
  const [open, setOpen] = React.useState<RefImage | null>(null)
  const fams = families.filter((f) => !familyId || f.family === familyId)

  const onFiles = (family: string, variant: string, files: FileList | null) => {
    if (!files?.length) return
    upload.mutate({ family, variant, files: Array.from(files) })
  }

  if (isLoading) return <Skeleton className="h-64 w-full" />

  return (
    <div className="space-y-4">
      {fams.map((f) => (
        <div key={f.family} className="space-y-3">
          {!familyId && <h3 className="text-base font-semibold">{f.family_name} <span className="text-muted-foreground font-mono text-xs font-normal">{f.family}</span></h3>}
          <div className="grid gap-4 lg:grid-cols-2">
            {f.variants.map((v) => {
              const list = (refs ?? []).filter((r) => r.family === f.family && r.variant === v.id)
              return (
                <Card key={v.id} className="gap-3">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <span className="size-3 rounded-sm border" style={{ background: rgbHex(v.body_color_rgb) }} />
                      {v.name}
                    </CardTitle>
                    <CardDescription className="font-mono text-[11px]">registry/refs/{f.family}/{v.id}/ · {list.length} images</CardDescription>
                    <CardAction>
                      <Button size="sm" variant="outline" asChild disabled={upload.isPending}>
                        <label className="cursor-pointer">
                          <ImagePlus /> Add
                          <input type="file" accept="image/png,image/jpeg" multiple className="hidden" onChange={(e) => { onFiles(f.family, v.id, e.target.files); e.target.value = "" }} />
                        </label>
                      </Button>
                    </CardAction>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {list.length < RECOMMENDED && (
                      <Alert className="py-2">
                        <AlertTriangle />
                        <AlertDescription className="text-xs">
                          {list.length === 0 ? "No reference images — the visual signal for this variant is 0." : `Only ${list.length} reference image(s).`} Enroll 5–20 clean, consented photos for reliable matching.
                        </AlertDescription>
                      </Alert>
                    )}
                    <div className="grid grid-cols-3 gap-2">
                      {list.map((r) => (
                        <button type="button" key={r.id} onClick={() => setOpen(r)} className="group relative overflow-hidden rounded-md border text-left">
                          <AuthImage path={refImagePath(r.id, 320)} className="aspect-[1012/638] w-full object-cover transition-transform group-hover:scale-[1.03]" />
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pt-3 pb-1">
                            <span className="block truncate text-[9px] font-medium text-white">{r.file}</span>
                          </div>
                        </button>
                      ))}
                      <label className={cn("text-muted-foreground hover:bg-accent/60 flex aspect-[1012/638] cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed text-[10px]", upload.isPending && "pointer-events-none opacity-50")}>
                        <UploadIcon className="size-4" /> {upload.isPending ? "uploading…" : "upload"}
                        <input type="file" accept="image/png,image/jpeg" multiple className="hidden" onChange={(e) => { onFiles(f.family, v.id, e.target.files); e.target.value = "" }} />
                      </label>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      ))}
      <p className="text-muted-foreground text-xs">Uploads are located and perspective-warped to an upright 1012×638 card on the service, so references look exactly like what the pipeline compares against.</p>
      <RefDialog entry={open} onClose={() => setOpen(null)} />
    </div>
  )
}

function RefDialog({ entry, onClose }: { entry: RefImage | null; onClose: () => void }) {
  const del = useDeleteRef()
  const nearest = useQuery({
    queryKey: ["ref-nearest", entry?.id],
    queryFn: () => request<{ id: string; family: string; variant: string; similarity: number }[]>(`${refImagePath(entry!.id)}/nearest`),
    enabled: !!entry,
  })
  const confusable = nearest.data?.find((n) => n.family !== entry?.family || n.variant !== entry?.variant)
  return (
    <Dialog open={!!entry} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        {entry && (
          <>
            <DialogHeader>
              <DialogTitle className="font-mono text-sm">{entry.id}</DialogTitle>
              <DialogDescription>
                Added {new Date(entry.added_at).toLocaleString()} · {Math.round(entry.size / 1024)} KB
              </DialogDescription>
            </DialogHeader>
            <AuthImage path={refImagePath(entry.id, 1012)} className="aspect-[1012/638] w-full rounded-lg border object-cover" />
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <Badge variant="outline">{entry.family} / {entry.variant}</Badge>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" className="text-reject ml-auto h-7"><Trash2 /> Remove</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove this reference?</AlertDialogTitle>
                    <AlertDialogDescription>It is moved to registry/.trash on the service and the index is rebuilt without it.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => del.mutate(entry, { onSuccess: () => { forgetImages(refImagePath(entry.id)); onClose() } })}>Remove</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            <div className="space-y-1.5">
              <div className="text-sm font-medium">Nearest references (service visual similarity)</div>
              {nearest.isLoading && <Skeleton className="h-24 w-full" />}
              {nearest.data?.map((r) => {
                const same = r.family === entry.family && r.variant === entry.variant
                return (
                  <div key={r.id} className="flex items-center gap-2 text-xs">
                    <AuthImage path={refImagePath(r.id, 120)} className="h-7 w-11 rounded border object-cover" />
                    <span className={cn("w-56 truncate font-mono", !same && "text-review")}>{r.id}</span>
                    <ScoreBar value={r.similarity} className="flex-1" tone={same ? "bg-accept" : "bg-review"} />
                    <span className="tabular w-12 text-right">{r.similarity.toFixed(3)}</span>
                  </div>
                )
              })}
              {confusable && (
                <p className="text-muted-foreground text-[11px]">
                  Closest other variant: <span className="font-mono">{confusable.family}/{confusable.variant}</span> at {confusable.similarity.toFixed(3)} — the bigger the gap to same-variant matches, the safer the visual signal.
                </p>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
