import * as React from "react"
import { Plus, Trash2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { NORMALISERS, RULE_TYPES, type Family, type FieldDef, type RuleDef, type Variant } from "@/lib/schema"
import { hexRgb, rgbHex } from "@/lib/color"
import { CardPreview } from "@/components/card-preview"
import { refImagePath } from "@/components/auth-image"
import { useRefs } from "@/api/hooks"

export function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [text, setText] = React.useState("")
  const add = () => {
    const parts = text.split(",").map((s) => s.trim()).filter(Boolean)
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

type Section = "identity" | "variants" | "fields" | "rules"

export function FamilyForm({ value, onChange, sections = ["identity", "variants", "fields", "rules"], lockId }: { value: Family; onChange: (f: Family) => void; sections?: Section[]; lockId?: boolean }) {
  const set = <K extends keyof Family>(k: K, v: Family[K]) => onChange({ ...value, [k]: v })
  const setVariant = (i: number, p: Partial<Variant>) => set("variants", value.variants.map((v, j) => (j === i ? { ...v, ...p } : v)))
  const setField = (i: number, p: Partial<FieldDef>) => set("fields", value.fields.map((v, j) => (j === i ? { ...v, ...p } : v)))
  const setRule = (i: number, p: Partial<RuleDef>) => set("rules", value.rules.map((v, j) => (j === i ? { ...v, ...p } : v)))
  const w = value.weights

  return (
    <div className="space-y-4">
      {sections.includes("identity") && (
        <Card>
          <CardHeader>
            <CardTitle>Identity &amp; family signals</CardTitle>
            <CardDescription>Keywords prove the family in OCR text; negative keywords rule out look-alikes.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Family id</Label>
              <Input value={value.family} disabled={lockId} onChange={(e) => set("family", e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))} className="font-mono" placeholder="e.g. noor" />
              <p className="text-muted-foreground text-[11px]">File name: <span className="font-mono">registry/{value.family || "…"}.yaml</span></p>
            </div>
            <div className="space-y-1.5">
              <Label>Display name</Label>
              <Input value={value.family_name} onChange={(e) => set("family_name", e.target.value)} placeholder="Noor Rewards" />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Issuer</Label>
              <Input value={value.issuer} onChange={(e) => set("issuer", e.target.value)} placeholder="Issuing organisation" />
            </div>
            <div className="space-y-1.5">
              <Label>Keywords (English + Arabic)</Label>
              <TagInput value={value.keywords} onChange={(v) => set("keywords", v)} placeholder="NOOR, نور …" />
            </div>
            <div className="space-y-1.5">
              <Label>Negative keywords</Label>
              <TagInput value={value.negative_keywords} onChange={(v) => set("negative_keywords", v)} placeholder="names of look-alike issuers" />
            </div>
            <div className="space-y-3 md:col-span-2">
              <div className="flex items-center justify-between">
                <Label>Signal fusion weights</Label>
                <span className={`tabular text-xs ${Math.abs(w.text + w.visual + w.colour - 1) > 0.011 ? "text-reject" : "text-muted-foreground"}`}>sum {(w.text + w.visual + w.colour).toFixed(2)}</span>
              </div>
              {(["text", "visual", "colour"] as const).map((k) => (
                <div key={k} className="grid grid-cols-[80px_1fr_44px] items-center gap-3">
                  <span className="text-sm">{k}</span>
                  <Slider
                    value={[w[k]]}
                    min={0}
                    max={1}
                    step={0.05}
                    onValueChange={([x]) => {
                      // keep the sum at 1 by scaling the other two weights
                      const others = (["text", "visual", "colour"] as const).filter((o) => o !== k)
                      const rest = others.reduce((a, o) => a + w[o], 0) || 1
                      const remain = 1 - x
                      const nw = { ...w, [k]: +x.toFixed(2) }
                      others.forEach((o) => (nw[o] = +((w[o] / rest) * remain).toFixed(2)))
                      set("weights", nw)
                    }}
                  />
                  <span className="tabular text-right text-sm">{w[k].toFixed(2)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {sections.includes("variants") && (
        <Card>
          <CardHeader>
            <CardTitle>Variants</CardTitle>
            <CardDescription>Each tier: body colour, printed tier words, card-number prefix.</CardDescription>
            <CardAction>
              <Button size="sm" variant="outline" onClick={() => set("variants", [...value.variants, { id: `variant${value.variants.length + 1}`, name: `${value.family_name} Variant ${value.variants.length + 1}`, body_color_rgb: [120, 120, 130], keywords: [], number_prefix: "" }])}>
                <Plus /> Variant
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-muted-foreground hidden grid-cols-[52px_120px_1fr_1fr_90px_36px] gap-2 px-1 text-[11px] uppercase md:grid">
              <span>Colour</span><span>Id</span><span>Name</span><span>Keywords</span><span>Prefix</span><span />
            </div>
            {value.variants.map((v, i) => (
              <div key={i} className="grid items-center gap-2 rounded-lg border p-2 md:grid-cols-[52px_120px_1fr_1fr_90px_36px]">
                <input type="color" value={rgbHex(v.body_color_rgb as [number, number, number])} onChange={(e) => setVariant(i, { body_color_rgb: hexRgb(e.target.value) })} className="h-9 w-full cursor-pointer rounded-md border bg-transparent p-0.5" aria-label="body colour" />
                <Input value={v.id} onChange={(e) => setVariant(i, { id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })} className="font-mono" />
                <Input value={v.name} onChange={(e) => setVariant(i, { name: e.target.value })} />
                <TagInput value={v.keywords} onChange={(k) => setVariant(i, { keywords: k })} placeholder="GOLD, ذهبية" />
                <Input value={v.number_prefix} onChange={(e) => setVariant(i, { number_prefix: e.target.value.replace(/\D/g, "") })} className="font-mono" placeholder="2" />
                <Button size="icon" variant="ghost" disabled={value.variants.length <= 1} onClick={() => set("variants", value.variants.filter((_, j) => j !== i))} aria-label="remove variant"><Trash2 /></Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {sections.includes("fields") && (
        <Card>
          <CardHeader>
            <CardTitle>Fields to extract</CardTitle>
            <CardDescription>ROI = [x0, y0, x1, y1] as fractions of the normalised card. Value must fully match the regex after normalisation.</CardDescription>
            <CardAction>
              <Button size="sm" variant="outline" onClick={() => set("fields", [...value.fields, { name: `field_${value.fields.length + 1}`, roi: [0.05, 0.4, 0.6, 0.5], regex: "^.+$", required: false, normalise: "none" }])}>
                <Plus /> Field
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-2">
            {value.fields.map((f, i) => (
              <div key={i} className="space-y-2 rounded-lg border p-2">
                <div className="grid grid-cols-2 items-end gap-2 md:grid-cols-[minmax(0,1fr)_140px_100px_auto_auto]">
                  <div className="space-y-1">
                    <Label className="text-[11px]">name</Label>
                    <Input value={f.name} onChange={(e) => setField(i, { name: e.target.value })} className="font-mono" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">normalise</Label>
                    <Select value={f.normalise} onValueChange={(v) => setField(i, { normalise: v as FieldDef["normalise"] })}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>{NORMALISERS.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">anchor</Label>
                    <Input value={f.anchor ?? ""} onChange={(e) => setField(i, { anchor: e.target.value || null })} className="font-mono text-xs" placeholder="EXP" />
                  </div>
                  <div className="flex h-9 items-center gap-1.5">
                    <Switch checked={f.required} onCheckedChange={(c) => setField(i, { required: c })} id={`req${i}`} />
                    <Label htmlFor={`req${i}`} className="text-xs">required</Label>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => set("fields", value.fields.filter((_, j) => j !== i))} aria-label="remove field"><Trash2 /></Button>
                </div>
                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                  <div className="space-y-1">
                    <Label className="text-[11px]">roi [x0, y0, x1, y1]</Label>
                    <div className="grid grid-cols-4 gap-1">
                      {f.roi.map((r, k) => (
                        <Input key={k} type="number" step={0.01} min={0} max={1} value={r} onChange={(e) => setField(i, { roi: f.roi.map((x, j) => (j === k ? +e.target.value : x)) as FieldDef["roi"] })} className="min-w-0 px-1.5 font-mono text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">regex (full match after normalisation)</Label>
                    <Input value={f.regex} onChange={(e) => setField(i, { regex: e.target.value })} className="font-mono text-xs" />
                  </div>
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
            <CardDescription>A failed <b>critical</b> rule rejects the card; a failed non-critical rule sends it to review.</CardDescription>
            <CardAction>
              <Button size="sm" variant="outline" disabled={!value.fields.length} onClick={() => set("rules", [...value.rules, { type: "regex", field: value.fields[0].name, critical: false }])}>
                <Plus /> Rule
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-2">
            {value.rules.map((r, i) => (
              <div key={i} className="grid items-center gap-2 rounded-lg border p-2 md:grid-cols-[200px_1fr_auto_36px]">
                <Select value={r.type} onValueChange={(v) => setRule(i, { type: v as RuleDef["type"] })}>
                  <SelectTrigger className="w-full font-mono text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{RULE_TYPES.map((t) => <SelectItem key={t} value={t} className="font-mono text-xs">{t}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={r.field} onValueChange={(v) => setRule(i, { field: v })}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="field" /></SelectTrigger>
                  <SelectContent>{value.fields.map((f) => <SelectItem key={f.name} value={f.name}>{f.name}</SelectItem>)}</SelectContent>
                </Select>
                <div className="flex items-center gap-1.5">
                  <Switch checked={r.critical} onCheckedChange={(c) => setRule(i, { critical: c })} id={`crit${i}`} />
                  <Label htmlFor={`crit${i}`} className="text-xs">critical</Label>
                </div>
                <Button size="icon" variant="ghost" onClick={() => set("rules", value.rules.filter((_, j) => j !== i))} aria-label="remove rule"><Trash2 /></Button>
              </div>
            ))}
            {!value.rules.length && <p className="text-muted-foreground text-sm">No rules — every extracted card would be accepted on identity alone.</p>}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/** The draft's field ROIs drawn over a real enrolled reference of the variant — the quickest way to
 *  check that a layout edit lines up with the actual card. Falls back to the variant's body colour. */
export function TemplatePreview({ family, variantId, persisted = true }: { family: Family; variantId?: string; persisted?: boolean }) {
  const v = family.variants.find((x) => x.id === variantId) ?? family.variants[0]
  const { data: refs } = useRefs(persisted && family.family ? family.family : undefined)
  const ref = persisted ? refs?.find((r) => r.family === family.family && r.variant === v?.id) : undefined
  const rois = family.fields.map((f) => ({ name: f.name, roi: f.roi }))
  if (ref) return <CardPreview path={refImagePath(ref.id, 800)} rois={rois} />
  return (
    <div className="relative">
      <CardPreview src={null} rois={rois} empty="" className="border-dashed" background={v ? rgbHex(v.body_color_rgb) : undefined} />
      <span className="absolute right-2 bottom-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">no reference image yet — showing body colour</span>
    </div>
  )
}
