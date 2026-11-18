import { cn } from "@/lib/utils"
import { useAuthImage } from "@/components/auth-image"

export interface RoiBox {
  name: string
  roi: number[]
  ok?: boolean
}

/** A card image (local object URL via `src`, or a service image via `path`) with field ROIs drawn on top. */
export function CardPreview({ src, path, rois, className, scanning, empty = "No card selected", fit = "cover", background }: { src?: string | null; path?: string | null; rois?: RoiBox[]; className?: string; scanning?: boolean; empty?: string; fit?: "cover" | "contain"; background?: string }) {
  const remote = useAuthImage(src ? null : path)
  const url = src ?? remote.url
  return (
    <div className={cn("bg-muted relative aspect-[1012/638] w-full overflow-hidden rounded-xl border", className)} style={background ? { background } : undefined}>
      {url ? (
        <img src={url} className={cn("absolute inset-0 size-full", fit === "cover" ? "object-cover" : "object-contain")} alt="card" />
      ) : (
        <div className="text-muted-foreground absolute inset-0 flex items-center justify-center px-6 text-center text-sm">{path && !remote.error ? "Loading…" : empty}</div>
      )}
      {scanning && <div className="pointer-events-none absolute inset-x-0 h-16 animate-[scan_1.6s_ease-in-out_infinite] bg-gradient-to-b from-transparent via-white/40 to-transparent" />}
      {rois?.map((r) => (
        <div
          key={r.name}
          className={cn("absolute rounded-sm border-2 transition-all", r.ok === false ? "border-reject bg-reject/10" : r.ok ? "border-accept bg-accept/10" : "border-chart-4 bg-chart-4/5 border-dashed")}
          style={{ left: `${r.roi[0] * 100}%`, top: `${r.roi[1] * 100}%`, width: `${(r.roi[2] - r.roi[0]) * 100}%`, height: `${(r.roi[3] - r.roi[1]) * 100}%` }}
        >
          <span className={cn("absolute -top-4 left-0 rounded-sm px-1 font-mono text-[9px] leading-4 text-white", r.ok === false ? "bg-reject" : r.ok ? "bg-accept" : "bg-chart-4")}>{r.name}</span>
        </div>
      ))}
      <style>{`@keyframes scan { 0% { top: -4rem } 100% { top: 100% } }`}</style>
    </div>
  )
}
