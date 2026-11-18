import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { DecisionBadge } from "@/components/status"
import { AuthImage, evalImagePath } from "@/components/auth-image"
import type { EvalRow, EvalSummary } from "@/api/types"
import { cn } from "@/lib/utils"

export function EvalResults({ rows, summary, progress, error }: { rows: EvalRow[]; summary: EvalSummary | null; progress: { done: number; total: number } | null; error: string | null }) {
  return (
    <div className="space-y-3">
      {progress && (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground whitespace-nowrap">Validating {progress.done}/{progress.total || "…"}</span>
          <Progress value={progress.total ? (progress.done / progress.total) * 100 : 5} />
        </div>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {summary && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span>Matched expected <b className="tabular">{summary.passed}/{summary.total}</b></span>
          <span className={summary.wrong_accepts ? "text-reject font-medium" : ""}>Wrong ACCEPTs <b className="tabular">{summary.wrong_accepts}</b> <span className="text-muted-foreground text-xs">(target 0)</span></span>
          <span>Auto-accept <b className="tabular">{summary.total ? Math.round((summary.auto_accept / summary.total) * 100) : 0}%</b></span>
        </div>
      )}
      {rows.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => (
            <div key={r.file} className={cn("flex gap-2 rounded-lg border p-2 text-xs", !r.passed && "border-reject/50 bg-reject/5")}>
              <AuthImage path={evalImagePath(r.file, 200)} className="h-12 w-16 shrink-0 rounded border object-cover" />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="truncate font-medium" title={r.file}>{r.file}</div>
                <div className="flex flex-wrap items-center gap-1">
                  <DecisionBadge status={r.got} className="h-4 px-1 text-[9px]" />
                  {!r.passed && <span className="text-muted-foreground">expected</span>}
                  {!r.passed && <DecisionBadge status={r.expected} className="h-4 px-1 text-[9px]" />}
                  <span className="text-muted-foreground ml-auto tabular">{r.processing_ms} ms</span>
                </div>
                {(r.family_got || r.family_expected) && (
                  <div className={cn("truncate", r.family_expected && r.family_got !== r.family_expected && r.got !== "REJECT" && "text-reject")}>
                    {r.family_got ?? "—"}/{r.variant_got ?? "—"}
                  </div>
                )}
                {r.reasons.length > 0 && <div className="text-muted-foreground truncate font-mono text-[10px]" title={r.reasons.join(", ")}>{r.reasons.join(", ")}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
