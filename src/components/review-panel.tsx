// Human review of a run: POST /v1/runs/{id}/review (accept/reject, corrections, enroll as reference).
import * as React from "react"
import { Check, ImagePlus, Loader2, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { useCard, useCards, useReviewMutation } from "@/api/queries"
import type { RunDetail, Side } from "@/api/types"
import { SideBadge } from "@/components/photos"
import { api } from "@/api/endpoints"
import { AuthImage } from "@/components/common"
import { useConnection } from "@/auth/connection"
import { dateTime, maskValue } from "@/lib/format"
import { cn } from "@/lib/utils"
import { ApiError } from "@/api/client"

export function ExistingReview({ run }: { run: RunDetail }) {
  const { prefs } = useConnection()
  const r = run.review
  if (!r) return null
  return (
    <div className={cn("space-y-2 rounded-lg border p-3 text-sm", r.decision === "accept" ? "border-accept/40 bg-accept/5" : "border-reject/40 bg-reject/5")}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={r.decision === "accept" ? "text-accept" : "text-reject"}>reviewer: {r.decision}</Badge>
        <span className="text-muted-foreground text-xs">{r.reviewer ?? "unnamed reviewer"} · {dateTime(r.reviewed_at)}</span>
        {r.enrolled_photos?.length ? (
        <Badge variant="secondary">enrolled {r.enrolled_photos.map((e) => `${e.side} (${e.status})`).join(" + ")}</Badge>
      ) : r.enrolled ? (
        <Badge variant="secondary">enrolled as reference ({r.enrolled.status})</Badge>
      ) : null}
      </div>
      {r.decision === "accept" && <div className="text-xs">Identified as <span className="font-mono">{r.family}/{r.variant}</span></div>}
      {Object.keys(r.fields ?? {}).length > 0 && (
        <div className="text-xs">Corrections: {Object.entries(r.fields).map(([k, v]) => <span key={k} className="mr-2 font-mono">{k}={maskValue(k, v, prefs.maskPii)}</span>)}</div>
      )}
      {r.note && <div className="text-muted-foreground text-xs">“{r.note}”</div>}
    </div>
  )
}

export function ReviewPanel({ run, onDone, compact }: { run: RunDetail; onDone?: () => void; compact?: boolean }) {
  const { prefs, setPrefs } = useConnection()
  const cards = useCards()
  const m = useReviewMutation()
  const [family, setFamily] = React.useState(run.family ?? "")
  const [variant, setVariant] = React.useState(run.variant ?? "")
  const [note, setNote] = React.useState("")
  const [enroll, setEnroll] = React.useState(false)
  const [fields, setFields] = React.useState<Record<string, string>>({})
  // 2.1: the side each stored photo will be enrolled as (defaults to the side the agent used it as)
  const runPhotos = run.result?.photos ?? []
  const agentSides = React.useMemo(() => Object.fromEntries(runPhotos.map((p) => [String(p.photo), p.side])), [run.run_id]) // eslint-disable-line react-hooks/exhaustive-deps
  const [photoSides, setPhotoSides] = React.useState<Record<string, Side | null>>(agentSides)
  const card = useCard(family)
  const def = card.data?.definition
  React.useEffect(() => {
    setFamily(run.family ?? "")
    setVariant(run.variant ?? "")
    setNote("")
    setEnroll(false)
    setFields({})
    setPhotoSides(agentSides)
  }, [run.run_id, run.family, run.variant, agentSides])

  const extracted = run.result?.fields ?? {}
  const identified = !!(family && variant)

  const multiPhoto = runPhotos.length > 1 || runPhotos.some((p) => !p.side)
  const enrollPlan = runPhotos.length
    ? runPhotos.filter((p) => photoSides[String(p.photo)]).map((p) => ({ photo: p.photo, side: photoSides[String(p.photo)] as Side }))
    : [{ photo: 0, side: "front" as Side }]
  const cardSides = def?.sides?.map((x) => x.id) ?? ["front"]
  const sideProblem = enroll && enrollPlan.some((p) => !cardSides.includes(p.side)) ? `${family} has no ${enrollPlan.find((p) => !cardSides.includes(p.side))?.side} side` : enroll && runPhotos.length > 0 && !enrollPlan.length ? "Choose the side of at least one photo" : null

  const submit = async (decision: "accept" | "reject") => {
    if (decision === "accept" && !identified) return toast.error("Choose the correct programme and variant before accepting")
    if (decision === "accept" && sideProblem) return toast.error(sideProblem)
    const changed = Object.fromEntries(Object.entries(fields).filter(([k, v]) => v.trim() && v.trim() !== (extracted[k]?.value ?? "")))
    try {
      await m.mutateAsync({
        id: run.run_id,
        body: {
          decision,
          family: decision === "accept" && family !== run.family ? family : undefined,
          variant: decision === "accept" && (variant !== run.variant || family !== run.family) ? variant : undefined,
          fields: decision === "accept" ? changed : {},
          note: note.trim() || undefined,
          reviewer: prefs.reviewer.trim() || undefined,
          enroll: decision === "accept" && enroll,
          // send sides only when they differ from the agent's (or the agent could not tell)
          photo_sides:
            decision === "accept" && enroll && Object.entries(photoSides).some(([k, v]) => v && v !== agentSides[k])
              ? (Object.fromEntries(Object.entries(photoSides).filter(([, v]) => v)) as Record<string, Side>)
              : undefined,
        },
      })
      toast.success(decision === "accept" ? "Accepted" : "Rejected", {
        description: enroll && decision === "accept" ? `${enrollPlan.length > 1 ? `${enrollPlan.length} photos` : "Photo"} enrolled as ${family}/${variant} reference${enrollPlan.length > 1 ? "s" : ""} (${enrollPlan.map((p) => p.side).join(" + ")})` : undefined,
      })
      onDone?.()
    } catch (e) {
      toast.error("Review not saved", { description: (e as ApiError).message })
    }
  }

  return (
    <div className="space-y-4">
      <div className={cn("grid gap-3", !compact && "sm:grid-cols-2")}>
        <div className="space-y-1.5">
          <Label className="text-xs">Programme</Label>
          <Select value={family} onValueChange={(v) => { setFamily(v); setVariant(""); setFields({}) }}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Not identified — choose" /></SelectTrigger>
            <SelectContent>{cards.data?.items.map((f) => <SelectItem key={f.family} value={f.family}>{f.name} <span className="text-muted-foreground font-mono text-xs">{f.family}</span></SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Variant</Label>
          <Select value={variant} onValueChange={setVariant} disabled={!family}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Choose variant" /></SelectTrigger>
            <SelectContent>{def?.variants.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      {(family !== (run.family ?? "") || variant !== (run.variant ?? "")) && identified && (
        <p className="text-review text-xs">Correcting the identification: the agent said {run.family ?? "unknown"}/{run.variant ?? "—"}.</p>
      )}

      {def && def.fields.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs">Field values <span className="text-muted-foreground font-normal">(edit only what the agent read wrong)</span></Label>
          <div className="space-y-1.5">
            {def.fields.map((f) => {
              const got = extracted[f.name]?.value ?? ""
              return (
                <div key={f.name} className="grid grid-cols-[120px_1fr] items-center gap-2">
                  <span className="text-muted-foreground truncate text-xs">{f.name}</span>
                  <Input
                    value={fields[f.name] ?? (prefs.maskPii ? "" : got)}
                    placeholder={got ? maskValue(f.name, got, prefs.maskPii) ?? "" : "not read"}
                    onChange={(e) => setFields((x) => ({ ...x, [f.name]: e.target.value }))}
                    className={cn("h-8 font-mono text-xs", fields[f.name] && fields[f.name] !== got && "border-review")}
                    dir={f.script === "arabic" ? "rtl" : "ltr"}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
        <div className="space-y-1.5">
          <Label htmlFor={`note-${run.run_id}`} className="text-xs">Note</Label>
          <Textarea id={`note-${run.run_id}`} value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="e.g. glare on number, confirmed with member" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reviewer" className="text-xs">Reviewer</Label>
          <Input id="reviewer" value={prefs.reviewer} onChange={(e) => setPrefs({ reviewer: e.target.value })} placeholder="your name or id" />
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border p-3">
        <Checkbox id={`enroll-${run.run_id}`} checked={enroll} onCheckedChange={(v) => setEnroll(!!v)} disabled={!run.has_image} />
        <Label htmlFor={`enroll-${run.run_id}`} className="text-sm leading-snug font-normal">
          <span className="flex items-center gap-1.5 font-medium"><ImagePlus className="size-4" /> Enroll this photo as a reference</span>
          <span className="text-muted-foreground block text-xs">{run.has_image ? `Accept only. Teaches the agent this design so it is recognised next time${multiPhoto ? " — every photo as the side it shows" : ""}.` : "No photo was stored for this run."}</span>
        </Label>
      </div>
      {enroll && multiPhoto && (
        <div className="space-y-2 rounded-lg border p-3">
          <div className="text-xs font-medium">Enrol as</div>
          {runPhotos.map((p) => (
            <div key={p.photo} className="flex items-center gap-2">
              <AuthImage path={api.runImagePath(run.run_id, { photo: p.photo })} alt="" className="h-9 w-14 rounded border object-cover" />
              <span className="text-xs">Photo {p.photo + 1}</span>
              {p.side && <span className="text-muted-foreground text-[11px]">agent: {p.side}</span>}
              <Select value={photoSides[String(p.photo)] ?? "skip"} onValueChange={(v) => setPhotoSides((x) => ({ ...x, [String(p.photo)]: v === "skip" ? null : (v as Side) }))}>
                <SelectTrigger size="sm" className="ml-auto w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="front">Front</SelectItem>
                  <SelectItem value="back">Back</SelectItem>
                  <SelectItem value="skip">Do not enrol</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-1 text-xs">
            Will add: {enrollPlan.length ? enrollPlan.map((p) => <SideBadge key={p.photo} side={p.side} />) : <span className="text-muted-foreground">nothing</span>}
            {family && variant && <span className="text-muted-foreground">to {family}/{variant}</span>}
          </div>
          {sideProblem && <p className="text-reject text-xs">{sideProblem}</p>}
        </div>
      )}

      {run.review_status !== "pending" && run.review_status !== "none" && (
        <Alert>
          <AlertDescription className="text-xs">This run was already reviewed ({run.review_status}). Submitting again replaces that verdict.</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        <Button className="bg-accept hover:bg-accept/90 flex-1 text-white" onClick={() => submit("accept")} disabled={m.isPending}>
          {m.isPending ? <Loader2 className="animate-spin" /> : <Check />} Accept card
        </Button>
        <Button variant="outline" className="text-reject border-reject/40 flex-1" onClick={() => submit("reject")} disabled={m.isPending}>
          <X /> Reject card
        </Button>
      </div>
    </div>
  )
}
