import * as React from "react"
import { FlaskConical, PlugZap, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { useStore } from "@/store"
import { DEFAULT_SETTINGS, runPipeline, type Settings, type TraceUpdate } from "@/engine/pipeline"
import { buildSample, SAMPLE_CASES } from "@/engine/samples"
import { apiPing } from "@/engine/api"

function Num({ label, hint, k, min, max, step }: { label: string; hint?: string; k: keyof Settings; min: number; max: number; step: number }) {
  const { settings, setSettings } = useStore()
  const v = settings[k] as number
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="tabular text-sm font-medium">{v}{(DEFAULT_SETTINGS[k] as number) !== v && <span className="text-muted-foreground ml-1 text-xs">(default {DEFAULT_SETTINGS[k] as number})</span>}</span>
      </div>
      <Slider value={[v]} min={min} max={max} step={step} onValueChange={([x]) => setSettings({ [k]: +x.toFixed(3) } as Partial<Settings>)} />
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  )
}

export default function SettingsPage() {
  const store = useStore()
  const { settings, setSettings } = store
  const [ping, setPing] = React.useState<string | null>(null)
  const [whatIf, setWhatIf] = React.useState<{ correct: number; total: number; wrongAccept: number; accept: number; rows: { label: string; exp: string; got: string }[] } | null>(null)
  const [busy, setBusy] = React.useState(false)

  const evaluate = async () => {
    setBusy(true)
    const rows: { label: string; exp: string; got: string }[] = []
    for (const c of SAMPLE_CASES) {
      const s = buildSample(c, store.families)
      if (!s) continue
      let last: TraceUpdate | null = null
      for await (const u of runPipeline({ request_id: "whatif", image: s.canvas, printed: s.tokens, fx: c.fx, origW: 1012, origH: 638, sourceLabel: "what-if" }, { families: store.families, index: store.index, settings: { ...settings, step_delay_ms: 0 }, registryVersion: store.version })) last = u
      rows.push({ label: c.label, exp: c.expected, got: last!.result!.status })
    }
    setWhatIf({ rows, total: rows.length, correct: rows.filter((r) => r.exp === r.got).length, wrongAccept: rows.filter((r) => r.got === "ACCEPT" && r.exp !== "ACCEPT").length, accept: rows.filter((r) => r.got === "ACCEPT").length })
    setBusy(false)
  }

  return (
    <div className="mx-auto grid max-w-[1300px] gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Engine</CardTitle>
          <CardDescription>Run the pipeline in this browser (demo, simulated OCR) or call the on-prem card-agent FastAPI service. Images never go to a public API either way.</CardDescription>
        </CardHeader>
        <CardContent className="grid items-end gap-4 md:grid-cols-[auto_1fr_auto]">
          <ToggleGroup type="single" variant="outline" value={settings.mode} onValueChange={(v) => v && setSettings({ mode: v as Settings["mode"] })}>
            <ToggleGroupItem value="browser" className="px-4">Browser engine</ToggleGroupItem>
            <ToggleGroupItem value="api" className="px-4">card-agent API</ToggleGroupItem>
          </ToggleGroup>
          <div className="space-y-1.5">
            <Label htmlFor="api">API base URL</Label>
            <Input id="api" value={settings.api_base} onChange={(e) => setSettings({ api_base: e.target.value })} className="font-mono" placeholder="http://card-agent.internal:8080/v1" />
          </div>
          <Button variant="outline" onClick={async () => { const r = await apiPing(settings.api_base); setPing(r.detail); r.ok ? toast.success(r.detail) : toast.error("Service not reachable", { description: r.detail }) }}>
            <PlugZap /> Test connection
          </Button>
          {ping && <p className="text-muted-foreground text-xs md:col-span-3">Last check: {ping}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Family decision</CardTitle>
          <CardDescription>Needs top-1 ≥ τ <b>and</b> top-1 − top-2 ≥ δ. Raising them trades automation for safety.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Num label="τ family (min score)" k="tau_family" min={0.2} max={0.95} step={0.01} />
          <Num label="δ family (min margin)" k="delta_family" min={0} max={0.5} step={0.01} hint="Prevents confident wrong answers between look-alike cards." />
          <div className="space-y-2">
            <Label>Below τ and no reference match</Label>
            <Select value={settings.unknown_action} onValueChange={(v) => setSettings({ unknown_action: v as Settings["unknown_action"] })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="REJECT">REJECT as unknown card</SelectItem>
                <SelectItem value="REVIEW">Send to human REVIEW</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">Below τ but visually matching an enrolled card always goes to REVIEW.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Variant decision</CardTitle>
          <CardDescription>Only the chosen family's variants are compared.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Num label="τ variant" k="tau_variant" min={0.2} max={0.95} step={0.01} />
          <Num label="δ variant" k="delta_variant" min={0} max={0.5} step={0.01} />
          <div className="grid grid-cols-3 gap-3">
            {(["colour", "keyword", "prefix"] as const).map((k) => (
              <div key={k} className="space-y-1.5">
                <Label className="text-xs">w_{k}</Label>
                <Input type="number" step={0.05} min={0} max={1} value={settings.variant_weights[k]} onChange={(e) => setSettings({ variant_weights: { ...settings.variant_weights, [k]: +e.target.value } })} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quality gate</CardTitle>
          <CardDescription>Fails fast with RETAKE_REQUIRED so the capture app can prompt again.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Num label="Min sharpness (Laplacian variance)" k="min_blur" min={0} max={400} step={5} />
          <Num label="Min brightness" k="min_brightness" min={0} max={0.5} step={0.01} />
          <Num label="Max brightness" k="max_brightness" min={0.5} max={1} step={0.01} />
          <Num label="Max glare ratio" k="max_glare" min={0} max={0.4} step={0.01} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reference search &amp; fallbacks</CardTitle>
          <CardDescription>Cosine similarity is mapped to S_visual = (sim − floor) / (ceiling − floor).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Num label="Match floor" k="sim_floor" min={0.2} max={0.95} step={0.01} hint="Below this, the search reports “not matching”." />
          <Num label="Similarity ceiling" k="sim_ceiling" min={0.8} max={1} step={0.005} />
          <Num label="Top-k shown" k="top_k" min={1} max={10} step={1} />
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>Local VLM fallback</Label>
              <p className="text-muted-foreground text-xs">Qwen2.5-VL on vLLM/Ollama, for required fields the ROI OCR missed. Output is re-validated.</p>
            </div>
            <Switch checked={settings.vlm_enabled} onCheckedChange={(c) => setSettings({ vlm_enabled: c })} />
          </div>
          <Num label="Default step animation (ms)" k="step_delay_ms" min={0} max={1200} step={50} />
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>What-if: evaluate these thresholds</CardTitle>
          <CardDescription>Runs every labelled sample with the current settings (not saved to the dashboard).</CardDescription>
        </CardHeader>
        <CardContent>
          {whatIf ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-6 text-sm">
                <span>Correct decisions <b className="tabular">{whatIf.correct}/{whatIf.total}</b></span>
                <span className={whatIf.wrongAccept ? "text-reject" : ""}>Wrong ACCEPTs <b className="tabular">{whatIf.wrongAccept}</b></span>
                <span>Auto-accept <b className="tabular">{Math.round((whatIf.accept / whatIf.total) * 100)}%</b></span>
              </div>
              <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {whatIf.rows.map((r) => (
                  <div key={r.label} className={`flex justify-between rounded border px-2 py-1 text-xs ${r.exp === r.got ? "" : "border-reject/50 bg-reject/8"}`}>
                    <span className="truncate">{r.label}</span>
                    <span className="font-mono">{r.exp === r.got ? r.got : `${r.exp}→${r.got}`}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Not run yet.</p>
          )}
        </CardContent>
        <CardFooter className="justify-between gap-2">
          <Button onClick={evaluate} disabled={busy || store.indexing}><FlaskConical /> {busy ? "Evaluating…" : "Evaluate"}</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setSettings(DEFAULT_SETTINGS); toast.success("Thresholds reset to MVP defaults") }}><RotateCcw /> Reset thresholds</Button>
            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="outline" className="text-reject">Reset all demo data</Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset the console?</AlertDialogTitle>
                  <AlertDialogDescription>Restores the Fazaa and Esaad YAML from the MVP, removes uploaded references, clears run history and settings.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => { store.resetDemo(); toast.success("Console reset") }}>Reset</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}
