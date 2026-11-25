import * as React from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, GitBranch, Loader2, RotateCcw, Save, ScanLine, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AuthImage, ConfirmDialog, ErrorState, Kv, LoadingRows, PageHeader } from "@/components/common"
import { CardForm, RoiEditor, YamlEditor } from "@/components/card-editor"
import { ReferenceManager } from "@/components/reference-manager"
import { SourceBadge } from "@/pages/cards"
import { useCard, useCardYaml, useInvalidateCards, useReferences } from "@/api/queries"
import { api } from "@/api/endpoints"
import type { CardFamily, CardView } from "@/api/types"
import { useConnection } from "@/auth/connection"
import { cardToYaml, effectiveSides, parseCardYaml } from "@/lib/card-schema"
import { useSaveCard } from "@/lib/use-save-card"
import { dateTime, rgbHex } from "@/lib/format"
import { RULE_HELP } from "@/lib/card-schema"
import type { Side } from "@/api/types"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { SideBadge } from "@/components/photos"

export default function CardDetailPage() {
  const { id = "" } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = params.get("tab") ?? "overview"
  const setTab = (t: string) => setParams((p) => { p.set("tab", t); return p }, { replace: true })
  const { isAdmin } = useConnection()
  const card = useCard(id)
  const yamlQ = useCardYaml(id)
  const nav = useNavigate()
  const saver = useSaveCard()
  const invalidate = useInvalidateCards()
  const [draft, setDraft] = React.useState<string | null>(null)
  const [del, setDel] = React.useState(false)

  React.useEffect(() => {
    if (yamlQ.data != null && draft == null) setDraft(yamlQ.data)
  }, [yamlQ.data, draft])

  if (card.isLoading) return <LoadingRows rows={8} />
  if (card.isError) return <ErrorState error={card.error} onRetry={() => card.refetch()} />
  const c = card.data!
  const server = yamlQ.data ?? ""
  const text = draft ?? server
  const parsed = parseCardYaml(text)
  const dirty = draft != null && draft !== server
  const registry = c.source === "registry"

  // what the save will do, so it is never a surprise
  const removedVariants = parsed.card ? c.definition.variants.filter((v) => !parsed.card!.variants.some((x) => x.id === v.id)).map((v) => v.id) : []
  const roiChanged = parsed.card ? parsed.card.fields.some((f) => JSON.stringify(c.definition.fields.find((x) => x.name === f.name)?.roi) !== JSON.stringify(f.roi)) : false

  const doSave = async (force = false) => {
    if (!parsed.card) return toast.error("Fix the definition first", { description: parsed.issues[0]?.message })
    const out = await saver.save(id, text, force)
    if (out) {
      setDraft(null)
      yamlQ.refetch()
    }
  }
  const setFromForm = (f: CardFamily) => setDraft(cardToYaml(f))

  return (
    <div className="mx-auto max-w-[1440px] pb-20">
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild><Link to="/cards"><ArrowLeft /> Programmes</Link></Button>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-2">{c.name} <Badge variant="outline" className="font-mono">{c.family}</Badge> <SourceBadge source={c.source} /></span>}
        description={`${c.issuer} · ${c.country} · ${c.variants.length} variants · ${c.definition.fields.length} fields · ${c.definition.rules.length} rules · updated ${dateTime(c.updated_at)}`}
        actions={
          <>
            <Button variant="outline" size="sm" asChild><Link to="/validate"><ScanLine /> Test a photo</Link></Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                try {
                  const a = document.createElement("a")
                  a.href = URL.createObjectURL(new Blob([text], { type: "application/yaml" }))
                  a.download = `${c.family.split(".")[1] ?? c.family}.yaml`
                  a.click()
                  URL.revokeObjectURL(a.href)
                } catch {
                  toast.error("Download blocked here — use Copy in the YAML tab")
                }
              }}
            >
              <Download /> YAML
            </Button>
          </>
        }
      />

      {registry && (
        <Alert className="mb-4">
          <GitBranch />
          <AlertTitle>Managed in the Git registry</AlertTitle>
          <AlertDescription>This programme is imported from <span className="font-mono">registry/cards</span> by sync. Prefer changing it in Git. Saving or deleting here requires <b>force</b>, after which the API owns it and syncs leave it alone.</AlertDescription>
        </Alert>
      )}
      {(c.missing_references?.length ?? 0) > 0 && (
        <Alert className="border-review/50 mb-4">
          <AlertTriangle className="text-review" />
          <AlertTitle>Missing reference images: {c.missing_references!.map((m) => `${m.variant} (${m.side})`).join(", ")}</AlertTitle>
          <AlertDescription>
            Upload 3–20 images per variant and side. <button className="underline" onClick={() => setTab("references")}>Upload references</button>
          </AlertDescription>
        </Alert>
      )}
      {!c.missing_references && c.variants_without_references.length > 0 && (
        <Alert className="border-review/50 mb-4">
          <AlertTriangle className="text-review" />
          <AlertTitle>Variants without reference images: {c.variants_without_references.join(", ")}</AlertTitle>
          <AlertDescription>
            They cannot be matched visually. <button className="underline" onClick={() => setTab("references")}>Upload references</button>
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="yaml">Definition (YAML)</TabsTrigger>
          <TabsTrigger value="form" disabled={!parsed.card}>Form editor</TabsTrigger>
          <TabsTrigger value="layout" disabled={!parsed.card}>Field layout</TabsTrigger>
          <TabsTrigger value="references" disabled={!isAdmin}>Reference images</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Overview def={c.definition} view={c} />
          {isAdmin && (
            <Card className="border-reject/30 mt-4">
              <CardHeader>
                <CardTitle className="text-sm">Delete programme</CardTitle>
                <CardDescription>Removes the definition, all its reference vectors and stored images. The agent will reject these cards as unknown.</CardDescription>
                <CardAction><Button variant="outline" size="sm" className="text-reject" onClick={() => setDel(true)}><Trash2 /> Delete</Button></CardAction>
              </CardHeader>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="yaml" className="mt-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            {yamlQ.isLoading ? <LoadingRows rows={10} /> : <YamlEditor value={text} onChange={(v) => { setDraft(v); saver.setServerIssues([]) }} serverIssues={saver.serverIssues} height="640px" readOnly={!isAdmin} />}
            <div className="space-y-4">
              <Card className="gap-3">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    {parsed.issues.length || saver.serverIssues.length ? <AlertTriangle className="text-reject size-4" /> : <CheckCircle2 className="text-accept size-4" />}
                    {parsed.issues.length ? `${parsed.issues.length} problem(s)` : saver.serverIssues.length ? `${saver.serverIssues.length} server error(s)` : "Valid definition"}
                  </CardTitle>
                  <CardDescription>Checked as you type against the card schema; the server validates again on save.</CardDescription>
                </CardHeader>
                {(parsed.issues.length > 0 || saver.serverIssues.length > 0) && (
                  <CardContent className="space-y-1">
                    {[...parsed.issues, ...saver.serverIssues].slice(0, 10).map((i, k) => (
                      <div key={k} className="text-xs"><span className="text-muted-foreground font-mono">L{i.line}</span> <span className="font-mono">{i.path}</span> {i.message}</div>
                    ))}
                  </CardContent>
                )}
              </Card>
              <SchemaHelp />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="form" className="mt-4">
          {parsed.card && <CardForm value={parsed.card} onChange={setFromForm} lockId />}
          <p className="text-muted-foreground mt-3 text-xs">Form edits regenerate the YAML (comments are dropped). Review it in the Definition tab before saving.</p>
        </TabsContent>

        <TabsContent value="layout" className="mt-4">{parsed.card && <LayoutTab id={id} def={parsed.card} onChange={setFromForm} readOnly={!isAdmin} />}</TabsContent>

        <TabsContent value="references" className="mt-4">{isAdmin && <ReferenceManager family={id} def={c.definition} />}</TabsContent>
      </Tabs>

      {/* sticky save bar */}
      {isAdmin && dirty && (
        <div className="bg-background/95 fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur md:left-[var(--sidebar-width)]">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-3 px-6 py-3">
            <span className="text-sm font-medium">Unsaved changes</span>
            {removedVariants.length > 0 && <Badge variant="outline" className="border-reject/50 text-reject">removes variant {removedVariants.join(", ")} and its reference images</Badge>}
            {roiChanged && <Badge variant="outline">field regions changed — keypoints will be re-extracted</Badge>}
            {parsed.issues.length > 0 && <Badge variant="outline" className="text-reject">{parsed.issues.length} problem(s)</Badge>}
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setDraft(null); saver.setServerIssues([]) }}><RotateCcw /> Discard</Button>
              <Button size="sm" disabled={!parsed.card || saver.saving} onClick={() => doSave(false)}>
                {saver.saving ? <Loader2 className="animate-spin" /> : <Save />} Save {registry ? "(needs force)" : ""}
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!saver.conflict}
        onOpenChange={(o) => !o && saver.setConflict(null)}
        title="This programme is managed in Git"
        description={<><p>{saver.conflict?.message}</p><p>Force the change? The programme moves to API ownership and later registry syncs will no longer update it.</p></>}
        confirmLabel="Force save"
        destructive
        onConfirm={() => doSave(true)}
      />
      <ConfirmDialog
        open={del}
        onOpenChange={setDel}
        destructive
        typeToConfirm={c.family}
        title={`Delete ${c.name}?`}
        description={<>All {c.variants.reduce((a, v) => a + v.reference_images, 0)} reference images and the definition are removed from Qdrant on every replica. Runs already stored are kept.{registry && " Registry-managed: it comes back on the next sync unless its files are removed from Git."}</>}
        confirmLabel="Delete programme"
        onConfirm={async () => {
          const out = await api.deleteCard(c.family, registry)
          invalidate(c.family)
          toast.success(`${c.family} deleted`, { description: `${out.references_deleted} reference images removed${out.note ? ` · ${out.note}` : ""}` })
          nav("/cards")
        }}
      />
    </div>
  )
}

function Overview({ def, view }: { def: CardFamily; view: CardView }) {
  const counts = Object.fromEntries(view.variants.map((v) => [v.id, v.reference_images]))
  const bySide = Object.fromEntries(view.variants.map((v) => [v.id, v.reference_images_by_side]))
  const sides = view.sides ?? effectiveSides(def)
  const two = sides.length > 1
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="gap-3">
        <CardHeader><CardTitle className="text-sm">Identity</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Kv k="Id" v={def.id} mono />
            <Kv k="Country" v={def.country} />
            <Kv k="Issuer" v={def.issuer} />
            <Kv k="Schema version" v={def.schema_version} />
          </div>
          <div>
            <div className="text-muted-foreground mb-1 text-[11px] uppercase">Keywords</div>
            <div className="flex flex-wrap gap-1">
              {def.keywords.map((k) => <Badge key={k} variant="secondary" dir="auto">{k}</Badge>)}
              {def.negative_keywords.map((k) => <Badge key={k} variant="outline" className="text-reject line-through" dir="auto">{k}</Badge>)}
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="gap-3">
        <CardHeader><CardTitle className="text-sm">Variants</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Variant</TableHead><TableHead>Tier words</TableHead><TableHead>Prefix</TableHead>{two ? sides.map((sd) => <TableHead key={sd.id} className="text-right">{sd.id === "back" ? "Back refs" : "Front refs"}</TableHead>) : <TableHead className="text-right">Refs</TableHead>}</TableRow></TableHeader>
            <TableBody>
              {def.variants.map((v) => (
                <TableRow key={v.id}>
                  <TableCell><span className="mr-2 inline-block size-3 rounded-sm border align-middle" style={{ background: rgbHex(v.body_color_rgb) }} />{v.name} <span className="text-muted-foreground font-mono text-xs">{v.id}</span></TableCell>
                  <TableCell className="text-xs" dir="auto">{v.keywords.join(", ") || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{v.number_prefix ?? "—"}</TableCell>
                  {two ? (
                    sides.map((sd) => {
                      const n = bySide[v.id]?.[sd.id] ?? (sd.id === "front" ? counts[v.id] : 0) ?? 0
                      return <TableCell key={sd.id} className={n ? "tabular text-right" : "text-review tabular text-right font-medium"}>{n}</TableCell>
                    })
                  ) : (
                    <TableCell className={counts[v.id] ? "tabular text-right" : "text-review tabular text-right font-medium"}>{counts[v.id] ?? 0}</TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {two && (
        <Card className="gap-3 xl:col-span-2">
          <CardHeader><CardTitle className="text-sm">Sides</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {sides.map((sd) => (
              <div key={sd.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
                <SideBadge side={sd.id} />
                <Badge variant="outline" className={sd.required ? "border-reject/40" : ""}>{sd.required ? "photo required" : "photo optional"}</Badge>
                <span className="text-muted-foreground text-xs">{sd.fields.length ? sd.fields.join(", ") : "identification only"}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <Card className="gap-3">
        <CardHeader><CardTitle className="text-sm">Fields</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Field</TableHead><TableHead>Regex</TableHead><TableHead>Normalise</TableHead><TableHead>Req.</TableHead></TableRow></TableHeader>
            <TableBody>
              {def.fields.map((f) => (
                <TableRow key={f.name}>
                  <TableCell className="text-sm"><span className="flex items-center gap-1.5">{f.name}{two && <SideBadge side={f.side ?? "front"} />}{f.anchor && <span className="text-muted-foreground text-xs">“{f.anchor}”</span>}</span></TableCell>
                  <TableCell className="max-w-56 truncate font-mono text-xs">{f.regex}</TableCell>
                  <TableCell className="text-xs">{f.normalise}{f.script === "arabic" && " · arabic"}</TableCell>
                  <TableCell className="text-xs">{f.required ? "yes" : "no"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card className="gap-3">
        <CardHeader><CardTitle className="text-sm">Rules</CardTitle></CardHeader>
        <CardContent className="space-y-1.5">
          {def.rules.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="w-44 font-mono">{r.type}</span>
              <span className="text-muted-foreground w-28">{r.field}</span>
              {r.critical && <Badge variant="outline" className="text-[10px]">critical</Badge>}
              <span className="text-muted-foreground ml-auto truncate">{r.params && Object.keys(r.params).length ? JSON.stringify(r.params) : RULE_HELP[r.type]}</span>
            </div>
          ))}
          {!def.rules.length && <p className="text-muted-foreground text-sm">No rules.</p>}
        </CardContent>
      </Card>
    </div>
  )
}

function LayoutTab({ id, def, onChange, readOnly }: { id: string; def: CardFamily; onChange: (c: CardFamily) => void; readOnly: boolean }) {
  const { isAdmin } = useConnection()
  const refs = useReferences(id, isAdmin)
  const [variant, setVariant] = React.useState(def.variants[0]?.id)
  const sides: Side[] = def.sides?.length ? def.sides.map((x) => x.id) : ["front"]
  const [side, setSide] = React.useState<Side>(sides[0])
  const v = refs.data?.variants.find((x) => x.id === variant)
  // regions belong to one side and are drawn on a reference image of that side
  const ref = v?.references.find((r) => (r.side ?? "front") === side)
  const sideFields = def.fields.filter((f) => (f.side ?? "front") === side)
  const vd = def.variants.find((x) => x.id === variant)
  const image = ref ? <AuthImage path={api.referenceImagePath(id, ref.ref_id)} alt="reference" /> : <div style={{ background: side === "front" ? rgbHex(vd?.body_color_rgb) : "var(--muted)" }} />
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card>
        <CardHeader>
          <CardTitle>Field layout</CardTitle>
          <CardDescription>Field regions drawn on a real reference image. {readOnly ? "" : "Select a field and drag on the card to redraw its region; then save."}</CardDescription>
          <CardAction className="flex gap-2">
            {sides.length > 1 && (
              <ToggleGroup type="single" variant="outline" size="sm" value={side} onValueChange={(x) => x && setSide(x as Side)} aria-label="side">
                {sides.map((sd) => <ToggleGroupItem key={sd} value={sd} className="px-3 text-xs">{sd === "back" ? "Back" : "Front"}</ToggleGroupItem>)}
              </ToggleGroup>
            )}
            <Select value={variant} onValueChange={setVariant}>
              <SelectTrigger size="sm" className="w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>{def.variants.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
            </Select>
          </CardAction>
        </CardHeader>
        <CardContent>
          {sideFields.length ? (
            <RoiEditor
              key={side}
              image={image}
              fields={sideFields}
              onChange={(changed) => onChange({ ...def, fields: def.fields.map((f) => changed.find((c) => c.name === f.name) ?? f) })}
              readOnly={readOnly}
            />
          ) : (
            <div className="relative">
              <RoiEditor image={image} fields={[]} onChange={() => {}} readOnly />
              <p className="text-muted-foreground mt-2 text-xs">No fields are read from the {side}. It is used for identification only.</p>
            </div>
          )}
          {!ref && <p className="text-review mt-2 text-xs">No {side} reference image for this variant — showing {side === "front" ? "its body colour" : "a placeholder"}. Upload references for an exact layout.</p>}
        </CardContent>
      </Card>
      <Card className="gap-3">
        <CardHeader><CardTitle className="text-sm">Regions</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-xs">
          {def.fields.map((f) => (
            <div key={f.name} className={`flex justify-between gap-2 border-b pb-1.5 last:border-0 ${(f.side ?? "front") !== side ? "opacity-50" : ""}`}>
              <span className="flex items-center gap-1">{f.name}{sides.length > 1 && <SideBadge side={f.side ?? "front"} />}</span>
              <span className="text-muted-foreground font-mono">{f.roi.map((x) => x.toFixed(2)).join(", ")}</span>
            </div>
          ))}
          <p className="text-muted-foreground pt-2">Photos are aligned to the reference (ORB + RANSAC homography) before fields are read, so regions are relative to the reference card, not the photo.</p>
        </CardContent>
      </Card>
    </div>
  )
}

function SchemaHelp() {
  return (
    <Card className="gap-3">
      <CardHeader><CardTitle className="text-sm">Schema reference</CardTitle></CardHeader>
      <CardContent className="text-muted-foreground space-y-1.5 text-xs">
        <p><span className="text-foreground font-mono">id</span> cc.name, e.g. ae.fazaa · <span className="text-foreground font-mono">country</span> ISO alpha-2</p>
        <p><span className="text-foreground font-mono">variants[]</span> id, name, body_color_rgb [r,g,b], keywords, number_prefix</p>
        <p><span className="text-foreground font-mono">fields[]</span> name, roi [x0,y0,x1,y1], regex, required, normalise (digits, upper, alnum, date_mm_yy, date_dd_mm_yyyy, emirates_id, none), anchor, script (latin | arabic)</p>
        <p><span className="text-foreground font-mono">rules[]</span> type (regex, not_expired, emirates_id_format, luhn, prefix_matches_variant, length, lookup, date_order), field, critical, params</p>
      </CardContent>
    </Card>
  )
}
