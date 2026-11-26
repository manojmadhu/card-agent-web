// Card definition editors: YAML (CodeMirror + live schema lint), structured form, and an ROI layout
// editor drawn over a real reference image. All three edit the same CardFamily definition.
import * as React from "react"
import CodeMirror from "@uiw/react-codemirror"
import { yaml as yamlLang } from "@codemirror/lang-yaml"
import { linter, lintGutter, type Diagnostic } from "@codemirror/lint"
import { EditorView } from "@codemirror/view"
import { Plus, Trash2, MousePointerSquareDashed } from "lucide-react"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useTheme } from "@/components/theme-provider"
import { NORMALISE, RULE_HELP, RULE_KINDS, parseCardYaml, type Issue } from "@/lib/card-schema"
import type { CardFamily, FieldSpec, RuleSpec, Side, SideDef, VariantDef } from "@/api/types"
import { effectiveSides } from "@/lib/card-schema"
import { SideBadge } from "@/components/photos"
import { hexRgb, rgbHex } from "@/lib/format"
import { cn } from "@/lib/utils"

// ------------------------------------------------------------------ YAML editor
export function YamlEditor({ value, onChange, serverIssues = [], height = "600px", readOnly }: { value: string; onChange: (v: string) => void; serverIssues?: Issue[]; height?: string; readOnly?: boolean }) {
  const { theme } = useTheme()
  const serverRef = React.useRef(serverIssues)
  serverRef.current = serverIssues
  const ext = React.useMemo(
    () => [
      yamlLang(),
      lintGutter(),
      EditorView.lineWrapping,
      linter(
        (view) => {
          const text = view.state.doc.toString()
          const { issues } = parseCardYaml(text)
          const all = [...issues.map((i) => ({ ...i, sev: "error" as const })), ...serverRef.current.map((i) => ({ ...i, sev: "error" as const, message: `server: ${i.message}` }))]
          return all.map<Diagnostic>((i) => {
            const line = view.state.doc.line(Math.min(Math.max(1, i.line || 1), view.state.doc.lines))
            return { from: line.from, to: line.to, severity: i.sev, message: (i.path ? `${i.path}: ` : "") + i.message }
          })
        },
        { delay: 250 }
      ),
    ],
    []
  )
  return (
    <div className="overflow-hidden rounded-lg border">
      <CodeMirror value={value} onChange={onChange} height={height} theme={theme === "dark" ? "dark" : "light"} extensions={ext} readOnly={readOnly} basicSetup={{ foldGutter: true, highlightActiveLine: true }} />
    </div>
  )
}

// ------------------------------------------------------------------ tag input
export function TagInput({ value, onChange, placeholder, upper = true }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; upper?: boolean }) {
  const [text, setText] = React.useState("")
  const add = () => {
    const parts = text.split(",").map((s) => (upper ? s.trim().toUpperCase() : s.trim())).filter(Boolean)
    if (parts.length) onChange([...value, ...parts.filter((p) => !value.includes(p))])
    setText("")
  }
  return (
    <div className="border-input focus-within:ring-ring/50 flex min-h-9 flex-wrap items-center gap-1 rounded-md border px-2 py-1 focus-within:ring-[3px]">
      {value.map((t) => (
        <Badge key={t} variant="secondary" className="gap-1" dir="auto">
          {t}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} className="hover:text-reject" aria-label={`remove ${t}`}>×</button>
        </Badge>
      ))}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault()
            add()
          } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1))
        }}
        onBlur={add}
        placeholder={value.length ? "" : placeholder}
        className="min-w-24 flex-1 bg-transparent py-0.5 text-sm outline-none"
        dir="auto"
      />
    </div>
  )
}

// ------------------------------------------------------------------ structured form
type Section = "identity" | "variants" | "sides" | "fields" | "rules"

export function CardForm({ value, onChange, sections = ["identity", "variants", "sides", "fields", "rules"], lockId }: { value: CardFamily; onChange: (c: CardFamily) => void; sections?: Section[]; lockId?: boolean }) {
  const set = <K extends keyof CardFamily>(k: K, v: CardFamily[K]) => onChange({ ...value, [k]: v })
  const setV = (i: number, p: Partial<VariantDef>) => set("variants", value.variants.map((v, j) => (j === i ? { ...v, ...p } : v)))
  const setF = (i: number, p: Partial<FieldSpec>) => set("fields", value.fields.map((v, j) => (j === i ? { ...v, ...p } : v)))
  const setR = (i: number, p: Partial<RuleSpec>) => set("rules", value.rules.map((v, j) => (j === i ? { ...v, ...p } : v)))
  const sideIds: Side[] = value.sides?.length ? value.sides.map((x) => x.id) : ["front"]
  const twoSided = sideIds.length > 1

  // Layouts respond to the form's own width (@container), not the window: the same form is shown
  // full-width on the programme page and in half a column next to the layout editor in the wizard.
  return (
    <div className="@container space-y-4">
      {sections.includes("identity") && (
        <Card>
          <CardHeader>
            <CardTitle>Programme identity</CardTitle>
            <CardDescription>Keywords prove the programme in the OCR text (English and Arabic); negative keywords rule out look-alikes.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 @xl:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Programme id</Label>
              <Input value={value.id} disabled={lockId} onChange={(e) => set("id", e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ""))} placeholder="ae.fazaa" className="font-mono" />
              <p className="text-muted-foreground text-[11px]">Country code, dot, lowercase name. Cannot be changed later.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Country (ISO-3166 alpha-2)</Label>
              <Input
                value={value.country}
                maxLength={2}
                onChange={(e) => {
                  const cc = e.target.value.toUpperCase().replace(/[^A-Z]/g, "")
                  const id = !lockId && value.id.includes(".") ? `${cc.toLowerCase()}.${value.id.split(".")[1]}` : value.id
                  onChange({ ...value, country: cc, id })
                }}
                className="font-mono uppercase"
                placeholder="AE"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Display name</Label>
              <Input value={value.name} onChange={(e) => set("name", e.target.value)} placeholder="Fazaa" />
            </div>
            <div className="space-y-1.5">
              <Label>Issuer</Label>
              <Input value={value.issuer} onChange={(e) => set("issuer", e.target.value)} placeholder="Issuing organisation" />
            </div>
            <div className="space-y-1.5">
              <Label>Keywords</Label>
              <TagInput value={value.keywords} onChange={(v) => set("keywords", v)} placeholder="FAZAA, فزعة …" />
            </div>
            <div className="space-y-1.5">
              <Label>Negative keywords</Label>
              <TagInput value={value.negative_keywords} onChange={(v) => set("negative_keywords", v)} placeholder="names of look-alike programmes" />
            </div>
          </CardContent>
        </Card>
      )}

      {sections.includes("variants") && (
        <Card>
          <CardHeader>
            <CardTitle>Variants</CardTitle>
            <CardDescription>Tiers of the programme: body colour, printed tier words and card-number prefix. Removing a variant on save deletes its reference images.</CardDescription>
            <CardAction>
              <Button size="sm" variant="outline" onClick={() => set("variants", [...value.variants, { id: `variant${value.variants.length + 1}`, name: `${value.name} variant ${value.variants.length + 1}`.trim(), body_color_rgb: [120, 120, 130], keywords: [], number_prefix: null }])}>
                <Plus /> Variant
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-muted-foreground hidden grid-cols-[52px_130px_minmax(0,1fr)_minmax(0,1fr)_90px_36px] gap-2 px-1 text-[11px] uppercase @3xl:grid">
              <span>Colour</span><span>Id</span><span>Name</span><span>Tier keywords</span><span>Prefix</span><span />
            </div>
            {value.variants.map((v, i) => (
              <div key={i} className="grid grid-cols-[52px_minmax(0,1fr)_36px] items-center gap-2 rounded-lg border p-2 @3xl:grid-cols-[52px_130px_minmax(0,1fr)_minmax(0,1fr)_90px_36px]">
                <input type="color" value={rgbHex(v.body_color_rgb)} onChange={(e) => setV(i, { body_color_rgb: hexRgb(e.target.value) })} className="h-9 w-full cursor-pointer rounded-md border bg-transparent p-0.5" aria-label={`${v.id} body colour`} />
                <Input value={v.id} onChange={(e) => setV(i, { id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })} className="font-mono" aria-label="variant id" placeholder="id" />
                <Input value={v.name} onChange={(e) => setV(i, { name: e.target.value })} aria-label="variant name" placeholder="Display name" className="col-span-3 @3xl:col-span-1" />
                <div className="col-span-3 min-w-0 @3xl:col-span-1"><TagInput value={v.keywords} onChange={(k) => setV(i, { keywords: k })} placeholder="Tier keywords: GOLD, ذهبية" /></div>
                <Input value={v.number_prefix ?? ""} onChange={(e) => setV(i, { number_prefix: e.target.value.replace(/\D/g, "") || null })} className="col-span-2 font-mono @3xl:col-span-1" placeholder="Number prefix (optional)" aria-label="number prefix" />
                <Button size="icon" variant="ghost" className="row-start-1 col-start-3 @3xl:col-start-auto @3xl:row-start-auto" disabled={value.variants.length <= 1} onClick={() => set("variants", value.variants.filter((_, j) => j !== i))} aria-label="remove variant"><Trash2 /></Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {sections.includes("sides") && <SidesSection value={value} onChange={onChange} />}

      {sections.includes("fields") && (
        <Card>
          <CardHeader>
            <CardTitle>Fields</CardTitle>
            <CardDescription>ROI = [x0, y0, x1, y1] as fractions of the reference card {twoSided ? "of the field's side " : ""}(photos are aligned to it before reading). The value must match the regex after normalisation.</CardDescription>
            <CardAction>
              <Button size="sm" variant="outline" onClick={() => set("fields", [...value.fields, { name: `field_${value.fields.length + 1}`, roi: [0.05, 0.4, 0.6, 0.5], regex: ".+", required: false, normalise: "none", anchor: null, script: "latin" }])}>
                <Plus /> Field
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-2">
            {value.fields.map((f, i) => (
              <div key={i} className="space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
                  <Field label="name" className="min-w-[9rem] flex-1">
                    <Input value={f.name} onChange={(e) => setF(i, { name: e.target.value })} className="font-mono" aria-label="field name" />
                  </Field>
                  {twoSided && (
                    <Field label="side" className="w-[7.5rem] shrink-0">
                      <Select value={f.side ?? "front"} onValueChange={(v) => setF(i, { side: v as Side })}>
                        <SelectTrigger className="w-full" aria-label={`${f.name} side`}><SelectValue /></SelectTrigger>
                        <SelectContent>{sideIds.map((sd) => <SelectItem key={sd} value={sd}>{sd === "back" ? "Back" : "Front"}</SelectItem>)}</SelectContent>
                      </Select>
                    </Field>
                  )}
                  <div className="flex h-9 shrink-0 items-center gap-2">
                    <Switch checked={f.required} onCheckedChange={(c) => setF(i, { required: c })} id={`req-${i}`} />
                    <Label htmlFor={`req-${i}`} className="text-xs whitespace-nowrap">required</Label>
                  </div>
                  <Button size="icon" variant="ghost" className="ml-auto shrink-0" onClick={() => set("fields", value.fields.filter((_, j) => j !== i))} aria-label={`remove field ${f.name}`}><Trash2 /></Button>
                </div>
                <div className="grid grid-cols-2 gap-2 @lg:grid-cols-3">
                  <Field label="normalise">
                    <Select value={f.normalise} onValueChange={(v) => setF(i, { normalise: v as FieldSpec["normalise"] })}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>{NORMALISE.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label="script">
                    <Select value={f.script ?? "latin"} onValueChange={(v) => setF(i, { script: v as FieldSpec["script"] })}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="latin">latin</SelectItem><SelectItem value="arabic">arabic</SelectItem></SelectContent>
                    </Select>
                  </Field>
                  <Field label="anchor" className="col-span-2 @lg:col-span-1"><Input value={f.anchor ?? ""} onChange={(e) => setF(i, { anchor: e.target.value || null })} className="font-mono text-xs" placeholder="EXP" /></Field>
                </div>
                <div className="grid gap-2 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                  <Field label="roi [x0, y0, x1, y1]">
                    <div className="grid grid-cols-4 gap-1">
                      {f.roi.map((r, k) => (
                        <Input key={k} type="number" step={0.01} min={0} max={1} value={r} onChange={(e) => setF(i, { roi: f.roi.map((x, j) => (j === k ? +e.target.value : x)) as FieldSpec["roi"] })} className="min-w-0 px-2 font-mono text-xs" aria-label={`${f.name} ${["x0", "y0", "x1", "y1"][k]}`} />
                      ))}
                    </div>
                  </Field>
                  <Field label="regex (Python re, full match)"><Input value={f.regex} onChange={(e) => setF(i, { regex: e.target.value })} className="font-mono text-xs" /></Field>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {sections.includes("rules") && (
        <Card>
          <CardHeader>
            <CardTitle>Validation rules</CardTitle>
            <CardDescription>A failed <b>critical</b> rule rejects the card; any other failed rule sends it to review.</CardDescription>
            <CardAction>
              <Button size="sm" variant="outline" disabled={!value.fields.length} onClick={() => set("rules", [...value.rules, { type: "regex", field: value.fields[0].name, critical: false, params: {} }])}>
                <Plus /> Rule
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-2">
            {value.rules.map((r, i) => (
              <div key={i} className="grid grid-cols-2 items-center gap-2 rounded-lg border p-2 @3xl:grid-cols-[210px_180px_minmax(0,1fr)_auto_36px]">
                <Select value={r.type} onValueChange={(v) => setR(i, { type: v as RuleSpec["type"], params: v === "date_order" ? { other_field: value.fields[0]?.name } : v === "length" ? { min: 1, max: 32 } : {} })}>
                  <SelectTrigger className="w-full font-mono text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RULE_KINDS.map((t) => (
                      <SelectItem key={t} value={t} className="font-mono text-xs">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={r.field} onValueChange={(v) => setR(i, { field: v })}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="field" /></SelectTrigger>
                  <SelectContent>{value.fields.map((f) => <SelectItem key={f.name} value={f.name}>{f.name}</SelectItem>)}</SelectContent>
                </Select>
                <div className="col-span-2 min-w-0 @3xl:col-span-1"><RuleParams rule={r} fields={value.fields} onChange={(params) => setR(i, { params })} /></div>
                <div className="flex items-center gap-1.5">
                  <Switch checked={r.critical} onCheckedChange={(c) => setR(i, { critical: c })} id={`crit-${i}`} />
                  <Label htmlFor={`crit-${i}`} className="text-xs">critical</Label>
                </div>
                <Button size="icon" variant="ghost" className="justify-self-end" onClick={() => set("rules", value.rules.filter((_, j) => j !== i))} aria-label="remove rule"><Trash2 /></Button>
              </div>
            ))}
            {!value.rules.length && <p className="text-muted-foreground text-sm">No rules: any identified card with readable required fields would be accepted.</p>}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/** Sides (schema 2.1): front only, or front and back; each side can be forced required/optional. */
function SidesSection({ value, onChange }: { value: CardFamily; onChange: (c: CardFamily) => void }) {
  const two = (value.sides?.length ?? 0) > 1
  const eff = effectiveSides(value)
  const setTwo = (on: boolean) => {
    if (on) onChange({ ...value, sides: [{ id: "front" }, { id: "back" }] })
    // front only: fields that were on the back move to the front (nothing is silently dropped)
    else onChange({ ...value, sides: undefined, fields: value.fields.map((f) => ({ ...f, side: undefined })) })
  }
  const setReq = (id: Side, v: string) =>
    onChange({ ...value, sides: (value.sides ?? []).map((sd): SideDef => (sd.id === id ? { id, required: v === "auto" ? undefined : v === "required" } : sd)) })
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sides</CardTitle>
        <CardDescription>Where the programme prints its data. A side is required when a required field is printed on it; the agent then asks for a photo of that side (SIDE_REQUIRED).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 @lg:grid-cols-2">
          {[
            { on: false, title: "Front only", text: "Everything needed is on the front. One photo per card." },
            { on: true, title: "Front and back", text: "Data on both sides, or only on the back. Each field says which side it is on." },
          ].map((o) => (
            <button key={o.title} type="button" onClick={() => setTwo(o.on)} className={cn("rounded-lg border p-3 text-left transition-colors", two === o.on ? "border-foreground/50 bg-accent ring-ring/40 ring-2" : "hover:bg-accent/50")} aria-pressed={two === o.on}>
              <div className="text-sm font-medium">{o.title}</div>
              <div className="text-muted-foreground text-xs">{o.text}</div>
            </button>
          ))}
        </div>
        <div className={cn("grid gap-3", two && "@2xl:grid-cols-2")}>
          {eff.map((sd) => {
            const declared = value.sides?.find((x) => x.id === sd.id)?.required
            return (
              <div key={sd.id} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <SideBadge side={sd.id} />
                  <Badge variant="outline" className={sd.required ? "border-reject/40" : ""}>{sd.required ? "photo required" : "photo optional"}</Badge>
                  {two && (
                    <Select value={declared == null ? "auto" : declared ? "required" : "optional"} onValueChange={(v) => setReq(sd.id, v)}>
                      <SelectTrigger size="sm" className="ml-auto w-[130px]" aria-label={`${sd.id} required`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Automatic</SelectItem>
                        <SelectItem value="required">Required</SelectItem>
                        <SelectItem value="optional">Optional</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="text-muted-foreground text-xs">Fields: {sd.fields.length ? sd.fields.join(", ") : "none (helps identification only)"}</div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function RuleParams({ rule, fields, onChange }: { rule: RuleSpec; fields: FieldSpec[]; onChange: (p: Record<string, unknown>) => void }) {
  if (rule.type === "date_order")
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground whitespace-nowrap">≤ other field</span>
        <Select value={String(rule.params?.other_field ?? "")} onValueChange={(v) => onChange({ ...rule.params, other_field: v })}>
          <SelectTrigger className="h-8 w-full"><SelectValue placeholder="choose" /></SelectTrigger>
          <SelectContent>{fields.map((f) => <SelectItem key={f.name} value={f.name}>{f.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    )
  if (rule.type === "length")
    return (
      <div className="flex items-center gap-1 text-xs">
        <span className="text-muted-foreground">min</span>
        <Input type="number" className="h-8 w-16" value={Number(rule.params?.min ?? "")} onChange={(e) => onChange({ ...rule.params, min: Number(e.target.value) })} />
        <span className="text-muted-foreground">max</span>
        <Input type="number" className="h-8 w-16" value={Number(rule.params?.max ?? "")} onChange={(e) => onChange({ ...rule.params, max: Number(e.target.value) })} />
      </div>
    )
  return <span className="text-muted-foreground block truncate text-xs" title={RULE_HELP[rule.type]}>{RULE_HELP[rule.type]}</span>
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <Label className="text-muted-foreground text-[11px]">{label}</Label>
      {children}
    </div>
  )
}

// ------------------------------------------------------------------ ROI layout editor
/**
 * Draw field regions on a real card image. Select a field, then drag on the card to set its ROI.
 * Coordinates are fractions of the image (the reference card the agent aligns photos to).
 */
export function RoiEditor({ image, fields, onChange, readOnly }: { image: React.ReactNode; fields: FieldSpec[]; onChange: (f: FieldSpec[]) => void; readOnly?: boolean }) {
  const [active, setActive] = React.useState(fields[0]?.name ?? "")
  const [drag, setDrag] = React.useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const box = React.useRef<HTMLDivElement>(null)
  const pos = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }
  }
  const commit = () => {
    if (!drag) return
    const roi: FieldSpec["roi"] = [Math.min(drag.x0, drag.x1), Math.min(drag.y0, drag.y1), Math.max(drag.x0, drag.x1), Math.max(drag.y0, drag.y1)].map((v) => +v.toFixed(3)) as FieldSpec["roi"]
    setDrag(null)
    if (roi[2] - roi[0] < 0.01 || roi[3] - roi[1] < 0.01) return
    onChange(fields.map((f) => (f.name === active ? { ...f, roi } : f)))
  }
  const palette = ["var(--chart-1)", "var(--chart-2)", "var(--chart-4)", "var(--chart-5)", "var(--chart-3)"]
  return (
    <div className="space-y-3">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground flex items-center gap-1 text-xs"><MousePointerSquareDashed className="size-4" /> Choose a field, then drag on the card:</span>
          {fields.map((f, i) => (
            <button key={f.name} onClick={() => setActive(f.name)} className={cn("rounded-md border px-2 py-1 font-mono text-xs", active === f.name && "ring-ring ring-2")} style={{ borderColor: palette[i % palette.length] }}>
              {f.name}
            </button>
          ))}
        </div>
      )}
      <div
        ref={box}
        className={cn("relative aspect-[1012/638] w-full touch-none overflow-hidden rounded-xl border select-none", !readOnly && "cursor-crosshair")}
        onPointerDown={(e) => {
          if (readOnly || !active) return
          ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
          const p = pos(e)
          setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
        }}
        onPointerMove={(e) => drag && setDrag((d) => d && { ...d, x1: pos(e).x, y1: pos(e).y })}
        onPointerUp={commit}
      >
        <div className="pointer-events-none absolute inset-0 [&>*]:size-full [&>*]:object-cover">{image}</div>
        {fields.map((f, i) => (
          <Tooltip key={f.name}>
            <TooltipTrigger asChild>
              <div
                className={cn("absolute rounded-sm border-2", active === f.name && !readOnly ? "bg-white/25" : "bg-white/10")}
                style={{ left: `${f.roi[0] * 100}%`, top: `${f.roi[1] * 100}%`, width: `${(f.roi[2] - f.roi[0]) * 100}%`, height: `${(f.roi[3] - f.roi[1]) * 100}%`, borderColor: palette[i % palette.length] }}
              >
                <span className="absolute -top-4 left-0 rounded-t-sm px-1 font-mono text-[9px] leading-4 text-white" style={{ background: palette[i % palette.length] }}>{f.name}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent className="font-mono">{f.roi.map((v) => v.toFixed(3)).join(", ")}</TooltipContent>
          </Tooltip>
        ))}
        {drag && (
          <div className="border-foreground absolute border-2 border-dashed bg-white/20" style={{ left: `${Math.min(drag.x0, drag.x1) * 100}%`, top: `${Math.min(drag.y0, drag.y1) * 100}%`, width: `${Math.abs(drag.x1 - drag.x0) * 100}%`, height: `${Math.abs(drag.y1 - drag.y0) * 100}%` }} />
        )}
      </div>
    </div>
  )
}
