import * as React from "react"
import { useSearchParams } from "react-router-dom"
import { Play, Square, Upload, FileJson, ListTree, Timer, Copy } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardAction } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { CardPreview } from "@/components/card-preview"
import { DecisionBadge } from "@/components/status"
import { FlowStrip, StepTimeline } from "@/components/pipeline-trace"
import { useRunner } from "@/lib/runner"
import { useStore } from "@/store"
import { SAMPLE_CASES, buildSample, type SampleCase } from "@/engine/samples"
import { cn } from "@/lib/utils"

const SPEEDS = [
  { v: "900", l: "Slow (walk-through)" },
  { v: "450", l: "Normal" },
  { v: "150", l: "Fast" },
  { v: "0", l: "Instant" },
]

export default function ValidatePage() {
  const store = useStore()
  const [params] = useSearchParams()
  const { trace, running, run, inputUrl, stop } = useRunner()
  const [selected, setSelected] = React.useState<string | null>(null)
  const [pinned, setPinned] = React.useState(false)
  const [sample, setSample] = React.useState<SampleCase | null>(() => SAMPLE_CASES.find((s) => s.id === params.get("sample")) ?? null)
  const [upload, setUpload] = React.useState<{ file: File; dataUrl: string } | null>(null)
  const [manual, setManual] = React.useState("")
  const [tab, setTab] = React.useState<"samples" | "upload">("samples")
  const [speed, setSpeed] = React.useState(String(store.settings.step_delay_ms))

  const thumbs = React.useMemo(() => {
    const m: Record<string, string> = {}
    for (const c of SAMPLE_CASES) {
      const s = buildSample(c, store.families)
      if (s) {
        const t = document.createElement("canvas")
        t.width = 253
        t.height = 160
        t.getContext("2d")!.drawImage(s.canvas, 0, 0, 253, 160)
        m[c.id] = t.toDataURL("image/jpeg", 0.8)
      }
    }
    return m
  }, [store.families])

  // follow the live step unless the operator pinned one
  React.useEffect(() => {
    if (pinned) return
    const live = [...trace.steps].reverse().find((s) => s.status !== "pending" && s.status !== "skip" && s.detail)
    const firstBad = trace.result ? trace.steps.find((s) => (s.status === "fail" || s.status === "warn") && s.detail && s.id !== "decision") : null
    setSelected((firstBad ?? live)?.id ?? null)
  }, [trace, pinned])

  const start = async () => {
    setPinned(false)
    if (store.indexing) return toast.info("Registry is re-indexing, try again in a moment")
    const delay = +speed
    if (tab === "samples") {
      if (!sample) return toast.error("Pick a sample card first")
      await run({ kind: "sample", sample }, { delay })
    } else {
      if (!upload) return toast.error("Upload a card photo first")
      await run({ kind: "upload", ...upload, manualText: manual }, { delay })
    }
  }

  const autoStarted = React.useRef(false)
  React.useEffect(() => {
    if (autoStarted.current || store.indexing || !store.index.length) return
    if (sample && params.get("sample")) {
      autoStarted.current = true
      start()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.indexing, store.index])

  const onFile = (f: File | undefined) => {
    if (!f) return
    const fr = new FileReader()
    fr.onload = () => setUpload({ file: f, dataUrl: fr.result as string })
    fr.readAsDataURL(f)
  }

  const fieldsStep = trace.steps.find((s) => s.id === "fields")
  const rois = fieldsStep?.detail?.fields?.map((f: { name: string; roi: number[]; ok: boolean }) => ({ name: f.name, roi: f.roi, ok: f.ok }))
  const res = trace.result
  const err = (trace as { error?: string }).error
  const totalMs = trace.steps.reduce((a, s) => a + s.ms, 0)

  return (
    <div className="mx-auto grid max-w-[1400px] gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Card input</CardTitle>
            <CardDescription>Choose a labelled test photo or upload your own.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={(v) => setTab(v as "samples" | "upload")}>
              <TabsList className="w-full">
                <TabsTrigger value="samples">Labelled samples</TabsTrigger>
                <TabsTrigger value="upload">Upload photo</TabsTrigger>
              </TabsList>
              <TabsContent value="samples" className="mt-3">
                <ScrollArea className="h-[300px] pr-3">
                  <div className="grid grid-cols-2 gap-2">
                    {SAMPLE_CASES.filter((c) => thumbs[c.id]).map((c) => (
                      <button key={c.id} onClick={() => setSample(c)} className={cn("group rounded-lg border p-1.5 text-left transition-colors hover:bg-accent", sample?.id === c.id && "border-foreground/40 bg-accent ring-ring/40 ring-2")}>
                        <img src={thumbs[c.id]} className="aspect-[1012/638] w-full rounded-md object-cover" />
                        <div className="mt-1.5 flex items-start justify-between gap-1">
                          <span className="line-clamp-2 text-[11px] leading-tight font-medium">{c.label}</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between">
                          <span className="text-muted-foreground line-clamp-1 text-[10px]">{c.note}</span>
                        </div>
                        <div className="mt-1"><span className="text-muted-foreground text-[10px]">expect </span><DecisionBadge status={c.expected} className="h-4 px-1 text-[9px]" /></div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="upload" className="mt-3 space-y-3">
                <label
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    onFile(e.dataTransfer.files[0])
                  }}
                  className="hover:bg-accent/50 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center"
                >
                  {upload ? <img src={upload.dataUrl} className="max-h-36 rounded-md" /> : <Upload className="text-muted-foreground size-6" />}
                  <span className="text-sm font-medium">{upload ? upload.file.name : "Drop a card photo or click to browse"}</span>
                  <span className="text-muted-foreground text-xs">JPG / PNG · stays in your browser</span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
                </label>
                {store.settings.mode === "browser" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="manual" className="text-xs">Printed text (optional, one line per item)</Label>
                    <Textarea id="manual" value={manual} onChange={(e) => setManual(e.target.value)} rows={4} placeholder={"FAZAA\nGOLD\n2210457783\nFATIMA SAEED\nEXP 11/27"} className="font-mono text-xs" />
                    <p className="text-muted-foreground text-[11px]">The browser engine has no OCR. Type what is printed, or switch to API mode in Settings to use the service's Tesseract OCR.</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
            <div className="mt-4 flex items-center gap-2">
              {running ? (
                <Button variant="outline" onClick={stop} className="flex-1"><Square /> Stop</Button>
              ) : (
                <Button onClick={start} className="flex-1" disabled={store.indexing}><Play /> Run validation</Button>
              )}
              <Select value={speed} onValueChange={setSpeed}>
                <SelectTrigger className="w-[150px]"><Timer /><SelectValue /></SelectTrigger>
                <SelectContent>{SPEEDS.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Normalised card</CardTitle>
            <CardDescription>{trace.normalisedUrl ? "1012×638, field ROIs from the variant template" : "Raw input"}</CardDescription>
          </CardHeader>
          <CardContent>
            <CardPreview src={trace.normalisedUrl ?? inputUrl} rois={rois} scanning={running && !!trace.steps.find((s) => s.status === "running" && ["ocr", "embed", "search"].includes(s.id))} />
          </CardContent>
        </Card>
      </div>

      <div className="min-w-0 space-y-4">
        <Card className={cn(res && (res.status === "ACCEPT" ? "border-accept/40" : res.status === "REVIEW" ? "border-review/50" : "border-reject/40"))}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Pipeline {running && <Badge variant="outline" className="text-chart-4 animate-pulse">live</Badge>}
            </CardTitle>
            <CardDescription>Family → Variant → Fields → Rules, step by step. Click any step for its evidence.</CardDescription>
            {res && (
              <CardAction className="flex items-center gap-2">
                <span className="text-muted-foreground tabular text-xs">{totalMs} ms compute</span>
                <DecisionBadge status={res.status} className="h-7 px-3 text-sm" />
              </CardAction>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <FlowStrip steps={trace.steps} selected={selected} onSelect={(id) => { setPinned(true); setSelected(id) }} />
            {err && (
              <Alert variant="destructive">
                <AlertTitle>Run failed</AlertTitle>
                <AlertDescription>{err}</AlertDescription>
              </Alert>
            )}
            {res && (
              <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-4">
                <Kv k="Family" v={res.card.family_name ?? "—"} sub={res.card.family ? `confidence ${res.card.family_confidence}` : undefined} />
                <Kv k="Variant" v={res.card.variant_name ?? "—"} sub={res.card.variant ? `confidence ${res.card.variant_confidence}` : undefined} />
                <Kv k="Card number" v={maskNum(res.fields.card_number?.value)} sub="PII-masked" />
                <Kv k="Reasons" v={res.reasons.length ? res.reasons.join(", ") : "none"} mono />
              </div>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="steps">
          <TabsList>
            <TabsTrigger value="steps"><ListTree /> Steps</TabsTrigger>
            <TabsTrigger value="json" disabled={!res}><FileJson /> JSON output</TabsTrigger>
          </TabsList>
          <TabsContent value="steps" className="mt-3">
            <StepTimeline steps={trace.steps} selected={selected} setSelected={(id) => { setPinned(true); setSelected(id) }} />
          </TabsContent>
          <TabsContent value="json" className="mt-3">
            {res && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Result envelope · schema_version {res.schema_version}</CardTitle>
                  <CardAction>
                    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(JSON.stringify(res, null, 2)); toast.success("Copied") }}><Copy /> Copy</Button>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <pre className="bg-muted/50 max-h-[560px] overflow-auto rounded-md p-3 font-mono text-[11.5px] leading-relaxed">{JSON.stringify(res, null, 2)}</pre>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

function maskNum(v?: string | null) {
  if (!v) return "—"
  return v.length > 4 ? "•••• " + v.slice(-4) : v
}

function Kv({ k, v, sub, mono }: { k: string; v: string; sub?: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-muted-foreground text-[11px] uppercase tracking-wide">{k}</div>
      <div className={cn("truncate text-sm font-medium", mono && "font-mono text-xs")} title={v}>{v}</div>
      {sub && <div className="text-muted-foreground text-[11px]">{sub}</div>}
    </div>
  )
}
