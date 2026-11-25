// Two-sided cards (schema 2.1): side badges, per-photo panel and the "add the other side" prompt.
import type { PhotoInfo, Side, ValidationResult } from "@/api/types"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AuthImage } from "@/components/common"
import { cn } from "@/lib/utils"
import { sideLabel } from "@/lib/format"
import { ArrowLeftRight } from "lucide-react"

export function SideBadge({ side, className, muted }: { side?: Side | null; className?: string; muted?: boolean }) {
  if (!side) return null
  return (
    <Badge variant="outline" className={cn("h-5 gap-1 px-1.5 text-[10px] font-medium uppercase", side === "back" ? "border-chart-4/50 text-chart-4" : "border-chart-1/50 text-chart-1", muted && "opacity-60", className)}>
      {sideLabel(side)}
    </Badge>
  )
}

const STATUS_TONE: Record<PhotoInfo["status"], string> = {
  used: "text-accept border-accept/40",
  not_used: "text-muted-foreground",
  retake: "text-reject border-reject/40",
  invalid: "text-reject border-reject/40",
}

/** True when the result came from a schema-2.1 server and more than one photo (or a side) matters. */
export const hasPhotoDetail = (r: ValidationResult) => (r.photos?.length ?? 0) > 1 || (r.missing_sides?.length ?? 0) > 0 || r.photos?.some((p) => p.side === "back" || p.side_corrected)

export function PhotosPanel({ r, runId }: { r: ValidationResult; runId?: string }) {
  const photos = r.photos ?? []
  if (!photos.length) return null
  return (
    <div className="space-y-3">
      {photos.some((p) => p.side_corrected) && (
        <div className="border-review/50 bg-review/8 flex items-center gap-2 rounded-md border px-3 py-2 text-xs">
          <ArrowLeftRight className="text-review size-4" /> A photo showed the other side than it was uploaded as — the agent swapped it.
        </div>
      )}
      <div className={cn("grid gap-3", photos.length > 1 && "sm:grid-cols-2")}>
        {photos.map((p) => (
          <div key={p.photo} className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="font-medium">Photo {p.photo + 1}</span>
              <SideBadge side={p.side} />
              <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", STATUS_TONE[p.status])}>{p.status.replace("_", " ")}</Badge>
              {p.side_corrected && <Badge variant="outline" className="border-review/50 h-5 px-1.5 text-[10px]">uploaded as {p.declared}</Badge>}
              <span className="text-muted-foreground ml-auto text-[11px]">field “{p.upload}”</span>
            </div>
            {runId && <AuthImage path={`/v1/runs/${encodeURIComponent(runId)}/image?photo=${p.photo}`} alt={`photo ${p.photo + 1}`} className="max-h-40 w-full rounded border bg-black/5 object-contain" />}
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Fields read</dt>
              <dd>{p.fields.length ? p.fields.join(", ") : "—"}</dd>
              <dt className="text-muted-foreground">Aligned to</dt>
              <dd className="truncate font-mono text-[11px]" title={p.reference_id ?? ""}>{p.reference_id ? `${p.reference_id.slice(0, 8)}… · ${p.inliers ?? 0} inliers` : "—"}</dd>
              {p.quality && (
                <>
                  <dt className="text-muted-foreground">Quality</dt>
                  <dd className={cn(!p.quality.passed && "text-reject")}>{p.quality.passed ? `ok · sharpness ${p.quality.blur}` : p.quality.issues.join(", ")}</dd>
                </>
              )}
            </dl>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Compact per-photo table for evidence views. */
export function PhotoTable({ photos }: { photos: PhotoInfo[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Photo</TableHead>
          <TableHead>Used as</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Fields</TableHead>
          <TableHead className="text-right">Inliers</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {photos.map((p) => (
          <TableRow key={p.photo}>
            <TableCell className="text-xs">{p.photo + 1} <span className="text-muted-foreground">({p.upload})</span></TableCell>
            <TableCell><SideBadge side={p.side} /></TableCell>
            <TableCell className="text-xs">{p.status}</TableCell>
            <TableCell className="text-xs">{p.fields.join(", ") || "—"}</TableCell>
            <TableCell className="tabular text-right text-xs">{p.inliers ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

