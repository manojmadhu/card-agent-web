// Shared building blocks used across every page.
import * as React from "react"
import { AlertTriangle, CheckCircle2, CircleDashed, Copy, KeyRound, Loader2, MinusCircle, RefreshCw, ShieldAlert, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { ApiError, fetchImageUrl } from "@/api/client"
import type { Decision, ReviewStatus, StepStatus } from "@/api/types"
import { useConnection } from "@/auth/connection"

export function PageHeader({ title, description, actions, children }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground mt-1 max-w-3xl text-sm">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export const decisionTone: Record<Decision, string> = {
  ACCEPT: "bg-accept/12 text-accept border-accept/35",
  REVIEW: "bg-review/15 text-[color-mix(in_oklch,var(--review)_70%,black)] dark:text-review border-review/45",
  REJECT: "bg-reject/12 text-reject border-reject/35",
}

export function DecisionBadge({ status, className }: { status: Decision; className?: string }) {
  return (
    <Badge variant="outline" className={cn("font-semibold tracking-wide", decisionTone[status], className)}>
      {status}
    </Badge>
  )
}

export function ReviewBadge({ status }: { status: ReviewStatus }) {
  if (status === "none") return <span className="text-muted-foreground text-xs">—</span>
  const tone = status === "pending" ? "border-review/50 text-foreground bg-review/10" : status === "accepted" ? "text-accept border-accept/40" : "text-reject border-reject/40"
  return (
    <Badge variant="outline" className={cn("capitalize", tone)}>
      {status}
    </Badge>
  )
}

export function StepIcon({ status, className }: { status: StepStatus; className?: string }) {
  const c = cn("size-4 shrink-0", className)
  switch (status) {
    case "running":
      return <Loader2 className={cn(c, "text-chart-4 animate-spin")} aria-label="running" />
    case "pass":
      return <CheckCircle2 className={cn(c, "text-accept")} aria-label="passed" />
    case "warn":
      return <AlertTriangle className={cn(c, "text-review")} aria-label="warning" />
    case "fail":
      return <XCircle className={cn(c, "text-reject")} aria-label="failed" />
    case "skip":
      return <MinusCircle className={cn(c, "text-muted-foreground/60")} aria-label="skipped" />
    default:
      return <CircleDashed className={cn(c, "text-muted-foreground/50")} aria-label="pending" />
  }
}

export function ScoreBar({ value, threshold, tone = "bg-chart-4", className }: { value: number; threshold?: number; tone?: string; className?: string }) {
  return (
    <div className={cn("bg-muted relative h-1.5 w-full rounded-full", className)} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={1}>
      <div className={cn("h-full rounded-full transition-all duration-500", tone)} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
      {threshold != null && <div className="bg-foreground/70 absolute -top-1 h-3.5 w-0.5 rounded" style={{ left: `${Math.min(1, threshold) * 100}%` }} title={`threshold ${threshold}`} />}
    </div>
  )
}

export function ErrorState({ error, onRetry, compact }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  const e = error as ApiError
  const { setAuthPromptOpen } = useConnection()
  const auth = e?.status === 401 || e?.status === 403
  const title = e?.status === 503 ? "Service unavailable" : auth ? (e.status === 401 ? "Admin token rejected" : "Admin endpoints are disabled on the server") : e?.status === 404 ? "Not found" : e?.status === 0 ? "Cannot reach the API" : "Something went wrong"
  return (
    <Card className={cn("border-reject/30", compact && "py-3")}>
      <CardContent className="flex items-start gap-3">
        {auth ? <KeyRound className="text-reject mt-0.5 size-5" /> : <ShieldAlert className="text-reject mt-0.5 size-5" />}
        <div className="min-w-0 flex-1">
          <div className="font-medium">{title}</div>
          <div className="text-muted-foreground mt-0.5 text-sm break-words">
            {e?.message ?? String(error)}
            {e?.status === 503 && e.retryAfter ? ` Retry in ${e.retryAfter}s.` : ""}
            {e?.status === 403 && " Set CARDAGENT_API__ADMIN_TOKEN on the server."}
          </div>
        </div>
        <div className="flex gap-2">
          {e?.status === 401 && (
            <Button size="sm" variant="outline" onClick={() => setAuthPromptOpen(true)}>
              <KeyRound /> Enter token
            </Button>
          )}
          {onRetry && (
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RefreshCw /> Retry
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function EmptyState({ icon, title, children, action }: { icon?: React.ReactNode; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
      {icon && <div className="text-muted-foreground [&_svg]:size-7">{icon}</div>}
      <div className="font-medium">{title}</div>
      {children && <p className="text-muted-foreground max-w-md text-sm">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  )
}

/** Shown in place of an admin-only screen when no valid admin token is set. */
export function AdminRequired({ what }: { what: string }) {
  const { role, setAuthPromptOpen } = useConnection()
  return (
    <EmptyState
      icon={<KeyRound />}
      title="Admin access required"
      action={
        role !== "admin-disabled" && (
          <Button onClick={() => setAuthPromptOpen(true)}>
            <KeyRound /> Enter admin token
          </Button>
        )
      }
    >
      {role === "admin-disabled" ? `The server has admin endpoints disabled, so ${what} is not available. Ask an operator to set CARDAGENT_API__ADMIN_TOKEN.` : `${what} contains personal data or changes the platform, so it needs the X-Admin-Token.`}
    </EmptyState>
  )
}

/** Image from an admin endpoint: fetched with the token header and shown as an object URL. */
export function AuthImage({ path, alt, className, fallback }: { path: string | null; alt: string; className?: string; fallback?: React.ReactNode }) {
  const [url, setUrl] = React.useState<string | null>(null)
  const [failed, setFailed] = React.useState(false)
  React.useEffect(() => {
    if (!path) return
    const ctl = new AbortController()
    let made: string | null = null
    setFailed(false)
    fetchImageUrl(path, ctl.signal)
      .then((u) => {
        made = u
        setUrl(u)
      })
      .catch(() => !ctl.signal.aborted && setFailed(true))
    return () => {
      ctl.abort()
      if (made) URL.revokeObjectURL(made)
    }
  }, [path])
  if (failed || !path) return <>{fallback ?? <div className={cn("bg-muted text-muted-foreground flex items-center justify-center text-xs", className)}>no image</div>}</>
  if (!url) return <Skeleton className={className} />
  return <img src={url} alt={alt} className={className} loading="lazy" />
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          toast.success("Copied to clipboard")
        } catch {
          toast.error("Clipboard not available")
        }
      }}
    >
      <Copy /> {label}
    </Button>
  )
}

export function JsonBlock({ value, className }: { value: unknown; className?: string }) {
  return <pre className={cn("bg-muted/50 max-h-[560px] overflow-auto rounded-md p-3 font-mono text-[11.5px] leading-relaxed", className)}>{JSON.stringify(value, null, 2)}</pre>
}

/**
 * Confirmation for destructive or irreversible actions. With `typeToConfirm` the user must type the
 * given text (e.g. the card id) before the action button enables.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  destructive,
  typeToConfirm,
  onConfirm,
  children,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  description: React.ReactNode
  confirmLabel?: string
  destructive?: boolean
  typeToConfirm?: string
  onConfirm: () => Promise<unknown> | void
  children?: React.ReactNode
}) {
  const [typed, setTyped] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => {
    if (!open) setTyped("")
  }, [open])
  const ok = !typeToConfirm || typed === typeToConfirm
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        {typeToConfirm && (
          <div className="space-y-1.5">
            <Label htmlFor="confirm-text" className="text-xs">
              Type <span className="font-mono font-semibold">{typeToConfirm}</span> to confirm
            </Label>
            <Input id="confirm-text" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className="font-mono" />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!ok || busy}
            className={cn(destructive && "bg-destructive hover:bg-destructive/90 text-white")}
            onClick={async (e) => {
              e.preventDefault()
              setBusy(true)
              try {
                await onConfirm()
                onOpenChange(false)
              } catch (err) {
                toast.error((err as Error).message)
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy && <Loader2 className="animate-spin" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function Kv({ k, v, mono, className }: { k: string; v: React.ReactNode; mono?: boolean; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">{k}</div>
      <div className={cn("truncate text-sm font-medium", mono && "font-mono text-xs")}>{v}</div>
    </div>
  )
}

export function toastError(e: unknown, title = "Request failed") {
  toast.error(title, { description: (e as Error)?.message ?? String(e) })
}
