import { Link, useNavigate } from "react-router-dom"
import { Download, FileUp, Plus, Pencil, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useStore } from "@/store"
import { parseFamilyYaml } from "@/engine/schema"
import { rgbHex } from "@/engine/vision"

export function downloadText(name: string, text: string) {
  const a = document.createElement("a")
  a.href = URL.createObjectURL(new Blob([text], { type: "application/yaml" }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

export default function FamiliesPage() {
  const { families, yamls, index, runs, invalid, saveFamily } = useStore()
  const nav = useNavigate()

  const importYaml = (file?: File) => {
    if (!file) return
    file.text().then((t) => {
      const p = parseFamilyYaml(t)
      if (!p.family) return toast.error("YAML is not a valid card family", { description: p.issues.slice(0, 3).map((i) => `line ${i.line}: ${i.message}`).join(" · ") })
      if (yamls[p.family.family]) return toast.error(`Family "${p.family.family}" already exists — edit it instead`)
      saveFamily(p.family.family, t, `Imported from ${file.name}`)
      toast.success(`Imported ${p.family.family_name}`)
      nav(`/registry/${p.family.family}`)
    })
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Card families</h2>
          <p className="text-muted-foreground text-sm">One YAML file per family. Adding a card = YAML + reference images; the registry hot-reloads.</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <label className="cursor-pointer">
              <FileUp /> Import YAML
              <input type="file" accept=".yaml,.yml" className="hidden" onChange={(e) => importYaml(e.target.files?.[0])} />
            </label>
          </Button>
          <Button size="sm" asChild><Link to="/registry/new"><Plus /> Add card family</Link></Button>
        </div>
      </div>

      {invalid.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>{invalid.length} family file(s) fail validation and are not loaded</AlertTitle>
          <AlertDescription>
            {invalid.map((id) => <Link key={id} to={`/registry/${id}`} className="underline">{id}.yaml</Link>)}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {families.map((f) => {
          const refs = index.filter((r) => r.family === f.family)
          const fr = runs.filter((r) => r.result.card.family === f.family)
          const acc = fr.filter((r) => r.result.status === "ACCEPT").length
          return (
            <Card key={f.family} className="overflow-hidden pt-0">
              <div className="bg-muted/40 grid grid-cols-3 gap-1 border-b p-2">
                {f.variants.slice(0, 3).map((v) => {
                  const t = refs.find((r) => r.variant === v.id)
                  return t ? <img key={v.id} src={t.thumb} className="aspect-[1012/638] w-full rounded object-cover" /> : <div key={v.id} className="aspect-[1012/638] rounded" style={{ background: rgbHex(v.body_color_rgb as [number, number, number]) }} />
                })}
              </div>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">{f.family_name} <Badge variant="outline" className="font-mono text-[10px]">{f.family}.yaml</Badge></CardTitle>
                <CardDescription>{f.issuer || "—"}</CardDescription>
                <CardAction>
                  <Button size="icon" variant="ghost" className="size-8" onClick={() => downloadText(`${f.family}.yaml`, yamls[f.family])} aria-label="Download YAML"><Download /></Button>
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {f.variants.map((v) => (
                    <Tooltip key={v.id}>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="gap-1.5">
                          <span className="size-2.5 rounded-full border" style={{ background: rgbHex(v.body_color_rgb as [number, number, number]) }} />
                          {v.id}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>{v.name} · prefix “{v.number_prefix}” · {v.keywords.join(", ")}</TooltipContent>
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
                  <Stat k="refs" v={refs.length} />
                </div>
              </CardContent>
              <CardFooter className="justify-between border-t pt-4">
                <span className="text-muted-foreground text-xs">{fr.length ? `${fr.length} runs · ${Math.round((acc / fr.length) * 100)}% accepted` : "no runs yet"}</span>
                <Button size="sm" variant="outline" asChild><Link to={`/registry/${f.family}`}><Pencil /> Manage</Link></Button>
              </CardFooter>
            </Card>
          )
        })}
        <Link to="/registry/new" className="hover:bg-accent/50 text-muted-foreground flex min-h-[300px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed transition-colors">
          <Plus className="size-6" />
          <span className="text-sm font-medium">Add a new card family</span>
          <span className="text-xs">Guided form → YAML → reference images</span>
        </Link>
      </div>
    </div>
  )
}

function Stat({ k, v }: { k: string; v: number }) {
  return (
    <div className="rounded-md border py-1.5">
      <div className="tabular text-base font-semibold">{v}</div>
      <div className="text-muted-foreground text-[10px] uppercase">{k}</div>
    </div>
  )
}
