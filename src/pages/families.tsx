import { Link, useNavigate } from "react-router-dom"
import { AlertTriangle, Download, FileUp, Pencil, Plus } from "lucide-react"
import { toast } from "sonner"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { AuthImage, refImagePath } from "@/components/auth-image"
import { useFamilies, useFamilyFiles, useRefs, useSaveFamily, useStats } from "@/api/hooks"
import { parseFamilyYaml } from "@/lib/schema"
import { rgbHex } from "@/lib/color"

export function downloadText(name: string, text: string) {
  const a = document.createElement("a")
  a.href = URL.createObjectURL(new Blob([text], { type: "application/yaml" }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export default function FamiliesPage() {
  const { families, invalid, isLoading, error } = useFamilies()
  const files = useFamilyFiles()
  const { data: refs } = useRefs()
  const { data: stats } = useStats(null)
  const save = useSaveFamily()
  const nav = useNavigate()

  const importYaml = async (file?: File) => {
    if (!file) return
    const text = await file.text()
    const p = parseFamilyYaml(text)
    if (!p.family) return toast.error("Not a valid card family", { description: p.issues.slice(0, 3).map((i) => `line ${i.line}: ${i.message}`).join(" · ") })
    save.mutate(
      { id: p.family.family, yaml: text, create: true },
      {
        onSuccess: () => {
          toast.success(`Imported ${p.family!.family_name}`, { description: "Saved on the service and hot-reloaded" })
          nav(`/registry/${p.family!.family}`)
        },
        onError: (e) => toast.error("Import rejected by the service", { description: e.message }),
      }
    )
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Card families</h2>
          <p className="text-muted-foreground text-sm">One YAML file per family on the service. Adding a card = YAML + reference images; the registry hot-reloads with no redeploy.</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" asChild disabled={save.isPending}>
            <label className="cursor-pointer">
              <FileUp /> Import YAML
              <input type="file" accept=".yaml,.yml" className="hidden" onChange={(e) => { importYaml(e.target.files?.[0]); e.target.value = "" }} />
            </label>
          </Button>
          <Button size="sm" asChild><Link to="/registry/new"><Plus /> Add card family</Link></Button>
        </div>
      </div>

      {error && <p className="text-reject text-sm">{error.message}</p>}
      {invalid.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>{invalid.length} family file(s) are not loaded by the service</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {invalid.map((x) => <li key={x.id}><Link to={`/registry/${x.id}`} className="font-mono underline">{x.id}.yaml</Link> — {x.error}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[340px] rounded-xl" />)}
        {families.map((f) => {
          const famRefs = (refs ?? []).filter((r) => r.family === f.family)
          const st = stats?.by_family.find((x) => x.family === f.family)
          const total = st ? st.ACCEPT + st.REVIEW + st.REJECT : 0
          const file = files.data?.find((x) => x.family === f.family)
          return (
            <Card key={f.family} className="overflow-hidden pt-0">
              <div className="bg-muted/40 grid grid-cols-3 gap-1 border-b p-2">
                {f.variants.slice(0, 3).map((v) => {
                  const t = famRefs.find((r) => r.variant === v.id)
                  return t ? <AuthImage key={v.id} path={refImagePath(t.id, 240)} className="aspect-[1012/638] w-full rounded object-cover" /> : <div key={v.id} className="aspect-[1012/638] rounded" style={{ background: rgbHex(v.body_color_rgb) }} />
                })}
              </div>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">{f.family_name} <Badge variant="outline" className="font-mono text-[10px]">{f.family}.yaml</Badge></CardTitle>
                <CardDescription>{f.issuer || "—"}</CardDescription>
                <CardAction>
                  <Button size="icon" variant="ghost" className="size-8" disabled={!file} onClick={() => file && downloadText(`${f.family}.yaml`, file.yaml)} aria-label="Download YAML"><Download /></Button>
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {f.variants.map((v) => (
                    <Tooltip key={v.id}>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="gap-1.5">
                          <span className="size-2.5 rounded-full border" style={{ background: rgbHex(v.body_color_rgb) }} />
                          {v.id}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>{v.name} · prefix “{v.number_prefix || "—"}” · {v.keywords.join(", ") || "no keywords"}</TooltipContent>
                    </Tooltip>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1">
                  {f.keywords.map((k) => <Badge key={k} variant="secondary" className="text-[11px]" dir="auto">{k}</Badge>)}
                  {f.negative_keywords.map((k) => <Badge key={k} variant="outline" className="text-reject text-[11px] line-through" dir="auto">{k}</Badge>)}
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <Stat k="variants" v={f.variants.length} />
                  <Stat k="fields" v={f.fields.length} />
                  <Stat k="rules" v={f.rules.length} />
                  <Stat k="refs" v={famRefs.length} warn={famRefs.length < f.variants.length * 5} />
                </div>
              </CardContent>
              <CardFooter className="justify-between border-t pt-4">
                <span className="text-muted-foreground text-xs">{total ? `${total} runs · ${Math.round(((st?.ACCEPT ?? 0) / total) * 100)}% accepted` : "no runs yet"}</span>
                <Button size="sm" variant="outline" asChild><Link to={`/registry/${f.family}`}><Pencil /> Manage</Link></Button>
              </CardFooter>
            </Card>
          )
        })}
        {!isLoading && (
          <Link to="/registry/new" className="hover:bg-accent/50 text-muted-foreground flex min-h-[300px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed transition-colors">
            <Plus className="size-6" />
            <span className="text-sm font-medium">Add a new card family</span>
            <span className="text-xs">Guided form → YAML → reference images</span>
          </Link>
        )}
      </div>
    </div>
  )
}

function Stat({ k, v, warn }: { k: string; v: number; warn?: boolean }) {
  return (
    <div className={`rounded-md border py-1.5 ${warn ? "border-review/50" : ""}`} title={warn ? "fewer than 5 reference images per variant" : undefined}>
      <div className="tabular text-base font-semibold">{v}</div>
      <div className="text-muted-foreground text-[10px] uppercase">{k}</div>
    </div>
  )
}
