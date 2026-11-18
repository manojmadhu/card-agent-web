import { cn } from "@/lib/utils"

export interface RoiBox {
  name: string
  roi: number[]
  ok?: boolean
  value?: string | null
}

export function CardPreview({ src, rois, className, scanning }: { src: string | null; rois?: RoiBox[]; className?: string; scanning?: boolean }) {
  return (
    <div className={cn("bg-muted relative aspect-[1012/638] w-full overflow-hidden rounded-xl border", className)}>
      {src ? <img src={src} className="absolute inset-0 size-full object-cover" alt="card" /> : <div className="text-muted-foreground absolute inset-0 flex items-center justify-center text-sm">No card selected</div>}
      {scanning && <div className="pointer-events-none absolute inset-x-0 h-16 animate-[scan_1.6s_ease-in-out_infinite] bg-gradient-to-b from-transparent via-white/40 to-transparent" />}
      {rois?.map((r) => (
        <div
          key={r.name}
          className={cn("absolute rounded-sm border-2 transition-all", r.ok === false ? "border-reject bg-reject/10" : r.ok ? "border-accept bg-accept/10" : "border-chart-4 border-dashed bg-chart-4/5")}
          style={{ left: `${r.roi[0] * 100}%`, top: `${r.roi[1] * 100}%`, width: `${(r.roi[2] - r.roi[0]) * 100}%`, height: `${(r.roi[3] - r.roi[1]) * 100}%` }}
        >
          <span className={cn("absolute -top-4 left-0 rounded-sm px-1 font-mono text-[9px] leading-4 text-white", r.ok === false ? "bg-reject" : r.ok ? "bg-accept" : "bg-chart-4")}>{r.name}</span>
        </div>
      ))}
      <style>{`@keyframes scan { 0% { top: -4rem } 100% { top: 100% } }`}</style>
    </div>
  )
}
