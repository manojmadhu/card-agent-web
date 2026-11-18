import * as React from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { AlertTriangle, CheckCircle2, Download, Eye, History, RotateCcw, Save, ScanLine, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { YamlEditor } from "@/components/yaml-editor"
import { FamilyForm, TemplatePreview } from "@/components/family-form"
import { RefGallery } from "@/components/ref-gallery"
import { useDeleteFamily, useFamilyFile, useFamilyHistory, useInfo, useRefs, useSaveFamily } from "@/api/hooks"
import { request } from "@/api/client"
import type { HistoryEntry } from "@/api/types"
import { familyToYaml, parseFamilyYaml } from "@/lib/schema"
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
  const qc = useQueryClient()
  const file = useFamilyFile(id)
  const history = useFamilyHistory(id)
  const { data: refs } = useRefs(id)
  const info = useInfo()
  const save = useSaveFamily()
  const del = useDeleteFamily()
  const saved = file.data?.yaml
  const [draft, setDraft] = React.useState<string | null>(null)
  const [tab, setTab] = React.useState("yaml")
  const [previewVariant, setPreviewVariant] = React.useState<string>()
  const [serverError, setServerError] = React.useState<string | null>(null)
  const isAdmin = info.data?.auth.role === "admin"

  // initialise the draft once the file arrives (and when navigating between families)
  React.useEffect(() => setDraft(null), [id])
  React.useEffect(() => {
    if (saved != null && draft == null) setDraft(saved)
  }, [saved, draft])

  const text = draft ?? ""
  const parsed = React.useMemo(() => parseFamilyYaml(text), [text])
  const dirty = draft != null && saved != null && draft !== saved
  const diff = React.useMemo(() => lineDiff(saved ?? "", text), [saved, text])
  const idChanged = parsed.family && parsed.family.family !== id

  React.useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", h)
    return () => window.removeEventListener("beforeunload", h)
  }, [dirty])

  if (file.isLoading) return <Skeleton className="mx-auto h-[600px] max-w-[1400px]" />
  if (file.error)
    return (
      <Card className="mx-auto max-w-lg text-center">
        <CardHeader><CardTitle>{(file.error as { status?: number }).status === 404 ? `Family “${id}” not found` : "Could not load the family"}</CardTitle><CardDescription>{file.error.message}</CardDescription></CardHeader>
        <CardContent><Button asChild><Link to="/registry">Back to families</Link></Button></CardContent>
      </Card>
    )

  const doSave = () => {
    if (!parsed.family) return toast.error("Fix the YAML errors first")
    if (idChanged) return toast.error("The family id can't be changed here", { description: "Create a new family with the new id instead (Add card family → copy layout)." })
    setServerError(null)
    save.mutate(
      { id, yaml: text },
      {
        onSuccess: (r) => {
          setDraft(text)
          toast.success(r.changed ? `${id}.yaml saved` : "No changes to save", { description: r.changed ? `Registry hot-reloaded · version ${r.registry_version}` : undefined })
        },
        onError: (e) => {
          setServerError(e.message)
          toast.error("The service rejected the YAML", { description: e.message })
        },
      }
    )
  }

  const loadVersion = async (h: HistoryEntry) => {
    try {
      const v = await qc.fetchQuery({ queryKey: ["families", id, "history", h.version], queryFn: () => request<{ yaml: string }>(`/v1/registry/families/${encodeURIComponent(id)}/history/${h.version}`) })
      setDraft(v.yaml)
      setTab("yaml")
      toast.info("Older version loaded into the editor", { description: "Review it, then Save to restore it." })
    } catch (e) {
      toast.error("Could not load that version", { description: (e as Error).message })
    }
  }

  const fam = parsed.family

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight">
            {fam?.family_name ?? id}
            <Badge variant="outline" className="font-mono">registry/{id}.yaml</Badge>
            {file.data && !file.data.loaded && <Badge variant="outline" className="text-reject">not loaded</Badge>}
            {dirty && <Badge variant="secondary">unsaved · +{diff.added} −{diff.removed}</Badge>}
          </h2>
          <p className="text-muted-foreground text-sm">
            {fam ? `${fam.variants.length} variants · ${fam.fields.length} fields · ${fam.rules.length} rules · ${refs?.length ?? 0} reference images` : "Fix the YAML errors to load this family"}
            {file.data && <> · saved {new Date(file.data.updated_at).toLocaleString()}</>}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild><Link to="/validate"><ScanLine /> Test a card</Link></Button>
          <Button variant="outline" size="sm" onClick={() => downloadText(`${id}.yaml`, text)}><Download /> Download</Button>
          <Button variant="outline" size="sm" disabled={!dirty} onClick={() => setDraft(saved ?? "")}><RotateCcw /> Revert</Button>
          <Button size="sm" disabled={!dirty || !fam || save.isPending || !isAdmin} onClick={doSave} title={isAdmin ? undefined : "Saving needs the admin key"}>
            <Save /> {save.isPending ? "Saving…" : "Save & reload"}
          </Button>
        </div>
      </div>

      {file.data?.error && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>The service could not load this file</AlertTitle>
          <AlertDescription className="font-mono text-xs">{file.data.error}</AlertDescription>
        </Alert>
      )}
      {serverError && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Save rejected</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}
      {idChanged && (
        <Alert>
          <AlertTriangle />
          <AlertTitle>family id changed to “{parsed.family!.family}”</AlertTitle>
          <AlertDescription>Ids are the file name and the reference folder, so they can't be renamed in place. Set it back to “{id}”, or create a new family.</AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="yaml">YAML</TabsTrigger>
          <TabsTrigger value="form" disabled={!fam}>Form editor</TabsTrigger>
          <TabsTrigger value="refs">Reference cards</TabsTrigger>
          <TabsTrigger value="history"><History /> History</TabsTrigger>
        </TabsList>

        <TabsContent value="yaml" className="mt-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
            <YamlEditor value={text} onChange={setDraft} height="640px" />
            <div className="space-y-4">
              <Card className="gap-3">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    {parsed.issues.length ? <AlertTriangle className="text-reject size-4" /> : <CheckCircle2 className="text-accept size-4" />}
                    {parsed.issues.length ? `${parsed.issues.length} validation error(s)` : "Schema valid"}
                  </CardTitle>
                  <CardDescription>Checked live as you type; the service validates again before it writes the file.</CardDescription>
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
                    <CardTitle className="text-sm">Layout preview</CardTitle>
                    <CardDescription>This draft's field ROIs over an enrolled reference card</CardDescription>
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
            </div>
          </div>
        </TabsContent>

        <TabsContent value="form" className="mt-4">
          {fam && (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
              <FamilyForm value={fam} onChange={(f) => setDraft(familyToYaml(f))} lockId />
              <div className="space-y-2 xl:sticky xl:top-4 xl:self-start">
                <TemplatePreview family={fam} variantId={previewVariant} />
                <p className="text-muted-foreground text-xs">Form edits regenerate the YAML (comments are not kept). Check the YAML tab before saving.</p>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="refs" className="mt-4">
          {file.data?.loaded ? <RefGallery familyId={id} /> : <p className="text-muted-foreground text-sm">Reference images can be managed once the family loads on the service.</p>}
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Previous versions</CardTitle>
              <CardDescription>The service keeps a copy of the file before every save (registry/.history/{id}/). Load one into the editor, review it, and save to restore.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {history.isLoading && <Skeleton className="h-16 w-full" />}
              {history.data?.map((h, i) => (
                <div key={h.version} className="flex items-center gap-3 rounded-lg border p-3">
                  <Badge variant="outline" className="font-mono">{i === 0 ? "previous" : `−${i + 1}`}</Badge>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">{new Date(h.saved_at).toLocaleString()}</div>
                    <div className="text-muted-foreground font-mono text-[11px]">{h.version} · {h.size} bytes</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => loadVersion(h)}><Eye /> Load into editor</Button>
                </div>
              ))}
              {history.data?.length === 0 && <p className="text-muted-foreground text-sm">No earlier versions yet — they appear after the first save.</p>}
            </CardContent>
          </Card>
          <Card className="border-reject/30">
            <CardHeader>
              <CardTitle className="text-sm">Danger zone</CardTitle>
              <CardDescription>Removing a family stops the agent recognising these cards — they will be rejected as unknown. The YAML and reference images are moved to registry/.trash on the service.</CardDescription>
              <CardAction>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="text-reject" disabled={!isAdmin || del.isPending}><Trash2 /> Delete family</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {id}.yaml?</AlertDialogTitle>
                      <AlertDialogDescription>The family and its reference images are removed from the live registry immediately.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => del.mutate(id, { onSuccess: () => { toast.success(`${id} removed from the registry`); nav("/registry") } })}>Delete</AlertDialogAction>
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
