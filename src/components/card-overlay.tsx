import * as React from "react"
import { cn } from "@/lib/utils"

export interface RoiBox {
  name: string
  roi: number[]
  ok?: boolean
}

/**
 * A card photo (or the straightened card) with optional field regions.
 * While `scanning`, a processing effect plays over it: a sweeping scan beam, viewfinder corners,
 * a faint grid and a live label for the current pipeline stage (`stage`). Keyframes live in
 * index.css (`.card-scan-*`); users who ask for reduced motion get a static highlight instead.
 */
export function CardOverlay({ src, rois, className, scanning, stage, children }: { src?: string | null; rois?: RoiBox[]; className?: string; scanning?: boolean; stage?: string; children?: React.ReactNode }) {
  return (
    <div className={cn("bg-muted relative aspect-[1012/638] w-full overflow-hidden rounded-xl border transition-shadow", scanning && "card-scan-frame", className)} aria-busy={scanning || undefined}>
      {src ? <img src={src} className={cn("absolute inset-0 size-full object-cover transition-[filter] duration-500", scanning && "saturate-[.85]")} alt="card" /> : children ?? <div className="text-muted-foreground absolute inset-0 flex items-center justify-center text-sm">No card yet</div>}
      {rois?.map((r) => (
        <div
          key={r.name}
          className={cn("absolute rounded-sm border-2", r.ok === false ? "border-reject bg-reject/10" : r.ok ? "border-accept bg-accept/10" : "border-chart-4 bg-chart-4/5 border-dashed")}
          style={{ left: `${r.roi[0] * 100}%`, top: `${r.roi[1] * 100}%`, width: `${(r.roi[2] - r.roi[0]) * 100}%`, height: `${(r.roi[3] - r.roi[1]) * 100}%` }}
        >
          <span className={cn("absolute top-0 right-0 translate-y-[-100%] rounded-t-sm px-1 font-mono text-[9px] leading-4 text-white", r.ok === false ? "bg-reject" : r.ok ? "bg-accept" : "bg-chart-4")}>{r.name}</span>
        </div>
      ))}
      {scanning && (
        <div className="pointer-events-none absolute inset-0" data-testid="card-scanning">
          <div className="card-scan-grid absolute inset-0" />
          <div className="card-scan-beam absolute inset-x-0">
            <div className="card-scan-glow" />
            <div className="card-scan-line" />
          </div>
          {(["top-2 left-2 border-t-2 border-l-2 rounded-tl-md", "top-2 right-2 border-t-2 border-r-2 rounded-tr-md", "bottom-2 left-2 border-b-2 border-l-2 rounded-bl-md", "bottom-2 right-2 border-b-2 border-r-2 rounded-br-md"] as const).map((c) => (
            <span key={c} className={cn("card-scan-corner border-chart-4 absolute size-5", c)} />
          ))}
          <div className="absolute bottom-2.5 left-1/2 flex max-w-[85%] -translate-x-1/2 items-center gap-2 rounded-full bg-black/65 px-3 py-1 text-[11px] font-medium text-white shadow-sm backdrop-blur-sm" role="status" aria-live="polite">
            <span className="relative flex size-2 shrink-0">
              <span className="bg-chart-4 absolute inline-flex size-full animate-ping rounded-full opacity-75 motion-reduce:animate-none" />
              <span className="bg-chart-4 relative inline-flex size-2 rounded-full" />
            </span>
            <span className="truncate">{stage ?? "Processing…"}</span>
          </div>
        </div>
      )}
    </div>
  )
}
