import * as React from "react"
import { ImagePlus, Trash2, Sparkles, Upload as UploadIcon } from "lucide-react"
import { toast } from "sonner"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useStore } from "@/store"
import { cosine } from "@/engine/embed"
import { prepareUpload, type RefEntry } from "@/engine/registry"
import { rgbHex } from "@/engine/vision"
import { cn } from "@/lib/utils"
import { ScoreBar } from "@/components/status"

export function RefGallery({ familyId, showSynthetic = true }: { familyId?: string; showSynthetic?: boolean }) {
  const { families, index, runs, addUploads, removeUpload, indexing } = useStore()
  const [open, setOpen] = React.useState<RefEntry | null>(null)
  const fams = families.filter((f) => !familyId || f.family === familyId)

  const usage = React.useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of runs) {
      const s = r.steps.find((x) => x.id === "search")?.detail?.top?.[0]?.ref_id
      if (s) m[s] = (m[s] ?? 0) + 1
    }
    return m
  }, [runs])

  const upload = async (family: string, variant: string, files: FileList | null) => {
    if (!files?.length) return
    const refs = []
    for (const f of Array.from(files)) {
      try {
        refs.push({ id: `${Date.now().toString(36)}_${f.name.replace(/[^\w.-]/g, "_")}`, family, variant, dataUrl: await prepareUpload(f), added_at: new Date().toISOString() })
      } catch {
        toast.error(`Could not read ${f.name}`)
      }
    }
    addUploads(refs)
    toast.success(`${refs.length} reference image(s) added to ${family}/${variant}`, { description: "Re-indexing the registry…" })
  }

  return (
    <div className="space-y-4">
      {fams.map((f) => (
        <div key={f.family} className="space-y-3">
          {!familyId && <h3 className="text-base font-semibold">{f.family_name} <span className="text-muted-foreground font-mono text-xs font-normal">{f.family}</span></h3>}
          <div className="grid gap-4 lg:grid-cols-2">
            {f.variants.map((v) => {
              const refs = index.filter((r) => r.family === f.family && r.variant === v.id && (showSynthetic || r.source === "upload"))
              const uploaded = refs.filter((r) => r.source === "upload").length
              return (
                <Card key={v.id} className="gap-3">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <span className="size-3 rounded-sm border" style={{ background: rgbHex(v.body_color_rgb as [number, number, number]) }} />
                      {v.name}
                    </CardTitle>
                    <CardDescription className="font-mono text-[11px]">registry/refs/{f.family}/{v.id}/ · {refs.length} images</CardDescription>
                    <CardAction>
                      <Button size="sm" variant="outline" asChild>
                        <label className="cursor-pointer">
                          <ImagePlus /> Add
                          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => upload(f.family, v.id, e.target.files)} />
                        </label>
                      </Button>
                    </CardAction>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {uploaded < 5 && (
                      <Alert className="py-2">
                        <Sparkles />
                        <AlertDescription className="text-xs">Only synthetic references. Enroll 5–20 clean, consented real photos of this variant for production accuracy.</AlertDescription>
                      </Alert>
                    )}
                    <div className="grid grid-cols-3 gap-2">
                      {refs.map((r) => (
                        <button key={r.id} onClick={() => setOpen(r)} className="group relative overflow-hidden rounded-md border text-left">
                          <img src={r.thumb} className="aspect-[1012/638] w-full object-cover transition-transform group-hover:scale-[1.03]" />
                          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-1.5 pt-3 pb-1">
                            <span className="text-[9px] font-medium text-white">{r.source === "upload" ? "uploaded" : "synthetic"}</span>
                            {usage[r.id] ? <span className="rounded bg-white/85 px-1 text-[9px] font-semibold text-black">{usage[r.id]}× top-1</span> : null}
                          </div>
                        </button>
                      ))}
                      <label className={cn("text-muted-foreground hover:bg-accent/60 flex aspect-[1012/638] cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed text-[10px]", indexing && "opacity-50")}>
                        <UploadIcon className="size-4" /> upload
                        <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => upload(f.family, v.id, e.target.files)} />
                      </label>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      ))}
      <RefDialog entry={open} onClose={() => setOpen(null)} usage={open ? usage[open.id] ?? 0 : 0} onRemove={(id) => { removeUpload(id); setOpen(null) }} />
    </div>
  )
}

function RefDialog({ entry, onClose, usage, onRemove }: { entry: RefEntry | null; onClose: () => void; usage: number; onRemove: (uploadId: string) => void }) {
  const { index } = useStore()
  const nearest = React.useMemo(() => {
    if (!entry) return []
    return index
      .filter((r) => r.id !== entry.id)
      .map((r) => ({ r, sim: cosine(entry.embedding, r.embedding) }))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 6)
  }, [entry, index])
  const confusable = nearest.find((n) => n.r.family !== entry?.family || n.r.variant !== entry?.variant)
  return (
    <Dialog open={!!entry} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        {entry && (
          <>
            <DialogHeader>
              <DialogTitle className="font-mono text-sm">{entry.id}</DialogTitle>
              <DialogDescription>
                {entry.source === "upload" ? "Uploaded reference" : "Synthetic reference rendered from the YAML template"} · used as top-1 match in {usage} run(s)
              </DialogDescription>
            </DialogHeader>
            <img src={entry.thumb} className="w-full rounded-lg border" />
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <Badge variant="outline">{entry.family} / {entry.variant}</Badge>
              <span className="flex items-center gap-1.5">body <span className="size-3.5 rounded border" style={{ background: rgbHex(entry.body) }} /> <span className="font-mono">{rgbHex(entry.body)}</span></span>
              <span className="text-muted-foreground">embedding {entry.embedding.length}-d</span>
              {entry.source === "upload" && (
                <Button size="sm" variant="outline" className="text-reject ml-auto h-7" onClick={() => onRemove(entry.id.split("/").slice(2).join("/"))}>
                  <Trash2 /> Remove
                </Button>
              )}
            </div>
            <div className="space-y-1.5">
              <div className="text-sm font-medium">Nearest references</div>
              {nearest.map(({ r, sim }) => (
                <div key={r.id} className="flex items-center gap-2 text-xs">
                  <img src={r.thumb} className="h-7 w-11 rounded border object-cover" />
                  <span className={cn("w-48 truncate font-mono", (r.family !== entry.family || r.variant !== entry.variant) && "text-review")}>{r.id}</span>
                  <ScoreBar value={sim} className="flex-1" tone={r.family === entry.family && r.variant === entry.variant ? "bg-accept" : "bg-review"} />
                  <span className="tabular w-12 text-right">{sim.toFixed(3)}</span>
                </div>
              ))}
              {confusable && <p className="text-muted-foreground text-[11px]">Closest other variant: <span className="font-mono">{confusable.r.family}/{confusable.r.variant}</span> at {confusable.sim.toFixed(3)} — the bigger the gap to same-variant matches, the safer the visual signal.</p>}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
