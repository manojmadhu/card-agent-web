import * as React from "react"
import { Link } from "react-router-dom"
import { Camera, Copy, ExternalLink, FileJson, ListTree, Play, Square, Upload, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { CardPreview } from "@/components/card-preview"
import { DecisionBadge } from "@/components/status"
import { FlowStrip, StepTimeline } from "@/components/pipeline-trace"
import { AuthImage, evalImagePath, runImagePath } from "@/components/auth-image"
import { fieldRois } from "@/components/run-sheet"
import { useValidation } from "@/hooks/use-validation"
import { useEvalCases } from "@/api/hooks"
import { fetchBlob } from "@/api/client"
import type { EvalCase } from "@/api/types"
import { cn } from "@/lib/utils"

const MAX_BYTES = 8 * 1024 * 1024

type Input_ = { kind: "file"; file: File; url: string } | { kind: "case"; case: EvalCase }

export default function ValidatePage() {
  const v = useValidation()
  const cases = useEvalCases()
  const [input, setInput] = React.useState<Input_ | null>(null)
  const [tab, setTab] = React.useState<"upload" | "test">("upload")
  const [requestId, setRequestId] = React.useState("")
  const [selected, setSelected] = React.useState<string | null>(null)
  const [pinned, setPinned] = React.useState(false)
  const [preview, setPreview] = React.useState<string | null>(null)

  // revoke object URLs we create for local previews
  React.useEffect(() => () => { if (input?.kind === "file") URL.revokeObjectURL(input.url) }, [input])

  const { reset } = v
  const onFile = React.useCallback((f: File | undefined | null) => {
    if (!f) return
    if (!/^image\/(png|jpe?g)$/.test(f.type)) return toast.error("Only JPEG or PNG photos are accepted")
    if (f.size > MAX_BYTES) return toast.error("Photo is larger than 8 MB")
    setInput({ kind: "file", file: f, url: URL.createObjectURL(f) })
    setTab("upload")
    reset()
  }, [reset])

  // paste a photo from the clipboard anywhere on the page
  React.useEffect(() => {
    const h = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"))
      if (item) onFile(item.getAsFile())
    }
    window.addEventListener("paste", h)
    return () => window.removeEventListener("paste", h)
  }, [onFile])

  // follow the live stage unless the operator pinned one; afterwards jump to the first problem
  React.useEffect(() => {
    if (pinned) return
    const live = [...v.steps].reverse().find((s) => s.status !== "pending" && s.status !== "skip")
    const firstBad = v.result ? v.steps.find((s) => (s.status === "fail" || s.status === "warn") && s.id !== "decision") : null
    setSelected((firstBad ?? live)?.id ?? null)
  }, [v.steps, v.result, pinned])

  React.useEffect(() => {
    if (input?.kind !== "case") return setPreview(null)
    let live = true
    let url: string | null = null
    fetchBlob(evalImagePath(input.case.file, 1000)).then((b) => {
      if (!live) return
      url = URL.createObjectURL(b)
      setPreview(url)
    }, () => {})
    return () => {
      live = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [input])

  const start = async () => {
    setPinned(false)
    if (!input) return toast.error(tab === "upload" ? "Choose or drop a card photo first" : "Pick a labelled test image first")
    try {
      const blob = input.kind === "file" ? input.file : await fetchBlob(evalImagePath(input.case.file))
      const label = input.kind === "file" ? input.file.name : `test: ${input.case.file}`
      await v.start(blob, { label, requestId: requestId.trim() || undefined })
    } catch (e) {
      toast.error("Could not start the validation", { description: (e as Error).message })
    }
  }

  const res = v.result
  const localUrl = input?.kind === "file" ? input.url : preview
  const ocrRunning = v.running && v.steps.some((s) => s.status === "running" && ["normalise", "ocr", "family", "variant", "fields"].includes(s.id))
  const totalMs = v.steps.reduce((a, s) => a + (s.status === "running" ? 0 : s.ms), 0)

  return (
    <div className="mx-auto grid max-w-[1400px] gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Card photo</CardTitle>
            <CardDescription>Sent to the card-agent service; every stage streams back live.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={(x) => setTab(x as "upload" | "test")}>
              <TabsList className="w-full">
                <TabsTrigger value="upload">Upload / camera</TabsTrigger>
                <TabsTrigger value="test">Labelled test set</TabsTrigger>
              </TabsList>
              <TabsContent value="upload" className="mt-3 space-y-3">
                <label
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    onFile(e.dataTransfer.files[0])
                  }}
                  className="hover:bg-accent/50 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center"
                >
                  {input?.kind === "file" ? <img src={input.url} className="max-h-36 rounded-md" alt="selected card" /> : <Upload className="text-muted-foreground size-6" />}
                  <span className="text-sm font-medium">{input?.kind === "file" ? input.file.name : "Drop a card photo, paste it, or click to browse"}</span>
                  <span className="text-muted-foreground text-xs">JPEG / PNG up to 8 MB</span>
                  <input type="file" accept="image/jpeg,image/png" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = "" }} />
                </label>
                <Button variant="outline" className="w-full" asChild>
                  <label className="cursor-pointer">
                    <Camera /> Take a photo
                    <input type="file" accept="image/jpeg,image/png" capture="environment" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = "" }} />
                  </label>
                </Button>
              </TabsContent>
              <TabsContent value="test" className="mt-3">
                {cases.isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
                {cases.data && cases.data.length === 0 && <p className="text-muted-foreground text-sm">The service has no labelled set (CARD_AGENT_EVAL_DIR/manifest.json).</p>}
                <ScrollArea className="h-[320px] pr-3">
                  <div className="grid grid-cols-2 gap-2">
                    {cases.data?.map((c) => (
                      <button
                        type="button"
                        key={c.file}
                        onClick={() => { setInput({ kind: "case", case: c }); v.reset() }}
                        className={cn("hover:bg-accent rounded-lg border p-1.5 text-left transition-colors", input?.kind === "case" && input.case.file === c.file && "border-foreground/40 bg-accent ring-ring/40 ring-2")}
                      >
                        <AuthImage path={evalImagePath(c.file, 320)} className="aspect-[4/3] w-full rounded-md object-cover" />
                        <div className="mt-1.5 truncate text-[11px] font-medium">{c.file}</div>
                        <div className="mt-1 flex items-center gap-1"><span className="text-muted-foreground text-[10px]">expected</span><DecisionBadge status={c.expected_status} className="h-4 px-1 text-[9px]" /></div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="rid" className="text-xs">Request id (optional)</Label>
              <Input id="rid" value={requestId} onChange={(e) => setRequestId(e.target.value)} placeholder="generated by the service if empty" className="h-8 font-mono text-xs" maxLength={120} />
            </div>
            <div className="mt-4 flex items-center gap-2">
              {v.running ? (
                <Button variant="outline" onClick={v.stop} className="flex-1"><Square /> Stop watching</Button>
              ) : (
                <Button onClick={start} className="flex-1" disabled={!input}><Play /> Validate</Button>
              )}
              {input && !v.running && (
                <Button variant="ghost" size="icon" onClick={() => { setInput(null); v.reset() }} aria-label="Clear"><X /></Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{v.run?.has_card ? "Normalised card" : "Input"}</CardTitle>
            <CardDescription>{v.run?.has_card ? "1012×638 as the agent saw it, with the variant's field ROIs" : "The photo being validated"}</CardDescription>
          </CardHeader>
          <CardContent>
            <CardPreview
              src={v.run?.has_card ? null : localUrl}
              path={v.run?.has_card ? runImagePath(v.run.id, "card", 1012) : null}
              rois={v.run?.has_card ? fieldRois(v.steps) : undefined}
              fit={v.run?.has_card ? "cover" : "contain"}
              scanning={ocrRunning}
            />
          </CardContent>
        </Card>
      </div>

      <div className="min-w-0 space-y-4">
        <Card className={cn(res && (res.status === "ACCEPT" ? "border-accept/40" : res.status === "REVIEW" ? "border-review/50" : "border-reject/40"))}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Pipeline {v.running && <Badge variant="outline" className="text-chart-4 animate-pulse">live</Badge>}
            </CardTitle>
            <CardDescription>Quality → Family → Variant → Fields → Rules → Decision. Click a step for its evidence.</CardDescription>
            {res && (
              <CardAction className="flex items-center gap-2">
                <span className="text-muted-foreground tabular text-xs">{res.processing_ms || totalMs} ms</span>
                <DecisionBadge status={res.status} className="h-7 px-3 text-sm" />
              </CardAction>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <FlowStrip steps={v.steps} selected={selected} onSelect={(id) => { setPinned(true); setSelected(id) }} />
            {v.error && (
              <Alert variant="destructive">
                <AlertTitle>Validation failed</AlertTitle>
                <AlertDescription>{v.error}</AlertDescription>
              </Alert>
            )}
            {res && (
              <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-4">
                <Kv k="Family" v={res.card?.family_name ?? "—"} sub={res.card ? `confidence ${res.card.family_confidence}` : undefined} />
                <Kv k="Variant" v={res.card?.variant_name ?? "—"} sub={res.card ? `confidence ${res.card.variant_confidence}` : undefined} />
                <Kv k="Card number" v={maskNum(res.fields.card_number?.value)} sub="masked" />
                <Kv k="Reasons" v={res.reasons.length ? res.reasons.join(", ") : "none"} mono />
              </div>
            )}
            {v.run && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">Stored as run <span className="font-mono">{v.run.id}</span></span>
                <Button size="sm" variant="outline" className="h-7" asChild>
                  <Link to={`/runs?run=${v.run.id}`}><ExternalLink /> {res?.status === "REVIEW" ? "Review this run" : "Open run"}</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="steps">
          <TabsList>
            <TabsTrigger value="steps"><ListTree /> Steps</TabsTrigger>
            <TabsTrigger value="json" disabled={!res}><FileJson /> Result JSON</TabsTrigger>
          </TabsList>
          <TabsContent value="steps" className="mt-3">
            <StepTimeline steps={v.steps} selected={selected} setSelected={(id) => { setPinned(true); setSelected(id) }} />
          </TabsContent>
          <TabsContent value="json" className="mt-3">
            {res && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Result envelope · schema_version {res.schema_version}</CardTitle>
                  <CardDescription>Exactly what the capture system receives from POST /v1/cards/validate.</CardDescription>
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
      <div className="text-muted-foreground text-[11px] tracking-wide uppercase">{k}</div>
      <div className={cn("truncate text-sm font-medium", mono && "font-mono text-xs")} title={v}>{v}</div>
      {sub && <div className="text-muted-foreground text-[11px]">{sub}</div>}
    </div>
  )
}
