import * as React from "react"
import { useNavigate } from "react-router-dom"
import { FlaskConical, Info, Loader2, RotateCcw, Save, Undo2 } from "lucide-react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ConfirmDialog, ErrorState, JsonBlock, LoadingRows, PageHeader } from "@/components/common"
import { useEvaluationSets, useSettings } from "@/api/queries"
import { api } from "@/api/endpoints"
import type { SettingsValues } from "@/api/types"
import { useConnection } from "@/auth/connection"
import { cn } from "@/lib/utils"

// Meaning of every tunable key (from config/settings.yaml)
const HELP: Record<string, string> = {
  "scoring.family_weights": "How the four identification signals are combined (must sum to 1).",
  "scoring.variant_weights": "How the variant signals are combined (must sum to 1).",
  "scoring.family_min": "τ — minimum fused score to decide a programme.",
  "scoring.family_margin": "δ — required lead of the best programme over the second (prevents confident look-alike mistakes).",
  "scoring.variant_min": "Minimum variant score.",
  "scoring.variant_margin": "Required lead of the best variant over the second.",
  "scoring.reject_below": "Programme score below this = REJECT as unknown; between this and τ = REVIEW.",
  "scoring.geometry_required_without_text": "When no issuer text is read, accept only on a design match at least this strong.",
  "scoring.field_min_confidence": "Field OCR confidence below this sends the card to review (LOW_CONFIDENCE).",
  "quality.min_side": "Minimum short side of the photo in pixels.",
  "quality.min_blur": "Minimum sharpness (variance of the Laplacian).",
  "quality.max_glare": "Maximum share of blown-out pixels.",
  "quality.brightness_min": "Darkest acceptable mean brightness (0–1).",
  "quality.brightness_max": "Brightest acceptable mean brightness (0–1).",
  "retrieval.shortlist_refs": "Stage 1: nearest reference images taken from the vector index.",
  "retrieval.max_verify_refs": "Stage 2: maximum references verified with ORB + RANSAC per request.",
  "retrieval.refs_per_variant_verify": "References verified per variant.",
  "retrieval.ratio_test": "Lowe ratio for keypoint matches.",
  "retrieval.min_inliers": "RANSAC inliers needed to trust the alignment.",
  "retrieval.inliers_baseline": "Inliers two different cards with a shared template typically reach.",
  "retrieval.inliers_full_score": "Inliers that count as a perfect geometric match.",
  "retrieval.max_align_shift": "Ignore an alignment that moves a corner more than this fraction of the card width.",
  "retrieval.max_candidate_refs": "Reference images scored per request across shortlisted programmes.",
  "embedder.similarity_floor": "Cosine similarity below this counts as no visual match.",
}
const SECTION_TEXT: Record<string, string> = {
  scoring: "Identification and decision thresholds — the main automation-vs-risk trade-off.",
  quality: "The quality gate that asks for a retake.",
  retrieval: "Reference search and geometric verification.",
  embedder: "Visual matcher.",
}

type Draft = SettingsValues

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export default function SettingsPage() {
  const q = useSettings()
  const { isAdmin } = useConnection()
  const qc = useQueryClient()
  const nav = useNavigate()
  const sets = useEvaluationSets(isAdmin)
  const [draft, setDraft] = React.useState<Draft | null>(null)
  const [apply, setApply] = React.useState(false)
  const [reset, setReset] = React.useState<string | null>(null)
  const [whatIf, setWhatIf] = React.useState(false)
  const [setId, setSetId] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (q.data && !draft) setDraft(structuredClone(q.data.effective))
  }, [q.data, draft])

  if (q.isLoading || !draft) return q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <LoadingRows rows={10} />
  const s = q.data!

  // merge-patch of what the operator changed relative to the effective values
  const patch: Record<string, Record<string, unknown>> = {}
  for (const [sec, keys] of Object.entries(s.tunable))
    for (const k of keys)
      if (!eq(draft[sec]?.[k], s.effective[sec]?.[k])) {
        patch[sec] = patch[sec] ?? {}
        patch[sec][k] = eq(draft[sec][k], s.defaults[sec]?.[k]) && s.overrides[sec]?.[k] !== undefined ? null : draft[sec][k]
      }
  const changes = Object.entries(patch).flatMap(([sec, kv]) => Object.entries(kv).map(([k, v]) => ({ key: `${sec}.${k}`, from: s.effective[sec][k], to: v === null ? s.defaults[sec][k] : v, reset: v === null })))
  const weightErr = (["family_weights", "variant_weights"] as const).map((w) => {
    const sum = Object.values(draft.scoring?.[w] ?? {}).reduce((a: number, b) => a + Number(b), 0)
    return Math.abs(sum - 1) > 0.011 ? `${w} sum to ${sum.toFixed(2)}` : null
  }).filter(Boolean)

  const setVal = (sec: string, k: string, v: unknown) => setDraft((d) => ({ ...d!, [sec]: { ...d![sec], [k]: v } }))
  const refresh = (view: typeof s) => {
    qc.setQueryData(["settings"], view)
    setDraft(structuredClone(view.effective))
    qc.invalidateQueries({ queryKey: ["health"] })
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-4 pb-20">
      <PageHeader
        title="Decision settings"
        description="Thresholds and weights that decide ACCEPT / REVIEW / REJECT. Changes apply to every replica within seconds, without a restart. Test a change with a what-if evaluation before applying it."
        actions={
          isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setReset("all")} disabled={!Object.keys(s.overrides).length}>
              <RotateCcw /> Reset all overrides
            </Button>
          )
        }
      />
      {Object.keys(s.overrides).length > 0 && (
        <div className="border-review/50 bg-review/8 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <Info className="size-4" /> Runtime overrides are active: {Object.entries(s.overrides).flatMap(([sec, kv]) => Object.keys(kv).map((k) => <Badge key={sec + k} variant="outline" className="font-mono">{sec}.{k}</Badge>))}
        </div>
      )}

      {Object.entries(s.tunable).map(([sec, keys]) => (
        <Card key={sec}>
          <CardHeader>
            <CardTitle className="capitalize">{sec}</CardTitle>
            <CardDescription>{SECTION_TEXT[sec]}</CardDescription>
            {isAdmin && s.overrides[sec] && <CardAction><Button variant="ghost" size="sm" onClick={() => setReset(sec)}><Undo2 /> Reset section</Button></CardAction>}
          </CardHeader>
          <CardContent className="grid gap-x-6 gap-y-4 md:grid-cols-2">
            {keys.map((k) => {
              const v = draft[sec][k]
              const def = s.defaults[sec][k]
              const overridden = s.overrides[sec]?.[k] !== undefined
              const changed = !eq(v, s.effective[sec][k])
              return (
                <div key={k} className={cn("space-y-1.5 rounded-lg border p-3", changed && "border-chart-4/60 bg-chart-4/5", typeof v === "object" && "md:col-span-2")}>
                  <div className="flex items-center gap-2">
                    <Label className="font-mono text-xs">{k}</Label>
                    {overridden && <Badge variant="outline" className="border-review/50 h-4 px-1 text-[10px]">override</Badge>}
                    {changed && <Badge className="bg-chart-4 h-4 px-1 text-[10px]">edited</Badge>}
                    {!eq(v, def) && isAdmin && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button className="text-muted-foreground hover:text-foreground ml-auto" onClick={() => setVal(sec, k, structuredClone(def))} aria-label={`reset ${k} to default`}><Undo2 className="size-3.5" /></button>
                        </TooltipTrigger>
                        <TooltipContent>Back to default ({JSON.stringify(def)})</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  {typeof v === "object" && v !== null ? (
                    <WeightsEditor value={v as Record<string, number>} onChange={(nv) => setVal(sec, k, nv)} disabled={!isAdmin} />
                  ) : (
                    <Input aria-label={`${sec}.${k}`} type="number" step={Number.isInteger(def) ? 1 : 0.01} value={String(v)} onChange={(e) => setVal(sec, k, e.target.value === "" ? "" : Number(e.target.value))} disabled={!isAdmin} className="tabular h-8 w-40" />
                  )}
                  <p className="text-muted-foreground text-xs">{HELP[`${sec}.${k}`] ?? ""} <span className="font-mono">default {JSON.stringify(def)}</span></p>
                </div>
              )
            })}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Fixed at deployment</CardTitle>
          <CardDescription>Models, OCR, storage and retention change stored data or loaded models, so they are set in config/settings.yaml or CARDAGENT_* variables and need a restart.</CardDescription>
        </CardHeader>
        <CardContent><JsonBlock value={s.fixed} className="max-h-80" /></CardContent>
      </Card>

      {isAdmin && changes.length > 0 && (
        <div className="bg-background/95 fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur md:left-[var(--sidebar-width)]">
          <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-3 px-6 py-3">
            <span className="text-sm font-medium">{changes.length} change(s)</span>
            {weightErr.map((w) => <Badge key={w} variant="outline" className="text-reject">{w}</Badge>)}
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setDraft(structuredClone(s.effective))}><Undo2 /> Discard</Button>
              <Button variant="outline" size="sm" onClick={() => setWhatIf(true)} disabled={!!weightErr.length}><FlaskConical /> What-if evaluate</Button>
              <Button size="sm" onClick={() => setApply(true)} disabled={!!weightErr.length}><Save /> Apply to live traffic</Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={apply}
        onOpenChange={setApply}
        title="Apply to live traffic?"
        description={
          <>
            <p>These overrides take effect on every replica within seconds:</p>
            <ul className="space-y-0.5 font-mono text-xs">{changes.map((c) => <li key={c.key}>{c.key}: {JSON.stringify(c.from)} → {JSON.stringify(c.to)}{c.reset && " (default)"}</li>)}</ul>
            <p>The server validates the result as a whole; an invalid change is refused and nothing changes.</p>
          </>
        }
        confirmLabel="Apply"
        onConfirm={async () => {
          const view = await api.patchSettings(patch)
          refresh(view)
          toast.success("Settings applied")
        }}
      />
      <ConfirmDialog
        open={!!reset}
        onOpenChange={(o) => !o && setReset(null)}
        destructive
        title={reset === "all" ? "Remove all overrides?" : `Reset ${reset} to defaults?`}
        description="The values from config/settings.yaml and the environment apply again, on every replica."
        confirmLabel="Reset"
        onConfirm={async () => {
          const view = await api.resetSettings(reset === "all" ? undefined : reset!)
          refresh(view)
          toast.success("Overrides removed")
        }}
      />
      <Dialog open={whatIf} onOpenChange={setWhatIf}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>What-if evaluation</DialogTitle>
            <DialogDescription>Runs a labelled set with these changes on top of the live settings. Live traffic is not affected.</DialogDescription>
          </DialogHeader>
          <ul className="bg-muted/50 space-y-0.5 rounded-md p-2 font-mono text-xs">{changes.map((c) => <li key={c.key}>{c.key} → {JSON.stringify(c.to)}</li>)}</ul>
          <div className="space-y-1.5">
            <Label>Evaluation set</Label>
            <Select value={setId} onValueChange={setSetId}>
              <SelectTrigger className="w-full"><SelectValue placeholder={sets.data?.items.length ? "Choose a set" : "No sets yet — create one in Evaluations"} /></SelectTrigger>
              <SelectContent>{sets.data?.items.map((x) => <SelectItem key={x.set_id} value={x.set_id}>{x.name} · {x.cases} cases</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              disabled={!setId || busy}
              onClick={async () => {
                setBusy(true)
                try {
                  const ev = await api.startEvaluation({ set_id: setId, settings: patch as SettingsValues })
                  toast.success("What-if evaluation started")
                  nav(`/evaluations/${ev.evaluation_id}`)
                } catch (e) {
                  toast.error("Could not start", { description: (e as Error).message })
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy ? <Loader2 className="animate-spin" /> : <FlaskConical />} Start evaluation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function WeightsEditor({ value, onChange, disabled }: { value: Record<string, number>; onChange: (v: Record<string, number>) => void; disabled?: boolean }) {
  const sum = Object.values(value).reduce((a, b) => a + Number(b), 0)
  const ok = Math.abs(sum - 1) <= 0.011
  return (
    <div className="space-y-2">
      <div className="flex h-2 overflow-hidden rounded-full" aria-hidden>
        {Object.entries(value).map(([k, v], i) => <div key={k} style={{ width: `${(Number(v) / Math.max(sum, 1)) * 100}%`, background: `var(--chart-${(i % 5) + 1})` }} />)}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {Object.entries(value).map(([k, v], i) => (
          <div key={k} className="space-y-1">
            <Label className="flex items-center gap-1 text-[11px]"><span className="size-2 rounded-sm" style={{ background: `var(--chart-${(i % 5) + 1})` }} />{k}</Label>
            <Input type="number" step={0.05} min={0} max={1} value={v} disabled={disabled} onChange={(e) => onChange({ ...value, [k]: Number(e.target.value) })} className="tabular h-8 w-20" />
          </div>
        ))}
        <span className={cn("tabular pb-2 text-xs", ok ? "text-muted-foreground" : "text-reject font-medium")}>sum {sum.toFixed(2)}{ok ? "" : " — must be 1"}</span>
      </div>
    </div>
  )
}
