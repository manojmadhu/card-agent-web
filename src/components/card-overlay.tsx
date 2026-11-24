import * as React from "react"
import { cn } from "@/lib/utils"

export interface RoiBox {
  name: string
  roi: number[]
  ok?: boolean
}

/** Card image (1012×638 aspect) with field ROIs drawn on top. */
export function CardOverlay({ src, rois, className, scanning, children }: { src?: string | null; rois?: RoiBox[]; className?: string; scanning?: boolean; children?: React.ReactNode }) {
  return (
    <div className={cn("bg-muted relative aspect-[1012/638] w-full overflow-hidden rounded-xl border", className)}>
      {src ? <img src={src} className="absolute inset-0 size-full object-cover" alt="card" /> : children ?? <div className="text-muted-foreground absolute inset-0 flex items-center justify-center text-sm">No card yet</div>}
      {scanning && <div className="pointer-events-none absolute inset-x-0 h-16 animate-[scan_1.6s_ease-in-out_infinite] bg-gradient-to-b from-transparent via-white/40 to-transparent" />}
      {rois?.map((r) => (
        <div
          key={r.name}
          className={cn("absolute rounded-sm border-2", r.ok === false ? "border-reject bg-reject/10" : r.ok ? "border-accept bg-accept/10" : "border-chart-4 bg-chart-4/5 border-dashed")}
          style={{ left: `${r.roi[0] * 100}%`, top: `${r.roi[1] * 100}%`, width: `${(r.roi[2] - r.roi[0]) * 100}%`, height: `${(r.roi[3] - r.roi[1]) * 100}%` }}
        >
          <span className={cn("absolute top-0 right-0 translate-y-[-100%] rounded-t-sm px-1 font-mono text-[9px] leading-4 text-white", r.ok === false ? "bg-reject" : r.ok ? "bg-accept" : "bg-chart-4")}>{r.name}</span>
        </div>
      ))}
    </div>
  )
}
