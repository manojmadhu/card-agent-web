// Reference images of a programme, per variant: list, view, upload (with card detection), delete.
import * as React from "react"
import { AlertTriangle, ImagePlus, Loader2, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AuthImage, ConfirmDialog, ErrorState, LoadingRows } from "@/components/common"
import { useInvalidateCards, useReferences } from "@/api/queries"
import { api } from "@/api/endpoints"
import { ApiError } from "@/api/client"
import type { CardFamily, ReferenceInfo, UploadRefResult } from "@/api/types"
import { dateTime, rgbHex } from "@/lib/format"
import { cn } from "@/lib/utils"

export function ReferenceManager({ family, def }: { family: string; def: CardFamily }) {
  const refs = useReferences(family)
  const [detect, setDetect] = React.useState(true)
  const [view, setView] = React.useState<(ReferenceInfo & { variant: string }) | null>(null)
  const [del, setDel] = React.useState<(ReferenceInfo & { variant: string }) | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [last, setLast] = React.useState<UploadRefResult | null>(null)
  const invalidate = useInvalidateCards()
  const qc = useQueryClient()

  const upload = async (variant: string, files: FileList | null) => {
    if (!files?.length) return
    const list = Array.from(files)
    if (list.length > 20) return toast.error("Upload at most 20 images at a time")
    setBusy(variant)
    try {
      const out = await api.uploadReferences(family, variant, list, detect)
      setLast(out)
      const rejected = out.results.filter((r) => r.status === "rejected")
      const exists = out.results.filter((r) => r.status === "exists")
      toast[rejected.length ? "warning" : "success"](`${out.created} reference image(s) added to ${variant}`, {
        description: [exists.length ? `${exists.length} already stored` : "", rejected.length ? `${rejected.length} rejected: ${rejected[0].error}` : ""].filter(Boolean).join(" · ") || `variant now has ${out.reference_images_in_variant}`,
      })
    } catch (e) {
      const err = e as ApiError
      toast.error("Upload failed", { description: err.message })
    } finally {
      setBusy(null)
      qc.invalidateQueries({ queryKey: ["cards", family, "references"] })
      invalidate(family)
    }
  }

  if (refs.isLoading) return <LoadingRows rows={4} />
  if (refs.isError) return <ErrorState error={refs.error} onRetry={() => refs.refetch()} />

  return (
    <div className="space-y-4">
      <Card className="py-4">
        <CardContent className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch id="detect" checked={detect} onCheckedChange={setDetect} />
            <Label htmlFor="detect" className="text-sm">Find and straighten the card in each photo</Label>
          </div>
          <span className="text-muted-foreground text-xs">Turn off for flat scans that are already cropped to the card (<span className="font-mono">detect_card=false</span>). Use 3–20 clean, consented images per variant.</span>
        </CardContent>
      </Card>
      {last && last.results.some((r) => r.status === "rejected") && (
        <Card className="border-review/50 gap-2 py-4">
          <CardContent className="space-y-1 text-sm">
            <div className="flex items-center gap-2 font-medium"><AlertTriangle className="text-review size-4" /> Some images were rejected</div>
            {last.results.filter((r) => r.status === "rejected").map((r) => <div key={r.filename} className="text-muted-foreground text-xs"><span className="font-mono">{r.filename}</span>: {r.error}</div>)}
          </CardContent>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {refs.data!.variants.map((v) => {
          const vd = def.variants.find((x) => x.id === v.id)
          return (
            <Card key={v.id} className="gap-3">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <span className="size-3 rounded-sm border" style={{ background: rgbHex(vd?.body_color_rgb) }} />
                  {v.name}
                  <Badge variant="outline" className={cn("tabular", !v.references.length && "border-review/60 bg-review/10")}>{v.references.length}</Badge>
                </CardTitle>
                <CardDescription className="font-mono text-[11px]">{family}/{v.id}</CardDescription>
                <CardAction>
                  <Button size="sm" variant="outline" asChild disabled={busy === v.id}>
                    <label className="cursor-pointer">
                      {busy === v.id ? <Loader2 className="animate-spin" /> : <ImagePlus />} Upload
                      <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => { upload(v.id, e.target.files); e.target.value = "" }} />
                    </label>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                {!v.references.length && <p className="text-review mb-2 text-xs">No reference images: this variant cannot be matched visually yet.</p>}
                <div className="grid grid-cols-3 gap-2">
                  {v.references.map((r) => (
                    <button key={r.ref_id} onClick={() => setView({ ...r, variant: v.id })} className="group relative overflow-hidden rounded-md border text-left" title={r.filename}>
                      <AuthImage path={api.referenceImagePath(family, r.ref_id)} alt={r.filename} className="aspect-[1012/638] w-full object-cover transition-transform group-hover:scale-[1.03]" />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-1.5 pt-3 pb-1">
                        <div className="truncate text-[10px] text-white">{r.filename}</div>
                      </div>
                      {r.source === "registry" && <Badge className="absolute top-1 left-1 h-4 px-1 text-[9px]">git</Badge>}
                    </button>
                  ))}
                  <label
                    className="text-muted-foreground hover:bg-accent/60 flex aspect-[1012/638] cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed text-[11px]"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); upload(v.id, e.dataTransfer.files) }}
                  >
                    <Upload className="size-4" /> drop or browse
                    <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => { upload(v.id, e.target.files); e.target.value = "" }} />
                  </label>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent className="sm:max-w-3xl">
          {view && (
            <>
              <DialogHeader>
                <DialogTitle className="font-mono text-sm">{view.filename}</DialogTitle>
                <DialogDescription>{family}/{view.variant} · added {dateTime(view.added_at)} · source {view.source}</DialogDescription>
              </DialogHeader>
              <AuthImage path={api.referenceImagePath(family, view.ref_id)} alt={view.filename} className="w-full rounded-lg border" />
              <div className="flex items-center justify-between gap-2">
                <div className="text-muted-foreground font-mono text-[11px] break-all">ref {view.ref_id} · sha256 {view.sha256.slice(0, 16)}…</div>
                <Button variant="outline" size="sm" className="text-reject" onClick={() => { setDel(view); setView(null) }}><Trash2 /> Delete</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        destructive
        title="Delete this reference image?"
        description={
          del?.source === "registry" ? (
            <>This image comes from <span className="font-mono">registry/refs</span> (Git). Deleting it here is forced and it returns on the next sync unless the file is removed from Git too.</>
          ) : (
            <>The vector and the stored image are removed. If it was the last reference of <b>{del?.variant}</b>, that variant can no longer be matched visually.</>
          )
        }
        confirmLabel={del?.source === "registry" ? "Force delete" : "Delete"}
        onConfirm={async () => {
          const out = await api.deleteReference(family, del!.ref_id, del!.source === "registry")
          toast.success("Reference deleted", { description: `${out.variant} now has ${out.reference_images_in_variant}` })
          qc.invalidateQueries({ queryKey: ["cards", family, "references"] })
          invalidate(family)
        }}
      />
    </div>
  )
}
