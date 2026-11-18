import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, FlaskConical, KeyRound, PlugZap, RotateCcw, Save } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { EvalResults } from "@/components/eval-results"
import { getConnection, request, setConnection, useConnection } from "@/api/client"
import { useInfo, useResetSettings, useSettings, useUpdateSettings } from "@/api/hooks"
import { useEvaluation } from "@/hooks/use-eval"
import type { Info, Thresholds } from "@/api/types"

type K = keyof Thresholds

function Num({ label, hint, k, min, max, step, draft, defaults, set, disabled }: { label: string; hint?: string; k: K; min: number; max: number; step: number; draft: Thresholds; defaults: Thresholds; set: (p: Partial<Thresholds>) => void; disabled?: boolean }) {
  const v = draft[k]
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <span className="tabular text-sm font-medium">
          {v}
          {defaults[k] !== v && <span className="text-muted-foreground ml-1 text-xs">(default {defaults[k]})</span>}
        </span>
      </div>
      <Slider value={[v]} min={min} max={max} step={step} disabled={disabled} onValueChange={([x]) => set({ [k]: +x.toFixed(3) } as Partial<Thresholds>)} />
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  )
}

function ConnectionCard() {
  const conn = useConnection()
  const qc = useQueryClient()
  const [base, setBase] = React.useState(conn.baseUrl)
  const [key, setKey] = React.useState(conn.apiKey)
  const [remember, setRemember] = React.useState(conn.remember)
  const [result, setResult] = React.useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = React.useState(false)

  const test = async (apply: boolean) => {
    setBusy(true)
    const prev = getConnection()
    setConnection({ baseUrl: base, apiKey: key.trim(), remember })
    try {
      const info = await request<Info>("/v1/info")
      setResult({ ok: true, text: `Connected · ${info.service} ${info.api_version} · ${info.families} families · role ${info.auth.role}${info.auth.enabled ? "" : " (auth disabled on the service)"}` })
      if (apply) {
        qc.resetQueries()
        toast.success("Connection saved")
      } else setConnection(prev)
    } catch (e) {
      setResult({ ok: false, text: (e as Error).message })
      setConnection(prev)
      if (apply) toast.error("Not saved — the service is not reachable with these settings")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><PlugZap className="size-4" /> Connection</CardTitle>
        <CardDescription>The on-prem card-agent service this console talks to. Card images go only to this service.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="base">Service URL</Label>
          <Input id="base" value={base} onChange={(e) => setBase(e.target.value)} className="font-mono" placeholder="https://card-agent.internal  (empty = same origin)" />
          <p className="text-muted-foreground text-[11px]">Leave empty when the console is served by the service or by the Vite dev proxy. A different origin must be listed in CARD_AGENT_CORS_ORIGINS.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="key" className="flex items-center gap-1.5"><KeyRound className="size-3.5" /> API key</Label>
          <Input id="key" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} className="font-mono" placeholder="CARD_AGENT_API_KEY or CARD_AGENT_ADMIN_KEY" />
          <div className="flex items-center gap-2">
            <Switch id="remember" checked={remember} onCheckedChange={setRemember} />
            <Label htmlFor="remember" className="text-xs font-normal">Remember on this device (otherwise kept for this browser tab only)</Label>
          </div>
        </div>
        {result && (
          <p className={`text-xs md:col-span-2 ${result.ok ? "text-accept" : "text-reject"}`}>{result.text}</p>
        )}
      </CardContent>
      <CardFooter className="gap-2">
        <Button variant="outline" onClick={() => test(false)} disabled={busy}>Test</Button>
        <Button onClick={() => test(true)} disabled={busy}><Save /> Save connection</Button>
      </CardFooter>
    </Card>
  )
}

function ServiceCard() {
  const { data: info, isLoading } = useInfo()
  if (isLoading) return <Skeleton className="h-48 lg:col-span-2" />
  if (!info) return null
  const missingAra = !info.ocr.languages.split("+").includes("ara")
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Service</CardTitle>
        <CardDescription>What the connected card-agent is running</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Kv k="API / pipeline" v={`${info.api_version} / ${info.pipeline_version}`} />
          <Kv k="Result schema" v={info.schema_version} />
          <Kv k="Registry" v={`${info.registry_version} · ${info.families} families`} />
          <Kv k="OCR" v={`${info.ocr.engine} · ${info.ocr.languages}`} />
          <Kv k="VLM fallback" v={info.vlm.enabled ? `on · ${info.vlm.model}` : "off (CARD_AGENT_VLM_URL unset)"} />
          <Kv k="Your role" v={info.auth.enabled ? info.auth.role : "admin (auth disabled)"} />
          <Kv k="Images kept for review" v={info.store.images ? `yes · ${info.store.retention_days ? `${info.store.retention_days} days` : "no expiry"}` : "no"} />
          <Kv k="Labelled test set" v={`${info.evaluation.cases} cases`} />
        </div>
        {!info.auth.enabled && (
          <Alert>
            <AlertTriangle />
            <AlertTitle>The API is open</AlertTitle>
            <AlertDescription>Set CARD_AGENT_API_KEY (operators) and CARD_AGENT_ADMIN_KEY (registry and threshold changes) on the service before production.</AlertDescription>
          </Alert>
        )}
        {missingAra && (
          <Alert>
            <AlertTriangle />
            <AlertTitle>Arabic OCR data is not installed</AlertTitle>
            <AlertDescription>Tesseract on the service has {info.ocr.installed.join(", ") || "no languages"}. Arabic keywords (e.g. فزعة) won't be read until tesseract-ocr-ara is installed.</AlertDescription>
          </Alert>
        )}
        {Object.keys(info.registry_errors).length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Registry files failing to load</AlertTitle>
            <AlertDescription className="font-mono text-xs">{Object.entries(info.registry_errors).map(([k, v]) => <div key={k}>{k}: {v}</div>)}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

export default function SettingsPage() {
  const { data, isLoading, error } = useSettings()
  const info = useInfo()
  const update = useUpdateSettings()
  const reset = useResetSettings()
  const ev = useEvaluation()
  const [draft, setDraft] = React.useState<Thresholds | null>(null)
  React.useEffect(() => {
    if (data && !draft) setDraft(data.current)
  }, [data, draft])
  const isAdmin = info.data?.auth.role === "admin"
  const set = (p: Partial<Thresholds>) => setDraft((d) => (d ? { ...d, ...p } : d))
  const changed = data && draft ? (Object.keys(draft) as K[]).filter((k) => draft[k] !== data.current[k]) : []
  const patch = draft ? (Object.fromEntries(changed.map((k) => [k, draft[k]])) as Partial<Thresholds>) : {}

  const apply = () =>
    update.mutate(patch, {
      onSuccess: (r) => {
        setDraft(r.current)
        toast.success("Thresholds applied", { description: "New validations use them immediately." })
      },
      onError: (e) => toast.error("Thresholds rejected", { description: e.message }),
    })

  const common = draft && data ? { draft, defaults: data.defaults, set, disabled: !isAdmin } : null

  return (
    <div className="mx-auto grid max-w-[1300px] gap-4 lg:grid-cols-2">
      <ConnectionCard />
      <ServiceCard />

      {isLoading && <Skeleton className="h-64 lg:col-span-2" />}
      {error && !info.error && <p className="text-reject text-sm lg:col-span-2">{error.message}</p>}
      {common && (
        <>
          <div className="flex flex-wrap items-center gap-2 lg:col-span-2">
            <h2 className="text-lg font-semibold tracking-tight">Decision thresholds</h2>
            <span className="text-muted-foreground text-sm">Live on the service · trade automation rate against risk</span>
            {!isAdmin && <Badge variant="outline">read-only — needs the admin key</Badge>}
            {changed.length > 0 && <Badge variant="secondary">{changed.length} unsaved change(s)</Badge>}
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" disabled={!changed.length} onClick={() => setDraft(data!.current)}>Discard</Button>
              <Button size="sm" disabled={!changed.length || !isAdmin || update.isPending} onClick={apply}><Save /> Apply to service</Button>
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Family decision</CardTitle>
              <CardDescription>Decided only if top-1 ≥ τ <b>and</b> top-1 − top-2 ≥ δ.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Num {...common} label="τ family (min score)" k="family_min" min={0.2} max={0.95} step={0.01} />
              <Num {...common} label="δ family (min margin)" k="family_margin" min={0} max={0.5} step={0.01} hint="Prevents confident wrong answers between look-alike cards." />
              <Num {...common} label="Reject as unknown below" k="unknown_reject_below" min={0} max={0.9} step={0.01} hint="Undecided cards scoring below this are REJECTED as unknown; between this and τ they go to REVIEW." />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Variant &amp; fields</CardTitle>
              <CardDescription>Variants are compared only within the chosen family.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Num {...common} label="τ variant" k="variant_min" min={0.2} max={0.95} step={0.01} />
              <Num {...common} label="δ variant" k="variant_margin" min={0} max={0.5} step={0.01} />
              <Num {...common} label="Min field OCR confidence" k="field_min_conf" min={0} max={1} step={0.01} hint="Extracted values below this send the card to review (LOW_CONFIDENCE)." />
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Quality gate</CardTitle>
              <CardDescription>Fails fast with RETAKE_REQUIRED so the capture app can prompt for another photo.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <Num {...common} label="Min short side (px)" k="min_side" min={100} max={1500} step={10} />
              <Num {...common} label="Min sharpness (Laplacian variance)" k="min_blur" min={0} max={400} step={5} />
              <Num {...common} label="Min brightness" k="min_brightness" min={0} max={0.5} step={0.01} />
              <Num {...common} label="Max brightness" k="max_brightness" min={0.5} max={1} step={0.01} />
              <Num {...common} label="Max glare ratio" k="max_glare" min={0} max={0.4} step={0.005} />
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>What-if: evaluate these thresholds</CardTitle>
              <CardDescription>Runs the service's labelled test set with the values above ({changed.length ? "including unsaved changes" : "the live values"}). Nothing is applied or stored.</CardDescription>
            </CardHeader>
            <CardContent>{ev.rows.length || ev.running || ev.error ? <EvalResults rows={ev.rows} summary={ev.summary} progress={ev.progress} error={ev.error} /> : <p className="text-muted-foreground text-sm">Not run yet.</p>}</CardContent>
            <CardFooter className="justify-between gap-2">
              <Button onClick={() => ev.run(patch)} disabled={ev.running || !info.data?.evaluation.cases}><FlaskConical /> {ev.running ? "Evaluating…" : "Evaluate"}</Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" disabled={!isAdmin}><RotateCcw /> Reset to defaults</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset every threshold?</AlertDialogTitle>
                    <AlertDialogDescription>The service goes back to the built-in defaults for all new validations.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => reset.mutate(undefined, { onSuccess: (r) => setDraft(r.current) })}>Reset</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardFooter>
          </Card>
        </>
      )}
    </div>
  )
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <div className="text-muted-foreground text-[11px] uppercase">{k}</div>
      <div className="truncate font-medium" title={v}>{v}</div>
    </div>
  )
}
