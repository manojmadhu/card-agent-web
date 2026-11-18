import * as React from "react"
import { useNavigate, useParams, Link } from "react-router-dom"
import { AlertTriangle, CheckCircle2, Download, History, RotateCcw, Save, Trash2, Play, Server } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardAction } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { YamlEditor } from "@/components/yaml-editor"
import { FamilyForm, TemplatePreview } from "@/components/family-form"
import { RefGallery } from "@/components/ref-gallery"
import { useStore } from "@/store"
import { familyToYaml, parseFamilyYaml } from "@/engine/schema"
import { apiPutFamily, apiReload } from "@/engine/api"
import { SAMPLE_CASES } from "@/engine/samples"
import { downloadText } from "./families"

function lineDiff(a: string, b: string) {
  const A = a.split("\n"),
    B = new Set(b.split("\n"))
  const As = new Set(A)
  return { added: b.split("\n").filter((l) => !As.has(l)).length, removed: A.filter((l) => !B.has(l)).length }
}

export default function FamilyEditorPage() {
  const { id = "" } = useParams()
  const nav = useNavigate()
  const { yamls, history, saveFamily, deleteFamily, settings, index } = useStore()
  const saved = yamls[id]
  const [draft, setDraft] = React.useState(saved ?? "")
  const [tab, setTab] = React.useState("yaml")
  const [previewVariant, setPreviewVariant] = React.useState<string>()
  React.useEffect(() => setDraft(yamls[id] ?? ""), [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const parsed = React.useMemo(() => parseFamilyYaml(draft), [draft])
  const dirty = draft !== saved
  const diff = React.useMemo(() => lineDiff(saved ?? "", draft), [saved, draft])

  if (saved == null)
    return (
      <Card className="mx-auto max-w-lg text-center">
        <CardHeader><CardTitle>Family “{id}” not found</CardTitle></CardHeader>
        <CardContent><Button asChild><Link to="/registry">Back to families</Link></Button></CardContent>
      </Card>
    )

  const save = async () => {
    const r = saveFamily(id, draft)
    if (!r.ok) return toast.error("Not saved", { description: r.error })
    const newId = parsed.family!.family
    toast.success(`${newId}.yaml saved`, { description: "Registry re-indexing with the new definition" })
    if (settings.mode === "api") {
      try {
        await apiPutFamily(settings.api_base, newId, draft)
        await apiReload(settings.api_base)
        toast.success("Pushed to card-agent service and hot-reloaded")
      } catch (e) {
        toast.error("Saved locally, but the service rejected it", { description: (e as Error).message })
      }
    }
    if (newId !== id) nav(`/registry/${newId}`, { replace: true })
  }

  const fam = parsed.family
  const samples = SAMPLE_CASES.filter((s) => s.family === id)

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            {fam?.family_name ?? id}
            <Badge variant="outline" className="font-mono">registry/{id}.yaml</Badge>
            {dirty && <Badge variant="secondary">unsaved · +{diff.added} −{diff.removed}</Badge>}
          </h2>
          <p className="text-muted-foreground text-sm">{fam ? `${fam.variants.length} variants · ${fam.fields.length} fields · ${fam.rules.length} rules · ${index.filter((r) => r.family === id).length} reference images` : "Fix the YAML errors to load this family"}</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {samples[0] && (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/validate?sample=${samples[0].id}`}><Play /> Test with a sample</Link>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => downloadText(`${id}.yaml`, draft)}><Download /> Download</Button>
          <Button variant="outline" size="sm" disabled={!dirty} onClick={() => setDraft(saved)}><RotateCcw /> Revert</Button>
          <Button size="sm" disabled={!dirty || !fam} onClick={save}><Save /> Save &amp; reload</Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="yaml">YAML</TabsTrigger>
          <TabsTrigger value="form" disabled={!fam}>Form editor</TabsTrigger>
          <TabsTrigger value="refs">Reference cards</TabsTrigger>
          <TabsTrigger value="history"><History /> History</TabsTrigger>
        </TabsList>

        <TabsContent value="yaml" className="mt-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
            <YamlEditor value={draft} onChange={setDraft} height="640px" />
            <div className="space-y-4">
              <Card className="gap-3">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    {parsed.issues.length ? <AlertTriangle className="text-reject size-4" /> : <CheckCircle2 className="text-accept size-4" />}
                    {parsed.issues.length ? `${parsed.issues.length} validation error(s)` : "Schema valid"}
                  </CardTitle>
                  <CardDescription>Checked live against the registry schema (same rules the service applies on load).</CardDescription>
                </CardHeader>
                {parsed.issues.length > 0 && (
                  <CardContent className="space-y-1">
                    {parsed.issues.slice(0, 8).map((i, k) => (
                      <div key={k} className="text-xs"><span className="text-muted-foreground font-mono">L{i.line}</span> <span className="font-mono">{i.path}</span> {i.message}</div>
                    ))}
                  </CardContent>
                )}
              </Card>
              {fam && (
                <Card className="gap-3">
                  <CardHeader>
                    <CardTitle className="text-sm">Template preview</CardTitle>
                    <CardDescription>Synthetic render with the field ROIs from this draft</CardDescription>
                    <CardAction>
                      <Select value={previewVariant ?? fam.variants[0].id} onValueChange={setPreviewVariant}>
                        <SelectTrigger size="sm" className="w-[130px]"><SelectValue /></SelectTrigger>
                        <SelectContent>{fam.variants.map((v) => <SelectItem key={v.id} value={v.id}>{v.id}</SelectItem>)}</SelectContent>
                      </Select>
                    </CardAction>
                  </CardHeader>
                  <CardContent><TemplatePreview family={fam} variantId={previewVariant} /></CardContent>
                </Card>
              )}
              {settings.mode === "api" && (
                <p className="text-muted-foreground flex items-center gap-1.5 text-xs"><Server className="size-3.5" /> Save also PUTs the YAML to {settings.api_base}/registry/families/{id} and triggers a reload.</p>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="form" className="mt-4">
          {fam && (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
              <FamilyForm value={fam} onChange={(f) => setDraft(familyToYaml(f))} />
              <div className="space-y-2 xl:sticky xl:top-4 xl:self-start">
                <TemplatePreview family={fam} variantId={previewVariant} />
                <p className="text-muted-foreground text-xs">Form edits regenerate the YAML (comments are not preserved). Switch to the YAML tab to review before saving.</p>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="refs" className="mt-4">
          {fam ? <RefGallery familyId={id} /> : <p className="text-muted-foreground text-sm">Fix the YAML first.</p>}
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Saved versions</CardTitle>
              <CardDescription>Every save is kept so a bad change can be rolled back.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(history[id] ?? []).map((h, i) => (
                <div key={h.version + i} className="flex items-center gap-3 rounded-lg border p-3">
                  <Badge variant={i === 0 ? "default" : "outline"} className="font-mono">{h.version}</Badge>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">{h.note}</div>
                    <div className="text-muted-foreground text-xs">{new Date(h.at).toLocaleString()}</div>
                  </div>
                  {i === 0 ? <span className="text-muted-foreground text-xs">current</span> : (
                    <Button size="sm" variant="outline" onClick={() => { setDraft(h.yaml); setTab("yaml"); toast.info("Version loaded into the editor — review and save to restore") }}>
                      <RotateCcw /> Restore
                    </Button>
                  )}
                </div>
              ))}
              {!(history[id] ?? []).length && <p className="text-muted-foreground text-sm">No saved versions yet.</p>}
            </CardContent>
          </Card>
          <Card className="border-reject/30">
            <CardHeader>
              <CardTitle className="text-sm">Danger zone</CardTitle>
              <CardDescription>Removing a family stops the agent from recognising these cards — they will be rejected as unknown.</CardDescription>
              <CardAction>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="text-reject"><Trash2 /> Delete family</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {id}.yaml?</AlertDialogTitle>
                      <AlertDialogDescription>The YAML and its uploaded reference images are removed from this console and the registry is reloaded.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => { deleteFamily(id); toast.success(`${id} removed`); nav("/registry") }}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardAction>
            </CardHeader>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
