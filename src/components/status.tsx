import { CheckCircle2, CircleDashed, Loader2, MinusCircle, AlertTriangle, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { Decision, StepStatus } from "@/api/types"

export const decisionClass: Record<Decision, string> = {
  ACCEPT: "bg-accept/12 text-accept border-accept/30",
  REVIEW: "bg-review/15 text-[color-mix(in_oklch,var(--review)_75%,black)] dark:text-review border-review/40",
  REJECT: "bg-reject/12 text-reject border-reject/30",
}

export function DecisionBadge({ status, className }: { status: Decision; className?: string }) {
  return (
    <Badge variant="outline" className={cn("font-semibold tracking-wide", decisionClass[status], className)}>
      {status}
    </Badge>
  )
}

export function StepIcon({ status, className }: { status: StepStatus; className?: string }) {
  const c = cn("size-4 shrink-0", className)
  switch (status) {
    case "running":
      return <Loader2 className={cn(c, "animate-spin text-chart-4")} />
    case "pass":
      return <CheckCircle2 className={cn(c, "text-accept")} />
    case "warn":
      return <AlertTriangle className={cn(c, "text-review")} />
    case "fail":
      return <XCircle className={cn(c, "text-reject")} />
    case "skip":
      return <MinusCircle className={cn(c, "text-muted-foreground/60")} />
    default:
      return <CircleDashed className={cn(c, "text-muted-foreground/50")} />
  }
}

export const stepTone: Record<StepStatus, string> = {
  pending: "border-dashed border-border text-muted-foreground bg-background",
  running: "border-chart-4/60 bg-chart-4/8 text-foreground step-running",
  pass: "border-accept/40 bg-accept/8 text-foreground",
  warn: "border-review/50 bg-review/10 text-foreground",
  fail: "border-reject/50 bg-reject/10 text-foreground",
  skip: "border-border bg-muted/40 text-muted-foreground line-through decoration-muted-foreground/40",
}

export function Pct({ v, className }: { v: number; className?: string }) {
  return <span className={cn("tabular", className)}>{(v * 100).toFixed(1)}%</span>
}

export function ScoreBar({ value, threshold, className, tone = "bg-chart-4" }: { value: number; threshold?: number; className?: string; tone?: string }) {
  return (
    <div className={cn("relative h-1.5 w-full rounded-full bg-muted", className)}>
      <div className={cn("h-full rounded-full transition-all duration-500", tone)} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
      {threshold != null && <div className="absolute -top-1 h-3.5 w-0.5 rounded bg-foreground/70" style={{ left: `${threshold * 100}%` }} title={`threshold ${threshold}`} />}
    </div>
  )
}
