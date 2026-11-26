import * as React from "react"
import { Link } from "react-router-dom"
import { ArrowLeftRight, ClipboardPaste, FileJson, Files, ImagePlus, ListTree, Loader2, Play, RotateCcw, Square, Upload, X } from "lucide-react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
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
import { SideBadge } from "@/components/photos"
import { newRequestId, stageLabel, useValidationStream } from "@/lib/use-validation-stream"
import { pairFiles, type CardGroup } from "@/lib/pairing"
import { api, photoCount, type CardPhotos } from "@/api/endpoints"
import type { Side, ValidationResult } from "@/api/types"
import { useConnection } from "@/auth/connection"
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
      <PageHeader title="Validate a card" description="Run one card through the live pipeline — one photo, or its front and back — and watch every stage decide. Or validate a batch of photos in one go." />
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

/** How the photos of one card are sent. "one" is the original single-photo request (field `image`). */
type Mode = "one" | "sides" | "detect"
type SlotKey = "image" | "front" | "back" | "photo1" | "photo2"
const SLOTS: Record<Mode, { key: SlotKey; label: string; hint: string }[]> = {
  one: [{ key: "image", label: "Card photo", hint: "The agent works out which side it shows" }],
  sides: [
    { key: "front", label: "Front", hint: "Optional if the programme prints nothing needed there" },
    { key: "back", label: "Back", hint: "Optional for one-sided programmes" },
  ],
  detect: [
    { key: "photo1", label: "Photo 1", hint: "Either side" },
    { key: "photo2", label: "Photo 2", hint: "The other side" },
  ],
}

interface Slot {
  file: File
  url: string
}

function toPhotos(mode: Mode, slots: Partial<Record<SlotKey, Slot>>): CardPhotos {
  if (mode === "one") return { image: slots.image?.file }
  if (mode === "sides") return { front: slots.front?.file, back: slots.back?.file }
  return { images: [slots.photo1?.file, slots.photo2?.file].filter(Boolean) as File[] }
}

function PhotoSlot({ label, hint, slot, onPick, onClear, highlight, side }: { label: string; hint: string; slot?: Slot; onPick: (f?: File | null) => void; onClear: () => void; highlight?: boolean; side?: Side }) {
  const [drag, setDrag] = React.useState(false)
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex items-center gap-1.5 text-xs font-medium">
        {label} {side && <SideBadge side={side} />}
        {slot && (
          <button onClick={onClear} className="text-muted-foreground hover:text-reject ml-auto" aria-label={`remove ${label}`}>
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <label
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          onPick(e.dataTransfer.files[0])
        }}
        className={cn(
          "hover:bg-accent/50 flex aspect-[1012/638] cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border border-dashed p-2 text-center transition-colors",
          drag && "border-chart-4 bg-chart-4/5",
          highlight && !slot && "border-reject bg-reject/5 animate-pulse"
        )}
      >
        {slot ? (
          <img src={slot.url} className="max-h-full max-w-full rounded object-contain" alt={label} />
        ) : (
          <>
            <Upload className="text-muted-foreground size-5" />
            <span className="text-muted-foreground text-[11px] leading-tight">{hint}</span>
          </>
        )}
        <input type="file" accept={ACCEPT} className="hidden" aria-label={`${label} photo`} onChange={(e) => onPick(e.target.files?.[0])} />
      </label>
      {slot && <div className="text-muted-foreground truncate text-[10px]">{slot.file.name} · {(slot.file.size / 1024).toFixed(0)} KB</div>}
    </div>
  )
}

function SingleValidate() {
  const s = useValidationStream()
  const stage = s.running ? stageLabel(s.steps) : undefined
  const qc = useQueryClient()
  const [mode, setMode] = React.useState<Mode>("one")
  const [slots, setSlots] = React.useState<Partial<Record<SlotKey, Slot>>>({})
  const [requestId, setRequestId] = React.useState(newRequestId)
  const [store, setStore] = React.useState(true)
  const [selected, setSelected] = React.useState<string | null>(null)
  const [pinned, setPinned] = React.useState(false)
  const [askSide, setAskSide] = React.useState<Side | null>(null)
  const slotsRef = React.useRef(slots)
  slotsRef.current = slots
  const modeRef = React.useRef(mode)
  modeRef.current = mode

  const setSlot = (key: SlotKey, f?: File | null) => {
    if (!f) return
    const err = checkFile(f)
    if (err) return toast.error(err)
    setSlots((o) => {
      if (o[key]) URL.revokeObjectURL(o[key]!.url)
      return { ...o, [key]: { file: f, url: URL.createObjectURL(f) } }
    })
    s.reset()
    setRequestId(newRequestId())
  }
  const clearSlot = (key: SlotKey) =>
    setSlots((o) => {
      if (o[key]) URL.revokeObjectURL(o[key]!.url)
      const n = { ...o }
      delete n[key]
      return n
    })

  const switchMode = (m: Mode) => {
    if (!m || m === mode) return
    // carry photos over so nothing has to be picked again
    setSlots((o) => {
      const files = (Object.values(o).filter(Boolean) as Slot[])
      const next: Partial<Record<SlotKey, Slot>> = {}
      SLOTS[m].forEach((sl, i) => files[i] && (next[sl.key] = files[i]))
      files.slice(SLOTS[m].length).forEach((x) => URL.revokeObjectURL(x.url))
      return next
    })
    setMode(m)
    s.reset()
  }

  // paste a photo from the clipboard: it goes to the first empty slot
  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"))
      const f = item?.getAsFile()
      if (!f) return
      const empty = SLOTS[modeRef.current].find((sl) => !slotsRef.current[sl.key]) ?? SLOTS[modeRef.current][0]
      setSlot(empty.key, new File([f], `pasted.${f.type.split("/")[1]}`, { type: f.type }))
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

  const photos = toPhotos(mode, slots)
  const n = photoCount(photos)

  const run = () => {
    if (!n) return toast.error("Choose a card photo first")
    setPinned(false)
    setAskSide(null)
    s.start(photos, { requestId: requestId.trim() || undefined, store })
  }

  /** SIDE_REQUIRED: keep the photo already sent, as the side it was used as, and ask for the missing one. */
  const addMissingSide = (missing: Side) => {
    const r = s.result
    const sent = Object.values(slots).filter(Boolean) as Slot[]
    const usedAs = (r?.photos ?? []).find((p) => p.status === "used")?.side ?? (missing === "back" ? "front" : "back")
    const next: Partial<Record<SlotKey, Slot>> = {}
    if (sent[0]) next[usedAs === missing ? (missing === "back" ? "front" : "back") : usedAs] = sent[0]
    sent.slice(1).forEach((x) => URL.revokeObjectURL(x.url))
    setSlots(next)
    setMode("sides")
    setAskSide(missing)
    setRequestId(newRequestId())
    s.reset()
    toast.info(`Add a photo of the ${missing}, then validate again — both photos are sent together.`)
  }

  const fieldsDetail = s.steps.find((x) => x.id === "fields")?.detail as { fields?: { name: string; roi: number[]; ok: boolean; side?: Side }[]; photos?: { photo: number; side: Side; fields: string[] }[] } | undefined
  const r = s.result
  const missing = r?.missing_sides ?? []

  // straightened photos: 2.1 sends one per photo; 2.0 sends one image
  const straightened = s.photos.length
    ? s.photos.map((p) => {
        const side = p.side ?? r?.photos?.find((x) => x.photo === p.photo)?.side ?? null
        const rows = fieldsDetail?.fields?.filter((f) => (f.side ?? "front") === (side ?? "front") && (fieldsDetail.photos?.find((x) => x.photo === p.photo)?.fields.includes(f.name) ?? !f.side))
        return { key: p.photo, label: p.label, side, url: p.normalisedUrl, rois: rows }
      })
    : [{ key: 0, label: "", side: null as Side | null, url: s.normalisedUrl ?? null, rois: s.normalisedUrl ? fieldsDetail?.fields : undefined }]
  const inputs = (Object.entries(slots) as [SlotKey, Slot][]).filter(([, v]) => v)

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Card photos</CardTitle>
            <CardDescription>JPEG, PNG or WebP up to 8 MB each. Drop, browse or paste (Ctrl V).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ToggleGroup type="single" variant="outline" size="sm" value={mode} onValueChange={(v) => switchMode(v as Mode)} className="w-full" aria-label="photos to send">
              <ToggleGroupItem value="one" className="flex-1 text-xs">One photo</ToggleGroupItem>
              <ToggleGroupItem value="sides" className="flex-1 text-xs">Front and back</ToggleGroupItem>
              <ToggleGroupItem value="detect" className="flex-1 text-xs" title="Two photos; the agent decides which is the front">Sides unknown</ToggleGroupItem>
            </ToggleGroup>
            <div className={cn("grid gap-3", SLOTS[mode].length > 1 && "grid-cols-2")}>
              {SLOTS[mode].map((sl) => (
                <PhotoSlot
                  key={sl.key}
                  label={sl.label}
                  hint={sl.hint}
                  side={sl.key === "front" || sl.key === "back" ? sl.key : undefined}
                  slot={slots[sl.key]}
                  onPick={(f) => setSlot(sl.key, f)}
                  onClear={() => clearSlot(sl.key)}
                  highlight={askSide === sl.key}
                />
              ))}
            </div>
            {mode !== "one" && (
              <p className="text-muted-foreground text-xs">
                Both photos are validated together as one card: one decision, one run. {mode === "sides" ? "A swapped front/back is detected and corrected." : "Sent as “images”: the agent sorts out the sides."}
              </p>
            )}
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
              <Button className="w-full" onClick={run} disabled={!n}>
                <Play /> Validate{n > 1 ? " both photos" : ""}
              </Button>
            )}
          </CardContent>
        </Card>
        <Card className="gap-3">
          <CardHeader>
            <CardTitle className="text-sm">{straightened.some((x) => x.url) ? (straightened.length > 1 ? "Straightened photos" : "Straightened card") : "Input"}</CardTitle>
            <CardDescription>{straightened.some((x) => x.url) ? "As the agent sees them, with the field regions read from each side" : "The photos you selected"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {straightened.some((x) => x.url)
              ? straightened.map((p) => (
                  <div key={p.key} className="space-y-1">
                    {straightened.length > 1 && (
                      <div className="flex items-center gap-1.5 text-xs">
                        Photo {p.key + 1} <SideBadge side={p.side} />
                        {r?.photos?.find((x) => x.photo === p.key)?.side_corrected && (
                          <Badge variant="outline" className="border-review/50 h-5 gap-1 px-1.5 text-[10px]"><ArrowLeftRight className="size-3" /> side corrected</Badge>
                        )}
                      </div>
                    )}
                    <CardOverlay src={p.url} rois={p.rois?.map((f) => ({ name: f.name, roi: f.roi, ok: f.ok }))} scanning={s.running} stage={stage} />
                  </div>
                ))
              : inputs.length
                ? inputs.map(([k, v]) => <CardOverlay key={k} src={v.url} scanning={s.running} stage={stage} />)
                : <CardOverlay src={null} />}
          </CardContent>
        </Card>
      </div>

      <div className="min-w-0 space-y-4">
        <Card className={cn(r && (r.status === "ACCEPT" ? "border-accept/40" : r.status === "REVIEW" ? "border-review/50" : "border-reject/40"))}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Pipeline {s.running && <Badge variant="outline" className="text-chart-4 animate-pulse">live</Badge>}
              {s.photos.length > 1 && <Badge variant="secondary">{s.photos.length} photos</Badge>}
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
                <AlertDescription>
                  {s.error}
                  {n > 1 && /front|back|images|at most|send a card photo/i.test(s.error) && <div className="mt-1 text-xs">Two-photo validation needs a card agent with two-sided support (schema 2.1). Use “One photo” with older servers.</div>}
                </AlertDescription>
              </Alert>
            )}
            {r && (
              <>
                <DecisionHeadline r={r} />
                {missing.length > 0 && (
                  <div className="border-reject/40 bg-reject/5 flex flex-wrap items-center gap-3 rounded-lg border p-3">
                    <ImagePlus className="text-reject size-5" />
                    <div className="min-w-0 flex-1 text-sm">
                      <b>This programme needs the {missing.join(" and ")} of the card.</b>
                      <div className="text-muted-foreground text-xs">Add that photo and validate again — both photos go in one new request; the agent keeps no partial state.</div>
                    </div>
                    {missing.map((m) => (
                      <Button key={m} size="sm" onClick={() => addMissingSide(m)}><ImagePlus /> Add a photo of the {m}</Button>
                    ))}
                  </div>
                )}
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
  group: CardGroup
  state: "queued" | "running" | "done" | "error"
  result?: ValidationResult
  error?: string
}

function BatchValidate() {
  const { isAdmin } = useConnection()
  const qc = useQueryClient()
  const [files, setFiles] = React.useState<File[]>([])
  const [rows, setRows] = React.useState<BatchRow[]>([])
  const [pair, setPair] = React.useState(true)
  const [store, setStore] = React.useState(true)
  const [running, setRunning] = React.useState(false)
  const stop = React.useRef(false)

  // re-group whenever files or the pairing switch change (only rows not yet validated)
  React.useEffect(() => {
    setRows((old) => {
      const done = old.filter((r) => r.state === "done" || r.state === "error")
      const doneFiles = new Set(done.flatMap((r) => r.group.files))
      const pending = files.filter((f) => !doneFiles.has(f))
      const groups = pair ? pairFiles(pending) : pending.map((f, i) => ({ key: `x:${i}:${f.name}`, label: f.name, files: [f], photos: { image: f } }))
      return [...done, ...groups.map((g) => ({ group: g, state: "queued" as const }))]
    })
  }, [files, pair])

  const add = (list: FileList | null) => {
    if (!list) return
    const ok: File[] = []
    for (const f of Array.from(list)) {
      const err = checkFile(f)
      if (err) toast.error(err)
      else ok.push(f)
    }
    setFiles((x) => [...x, ...ok])
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
          const res = await api.validatePhotos(r.group.photos, { requestId: `batch-${Date.now().toString(36)}-${i}`, store })
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
  const paired = rows.filter((r) => r.group.files.length > 1).length
  const csv = () =>
    ["photos,status,family,variant,reasons,missing_sides,processing_ms,run_id", ...rows.map((r) => [r.group.label, r.result?.status ?? r.state, r.result?.card?.family ?? "", r.result?.card?.variant ?? "", (r.result?.reasons ?? []).join(" "), (r.result?.missing_sides ?? []).join(" "), r.result?.processing_ms ?? "", r.result?.run_id ?? ""].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n")
  const pending = rows.filter((r) => r.state !== "done").length

  return (
    <Card>
      <CardHeader>
        <CardTitle>Batch validation</CardTitle>
        <CardDescription>
          One card per file, or front and back pairs by file name (<span className="font-mono">card7_front.jpg</span> + <span className="font-mono">card7_back.jpg</span>, or <span className="font-mono">_1</span> / <span className="font-mono">_2</span> when the sides are unknown). Two cards at a time.
        </CardDescription>
        <CardAction className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <Switch id="bpair" checked={pair} onCheckedChange={setPair} disabled={running} />
            <Label htmlFor="bpair">Pair front/back</Label>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Switch id="bstore" checked={store} onCheckedChange={setStore} />
            <Label htmlFor="bstore">Record runs</Label>
          </div>
          <Button variant="outline" size="sm" asChild>
            <label className="cursor-pointer">
              <Upload /> Add photos
              <input type="file" accept={ACCEPT} multiple className="hidden" onChange={(e) => { add(e.target.files); e.target.value = "" }} />
            </label>
          </Button>
          {running ? (
            <Button size="sm" variant="outline" onClick={() => (stop.current = true)}><Square /> Stop</Button>
          ) : (
            <Button size="sm" onClick={runAll} disabled={!pending}><Play /> Validate {pending || ""}</Button>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Progress value={(done / rows.length) * 100} className="max-w-xs" />
            <span className="text-muted-foreground tabular">{done}/{rows.length} cards</span>
            {paired > 0 && <Badge variant="secondary">{paired} front/back pair{paired > 1 ? "s" : ""}</Badge>}
            {(["ACCEPT", "REVIEW", "REJECT"] as const).map((k) => (
              <span key={k} className="flex items-center gap-1"><DecisionBadge status={k} /> {counts[k]}</span>
            ))}
            <div className="ml-auto flex gap-2">
              <CopyButton text={csv()} label="Copy CSV" />
              <Button size="sm" variant="ghost" disabled={running} onClick={() => { setRows([]); setFiles([]) }}><X /> Clear</Button>
            </div>
          </div>
        )}
        {rows.length === 0 ? (
          <label className="hover:bg-accent/50 text-muted-foreground flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-sm" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files) }}>
            <Files className="size-6" /> Drop several card photos here, or click to choose
            <input type="file" accept={ACCEPT} multiple className="hidden" onChange={(e) => { add(e.target.files); e.target.value = "" }} />
          </label>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Photos</TableHead>
                <TableHead>Decision</TableHead>
                <TableHead>Programme / variant</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Time</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={r.group.key + i}>
                  <TableCell className="max-w-64 text-sm">
                    <div className="truncate" title={r.group.label}>{r.group.label}</div>
                    <div className="mt-0.5 flex gap-1">
                      {r.group.photos.front && <SideBadge side="front" />}
                      {r.group.photos.back && <SideBadge side="back" />}
                      {r.group.photos.images && <Badge variant="outline" className="h-5 px-1.5 text-[10px]">sides detected</Badge>}
                    </div>
                  </TableCell>
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
