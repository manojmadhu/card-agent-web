import * as React from "react"
import { Link } from "react-router-dom"
import { ClipboardPaste, FileJson, Files, ListTree, Loader2, Play, RotateCcw, Square, Upload, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CopyButton, DecisionBadge, JsonBlock, PageHeader } from "@/components/common"
import { FlowStrip, StepTimeline } from "@/components/pipeline"
import { CardOverlay } from "@/components/card-overlay"
import { DecisionHeadline, ResultDetails, ResultSummary } from "@/components/result-view"
import { newRequestId, useValidationStream } from "@/lib/use-validation-stream"
import { api } from "@/api/endpoints"
import type { ValidationResult } from "@/api/types"
import { useConnection } from "@/auth/connection"
import { useQueryClient } from "@tanstack/react-query"
import { ms, reasonLabel } from "@/lib/format"
import { cn } from "@/lib/utils"

const ACCEPT = "image/jpeg,image/png,image/webp"
const MAX = 8_000_000

function checkFile(f: File): string | null {
  if (!ACCEPT.split(",").includes(f.type)) return `${f.name}: ${f.type || "unknown type"} is not accepted (JPEG, PNG or WebP)`
  if (f.size > MAX) return `${f.name}: larger than 8 MB`
  return null
}

export default function ValidatePage() {
  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeader title="Validate a card" description="Run a photo through the live pipeline and watch every stage decide — or validate a batch of photos in one go." />
      <Tabs defaultValue="single">
        <TabsList>
          <TabsTrigger value="single"><ListTree /> Live, step by step</TabsTrigger>
          <TabsTrigger value="batch"><Files /> Batch</TabsTrigger>
        </TabsList>
        <TabsContent value="single" className="mt-4">
          <SingleValidate />
        </TabsContent>
        <TabsContent value="batch" className="mt-4">
          <BatchValidate />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function SingleValidate() {
  const s = useValidationStream()
  const qc = useQueryClient()
  const [file, setFile] = React.useState<File | null>(null)
  const [preview, setPreview] = React.useState<string | null>(null)
  const [requestId, setRequestId] = React.useState(newRequestId)
  const [store, setStore] = React.useState(true)
  const [selected, setSelected] = React.useState<string | null>(null)
  const [pinned, setPinned] = React.useState(false)
  const [drag, setDrag] = React.useState(false)

  const pick = (f?: File | null) => {
    if (!f) return
    const err = checkFile(f)
    if (err) return toast.error(err)
    setFile(f)
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old)
      return URL.createObjectURL(f)
    })
    s.reset()
    setRequestId(newRequestId())
  }

  // paste a photo from the clipboard anywhere on the page
  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"))
      const f = item?.getAsFile()
      if (f) pick(new File([f], `pasted.${f.type.split("/")[1]}`, { type: f.type }))
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // follow the live step until the operator picks one
  React.useEffect(() => {
    if (pinned) return
    const bad = s.result ? s.steps.find((x) => (x.status === "fail" || x.status === "warn") && x.detail && x.id !== "decision") : null
    const live = [...s.steps].reverse().find((x) => !["pending", "skip"].includes(x.status) && x.detail)
    setSelected((bad ?? live)?.id ?? null)
  }, [s.steps, s.result, pinned])

  React.useEffect(() => {
    if (s.result) {
      qc.invalidateQueries({ queryKey: ["runs"] })
      qc.invalidateQueries({ queryKey: ["review"] })
      qc.invalidateQueries({ queryKey: ["stats"] })
    }
  }, [s.result, qc])

  const run = () => {
    if (!file) return toast.error("Choose a card photo first")
    setPinned(false)
    s.start(file, file.name, { requestId: requestId.trim() || undefined, store })
  }

  const fields = s.steps.find((x) => x.id === "fields")?.detail?.fields as { name: string; roi: number[]; ok: boolean }[] | undefined
  const r = s.result

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Card photo</CardTitle>
            <CardDescription>JPEG, PNG or WebP up to 8 MB. Drop, browse or paste (Ctrl V).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label
              onDragOver={(e) => {
                e.preventDefault()
                setDrag(true)
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDrag(false)
                pick(e.dataTransfer.files[0])
              }}
              className={cn("hover:bg-accent/50 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-center transition-colors", drag && "border-chart-4 bg-chart-4/5")}
            >
              {preview ? <img src={preview} className="max-h-44 rounded-md" alt="selected photo" /> : <Upload className="text-muted-foreground size-6" />}
              <span className="text-sm font-medium">{file ? file.name : "Drop a card photo or click to browse"}</span>
              <span className="text-muted-foreground text-xs">{file ? `${(file.size / 1024).toFixed(0)} KB · ${file.type}` : <><ClipboardPaste className="inline size-3" /> or paste from the clipboard</>}</span>
              <input type="file" accept={ACCEPT} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
            </label>
            <div className="space-y-1.5">
              <Label htmlFor="rid" className="text-xs">Request id (idempotency key)</Label>
              <div className="flex gap-2">
                <Input id="rid" value={requestId} onChange={(e) => setRequestId(e.target.value)} className="font-mono text-xs" />
                <Button variant="outline" size="icon" onClick={() => setRequestId(newRequestId())} aria-label="new request id">
                  <RotateCcw />
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="store" className="text-sm">Record in run history</Label>
                <p className="text-muted-foreground text-xs">Off = test only (<span className="font-mono">?store=false</span>): no history, no review queue.</p>
              </div>
              <Switch id="store" checked={store} onCheckedChange={setStore} />
            </div>
            {s.running ? (
              <Button variant="outline" className="w-full" onClick={s.cancel}>
                <Square /> Cancel
              </Button>
            ) : (
              <Button className="w-full" onClick={run} disabled={!file}>
                <Play /> Validate
              </Button>
            )}
          </CardContent>
        </Card>
        <Card className="gap-3">
          <CardHeader>
            <CardTitle className="text-sm">{s.normalisedUrl ? "Straightened card" : "Input"}</CardTitle>
            <CardDescription>{s.normalisedUrl ? "As the agent sees it, with the field regions it read" : "The photo you selected"}</CardDescription>
          </CardHeader>
          <CardContent>
            <CardOverlay src={s.normalisedUrl ?? preview} rois={s.normalisedUrl ? fields?.map((f) => ({ name: f.name, roi: f.roi, ok: f.ok })) : undefined} scanning={s.running} />
          </CardContent>
        </Card>
      </div>

      <div className="min-w-0 space-y-4">
        <Card className={cn(r && (r.status === "ACCEPT" ? "border-accept/40" : r.status === "REVIEW" ? "border-review/50" : "border-reject/40"))}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Pipeline {s.running && <Badge variant="outline" className="text-chart-4 animate-pulse">live</Badge>}
            </CardTitle>
            <CardDescription>Server-sent events from <span className="font-mono">/v1/cards/validate/stream</span>. Click a stage for its evidence.</CardDescription>
            {r && (
              <CardAction className="text-muted-foreground tabular text-xs">
                server {ms(r.processing_ms)} · end-to-end {ms(s.elapsedMs)}
              </CardAction>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <FlowStrip steps={s.steps} selected={selected} onSelect={(id) => { setPinned(true); setSelected(id) }} />
            {s.error && (
              <Alert variant="destructive">
                <AlertTitle>Validation did not complete</AlertTitle>
                <AlertDescription>{s.error}</AlertDescription>
              </Alert>
            )}
            {r && (
              <>
                <DecisionHeadline r={r} />
                <ResultSummary r={r} />
              </>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="steps">
          <TabsList>
            <TabsTrigger value="steps"><ListTree /> Stages</TabsTrigger>
            <TabsTrigger value="result" disabled={!r}>Result</TabsTrigger>
            <TabsTrigger value="json" disabled={!r}><FileJson /> JSON</TabsTrigger>
          </TabsList>
          <TabsContent value="steps" className="mt-3">
            <StepTimeline steps={s.steps} selected={selected} setSelected={(id) => { setPinned(true); setSelected(id) }} />
          </TabsContent>
          <TabsContent value="result" className="mt-3">{r && <ResultDetails r={r} />}</TabsContent>
          <TabsContent value="json" className="mt-3">
            {r && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Response · schema {r.schema_version}</CardTitle>
                  <CardAction><CopyButton text={JSON.stringify(r, null, 2)} /></CardAction>
                </CardHeader>
                <CardContent><JsonBlock value={r} /></CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

interface BatchRow {
  file: File
  state: "queued" | "running" | "done" | "error"
  result?: ValidationResult
  error?: string
}

function BatchValidate() {
  const { isAdmin } = useConnection()
  const qc = useQueryClient()
  const [rows, setRows] = React.useState<BatchRow[]>([])
  const [store, setStore] = React.useState(true)
  const [running, setRunning] = React.useState(false)
  const stop = React.useRef(false)

  const add = (files: FileList | null) => {
    if (!files) return
    const ok: BatchRow[] = []
    for (const f of Array.from(files)) {
      const err = checkFile(f)
      if (err) toast.error(err)
      else ok.push({ file: f, state: "queued" })
    }
    setRows((r) => [...r, ...ok])
  }

  const runAll = async () => {
    stop.current = false
    setRunning(true)
    const queue = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.state !== "done")
    const worker = async () => {
      while (queue.length && !stop.current) {
        const { r, i } = queue.shift()!
        setRows((rs) => rs.map((x, j) => (j === i ? { ...x, state: "running" } : x)))
        try {
          const res = await api.validate(r.file, r.file.name, { requestId: `batch-${Date.now().toString(36)}-${i}`, store })
          setRows((rs) => rs.map((x, j) => (j === i ? { ...x, state: "done", result: res } : x)))
        } catch (e) {
          setRows((rs) => rs.map((x, j) => (j === i ? { ...x, state: "error", error: (e as Error).message } : x)))
        }
      }
    }
    await Promise.all([worker(), worker()]) // two in flight: keeps the server busy without flooding it
    setRunning(false)
    qc.invalidateQueries({ queryKey: ["runs"] })
    qc.invalidateQueries({ queryKey: ["stats"] })
    qc.invalidateQueries({ queryKey: ["review"] })
  }

  const done = rows.filter((r) => r.state === "done" || r.state === "error").length
  const counts = { ACCEPT: 0, REVIEW: 0, REJECT: 0 } as Record<string, number>
  rows.forEach((r) => r.result && counts[r.result.status]++)
  const csv = () =>
    ["file,status,family,variant,reasons,processing_ms,run_id", ...rows.map((r) => [r.file.name, r.result?.status ?? r.state, r.result?.card?.family ?? "", r.result?.card?.variant ?? "", (r.result?.reasons ?? []).join(" "), r.result?.processing_ms ?? "", r.result?.run_id ?? ""].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n")

  return (
    <Card>
      <CardHeader>
        <CardTitle>Batch validation</CardTitle>
        <CardDescription>Validates each photo with <span className="font-mono">POST /v1/cards/validate</span>, two at a time.</CardDescription>
        <CardAction className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-sm">
            <Switch id="bstore" checked={store} onCheckedChange={setStore} />
            <Label htmlFor="bstore">Record runs</Label>
          </div>
          <Button variant="outline" size="sm" asChild>
            <label className="cursor-pointer">
              <Upload /> Add photos
              <input type="file" accept={ACCEPT} multiple className="hidden" onChange={(e) => add(e.target.files)} />
            </label>
          </Button>
          {running ? (
            <Button size="sm" variant="outline" onClick={() => (stop.current = true)}><Square /> Stop</Button>
          ) : (
            <Button size="sm" onClick={runAll} disabled={!rows.some((r) => r.state !== "done")}><Play /> Validate {rows.filter((r) => r.state !== "done").length || ""}</Button>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Progress value={(done / rows.length) * 100} className="max-w-xs" />
            <span className="text-muted-foreground tabular">{done}/{rows.length}</span>
            {(["ACCEPT", "REVIEW", "REJECT"] as const).map((k) => (
              <span key={k} className="flex items-center gap-1"><DecisionBadge status={k} /> {counts[k]}</span>
            ))}
            <div className="ml-auto flex gap-2">
              <CopyButton text={csv()} label="Copy CSV" />
              <Button size="sm" variant="ghost" disabled={running} onClick={() => setRows([])}><X /> Clear</Button>
            </div>
          </div>
        )}
        {rows.length === 0 ? (
          <label className="hover:bg-accent/50 text-muted-foreground flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-sm" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files) }}>
            <Files className="size-6" /> Drop several card photos here, or click to choose
            <input type="file" accept={ACCEPT} multiple className="hidden" onChange={(e) => add(e.target.files)} />
          </label>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Photo</TableHead>
                <TableHead>Decision</TableHead>
                <TableHead>Programme / variant</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Time</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="max-w-48 truncate text-sm">{r.file.name}</TableCell>
                  <TableCell>
                    {r.result ? <DecisionBadge status={r.result.status} /> : r.state === "running" ? <Loader2 className="size-4 animate-spin" /> : r.state === "error" ? <span className="text-reject text-xs">{r.error}</span> : <span className="text-muted-foreground text-xs">queued</span>}
                  </TableCell>
                  <TableCell className="text-sm">{r.result?.card ? `${r.result.card.family_name} · ${r.result.card.variant_name ?? "—"}` : "—"}</TableCell>
                  <TableCell className="text-muted-foreground max-w-64 truncate text-xs">{r.result?.reasons.length ? reasonLabel(r.result.reasons[0]) : r.result ? "—" : ""}</TableCell>
                  <TableCell className="tabular text-right text-xs">{r.result ? ms(r.result.processing_ms) : ""}</TableCell>
                  <TableCell className="text-right">
                    {r.result?.run_id && isAdmin && (
                      <Button size="sm" variant="ghost" className="h-7" asChild>
                        <Link to={`/runs/${r.result.run_id}`}>Open</Link>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
