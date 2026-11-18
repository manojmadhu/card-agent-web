import * as React from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, ArrowRight, Check, ImagePlus, X } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { FamilyForm, TemplatePreview } from "@/components/family-form"
import { YamlEditor } from "@/components/yaml-editor"
import { useFamilies, useFamilyFiles, useSaveFamily, useUploadRefs } from "@/api/hooks"
import { familyToYaml, parseFamilyYaml, type Family } from "@/lib/schema"
import { rgbHex } from "@/lib/color"
import { cn } from "@/lib/utils"

const STEPS = [
  { id: "identity", title: "Identity", desc: "Name, issuer, keywords" },
  { id: "variants", title: "Variants", desc: "Tiers, colours, prefixes" },
  { id: "fields", title: "Fields & layout", desc: "ROIs and formats" },
  { id: "rules", title: "Rules", desc: "What makes a card valid" },
  { id: "refs", title: "Reference cards", desc: "Photos to match against" },
  { id: "review", title: "Review YAML", desc: "Check and create" },
] as const

const blank = (): Family => ({
  family: "",
  family_name: "",
  issuer: "",
  schema_version: 1,
  keywords: [],
  negative_keywords: [],
  weights: { text: 0.55, visual: 0.3, colour: 0.15 },
  variants: [
    { id: "classic", name: "Classic", body_color_rgb: [20, 120, 90], keywords: ["CLASSIC"], number_prefix: "1" },
    { id: "gold", name: "Gold", body_color_rgb: [200, 160, 50], keywords: ["GOLD", "ذهبية"], number_prefix: "2" },
  ],
  fields: [
    { name: "holder_name", roi: [0.05, 0.6, 0.75, 0.72], regex: "^[A-Z][A-Z .'-]{2,40}$", required: true, normalise: "upper", anchor: null },
    { name: "card_number", roi: [0.05, 0.42, 0.75, 0.55], regex: "^\\d{10}$", required: true, normalise: "digits", anchor: null },
    { name: "expiry_date", roi: [0.05, 0.76, 0.5, 0.88], regex: "^(0[1-9]|1[0-2])/(\\d{2}|\\d{4})$", required: true, normalise: "date_mm_yy", anchor: "EXP" },
  ],
  rules: [
    { type: "regex", field: "card_number", critical: true },
    { type: "regex", field: "holder_name", critical: false },
    { type: "not_expired", field: "expiry_date", critical: true },
    { type: "prefix_matches_variant", field: "card_number", critical: false },
  ],
})

interface Pending {
  key: string
  variant: string
  file: File
  url: string
}

export default function NewFamilyPage() {
  const { families } = useFamilies()
  const files = useFamilyFiles()
  const save = useSaveFamily()
  const upload = useUploadRefs()
  const nav = useNavigate()
  const [step, setStep] = React.useState(0)
  const [fam, setFam] = React.useState<Family>(blank)
  const [yaml, setYaml] = React.useState("")
  const [pending, setPending] = React.useState<Pending[]>([])
  const [creating, setCreating] = React.useState<{ done: number; total: number } | null>(null)
  const exists = (id: string) => !!files.data?.some((f) => f.family === id)

  React.useEffect(() => () => pending.forEach((p) => URL.revokeObjectURL(p.url)), []) // eslint-disable-line react-hooks/exhaustive-deps

  // keep variant display names in sync with the family name while the user hasn't customised them
  const setFamily = (f: Family) => {
    if (f.family_name !== fam.family_name) f = { ...f, variants: f.variants.map((v) => (v.name.startsWith(fam.family_name) || !fam.family_name ? { ...v, name: `${f.family_name} ${v.id[0]?.toUpperCase() ?? ""}${v.id.slice(1)}` } : v)) }
    setFam(f)
  }

  const issues = parseFamilyYaml(familyToYaml(fam)).issues
  const stepIssues = (i: number) => {
    const k = ["", "variants", "fields", "rules"][i]
    if (i === 0) {
      const out: string[] = []
      if (!fam.family) out.push("family id is required")
      else if (exists(fam.family)) out.push(`family id “${fam.family}” already exists on the service`)
      if (!fam.family_name) out.push("display name is required")
      if (!fam.keywords.length) out.push("add at least one keyword")
      return out.concat(issues.filter((x) => x.path.startsWith("weights")).map((x) => x.message))
    }
    if (i >= 4) return []
    return issues.filter((x) => x.path.startsWith(k)).map((x) => `${x.path}: ${x.message}`)
  }
  const cur = stepIssues(step)

  const next = () => {
    if (cur.length) return toast.error(cur[0])
    if (step === 4) setYaml(familyToYaml(fam, `# ${fam.family_name} — created in Card Agent Console ${new Date().toISOString().slice(0, 10)}\n# Calibrate colours / ROIs / formats with real, consented samples before production.`))
    setStep((s) => Math.min(STEPS.length - 1, s + 1))
  }

  const addFiles = (variant: string, list: FileList | null) => {
    if (!list) return
    const ok = Array.from(list).filter((f) => /^image\/(png|jpe?g)$/.test(f.type) && f.size <= 8 * 1024 * 1024)
    if (ok.length < list.length) toast.warning(`${list.length - ok.length} file(s) skipped — JPEG/PNG up to 8 MB only`)
    setPending((p) => [...p, ...ok.map((file) => ({ key: `${variant}:${file.name}:${file.size}:${Math.random()}`, variant, file, url: URL.createObjectURL(file) }))])
  }

  const create = async () => {
    const p = parseFamilyYaml(yaml)
    if (!p.family) return toast.error("YAML has errors", { description: p.issues[0]?.message })
    const id = p.family.family
    const byVariant: Record<string, Pending[]> = {}
    for (const x of pending) if (p.family.variants.some((v) => v.id === x.variant)) (byVariant[x.variant] ??= []).push(x)
    const groups = Object.entries(byVariant)
    setCreating({ done: 0, total: groups.length + 1 })
    try {
      await save.mutateAsync({ id, yaml, create: true })
    } catch (e) {
      setCreating(null)
      return toast.error("The service rejected the family", { description: (e as Error).message })
    }
    let failed = 0
    for (const [i, [variant, items]] of groups.entries()) {
      setCreating({ done: i + 1, total: groups.length + 1 })
      try {
        await upload.mutateAsync({ family: id, variant, files: items.map((x) => x.file) })
      } catch {
        failed++
      }
    }
    setCreating(null)
    toast.success(`${p.family.family_name} added to the registry`, { description: failed ? `${failed} reference upload(s) failed — add them from the family page.` : "The agent can now recognise this card." })
    nav(`/registry/${id}`)
  }

  return (
    <div className="mx-auto max-w-[1300px] space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Add a card family</h2>
        <p className="text-muted-foreground text-sm">Creates <span className="font-mono">registry/{fam.family || "<id>"}.yaml</span> and reference images on the service — no code change, no redeploy.</p>
      </div>

      <ol className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {STEPS.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              className={cn("flex w-full items-center gap-2 rounded-lg border p-2.5 text-left transition-colors", i === step && "border-foreground/40 bg-accent", i < step && "hover:bg-accent/60", i > step && "opacity-60")}
            >
              <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold", i < step && "bg-primary text-primary-foreground border-primary")}>{i < step ? <Check className="size-3.5" /> : i + 1}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{s.title}</span>
                <span className="text-muted-foreground block truncate text-[11px]">{s.desc}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-4">
          {step === 0 && (
            <>
              <Card className="gap-3">
                <CardHeader>
                  <CardTitle className="text-sm">Start from</CardTitle>
                  <CardDescription>Copy the layout of an existing family, then change what differs.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setFam({ ...blank(), family: fam.family, family_name: fam.family_name })}>Generic template</Button>
                  {families.map((f) => (
                    <Button key={f.family} size="sm" variant="outline" onClick={() => setFam({ ...structuredClone(f), family: fam.family, family_name: fam.family_name, issuer: fam.issuer, keywords: fam.keywords, negative_keywords: [...new Set([...f.keywords.slice(0, 2), ...fam.negative_keywords])] })}>
                      Copy layout of {f.family_name}
                    </Button>
                  ))}
                </CardContent>
              </Card>
              <FamilyForm value={fam} onChange={setFamily} sections={["identity"]} />
            </>
          )}
          {step === 1 && <FamilyForm value={fam} onChange={setFam} sections={["variants"]} />}
          {step === 2 && <FamilyForm value={fam} onChange={setFam} sections={["fields"]} />}
          {step === 3 && <FamilyForm value={fam} onChange={setFam} sections={["rules"]} />}
          {step === 4 && (
            <Card>
              <CardHeader>
                <CardTitle>Reference cards</CardTitle>
                <CardDescription>Add 5–20 clean, consented photos per variant. They are uploaded after the family is created; the service locates and straightens each card. You can also add them later.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {fam.variants.map((v) => {
                  const mine = pending.filter((p) => p.variant === v.id)
                  return (
                    <div key={v.id} className="space-y-2 rounded-lg border p-3">
                      <div className="flex items-center gap-2">
                        <span className="size-3 rounded-sm border" style={{ background: rgbHex(v.body_color_rgb) }} />
                        <span className="text-sm font-medium">{v.name}</span>
                        <Badge variant="outline" className="font-mono text-[10px]">refs/{fam.family}/{v.id}/</Badge>
                        <span className={cn("text-xs", mine.length < 5 ? "text-review" : "text-muted-foreground")}>{mine.length} photo(s)</span>
                        <Button size="sm" variant="outline" className="ml-auto" asChild>
                          <label className="cursor-pointer"><ImagePlus /> Add<input type="file" multiple accept="image/jpeg,image/png" className="hidden" onChange={(e) => { addFiles(v.id, e.target.files); e.target.value = "" }} /></label>
                        </Button>
                      </div>
                      {mine.length > 0 && (
                        <div className="grid grid-cols-4 gap-2 md:grid-cols-6">
                          {mine.map((p) => (
                            <div key={p.key} className="group relative">
                              <img src={p.url} className="aspect-[1012/638] w-full rounded border object-cover" alt={p.file.name} />
                              <button type="button" onClick={() => { URL.revokeObjectURL(p.url); setPending((x) => x.filter((y) => y.key !== p.key)) }} className="absolute top-1 right-1 rounded bg-black/60 p-0.5 text-white opacity-0 group-hover:opacity-100" aria-label="remove"><X className="size-3" /></button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )}
          {step === 5 && (
            <Card>
              <CardHeader>
                <CardTitle>registry/{fam.family}.yaml</CardTitle>
                <CardDescription>Final check — you can still edit the YAML. The service validates it again on create. {pending.length} reference photo(s) will be uploaded.</CardDescription>
              </CardHeader>
              <CardContent>
                <YamlEditor value={yaml} onChange={setYaml} height="520px" />
              </CardContent>
            </Card>
          )}

          {cur.length > 0 && (
            <Alert variant="destructive">
              <AlertTitle>Fix before continuing</AlertTitle>
              <AlertDescription><ul className="list-disc pl-4">{cur.slice(0, 5).map((c) => <li key={c}>{c}</li>)}</ul></AlertDescription>
            </Alert>
          )}
          {creating && (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground whitespace-nowrap">{creating.done === 0 ? "Creating family…" : `Uploading references ${creating.done}/${creating.total - 1}`}</span>
              <Progress value={(creating.done / creating.total) * 100} />
            </div>
          )}

          <div className="flex justify-between">
            <Button variant="outline" disabled={step === 0 || !!creating} onClick={() => setStep((s) => s - 1)}><ArrowLeft /> Back</Button>
            {step < STEPS.length - 1 ? <Button onClick={next}>Next <ArrowRight /></Button> : <Button onClick={create} disabled={!!creating}><Check /> Create family &amp; reload registry</Button>}
          </div>
        </div>

        <div className="space-y-3 xl:sticky xl:top-4 xl:self-start">
          <Card className="gap-3">
            <CardHeader>
              <CardTitle className="text-sm">Layout</CardTitle>
              <CardDescription>Field ROIs on the normalised 1012×638 card</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {fam.variants.length > 0 && <TemplatePreview family={fam} persisted={false} />}
              <div className="text-muted-foreground space-y-1 text-xs">
                <div><b className="text-foreground">{fam.family_name || "Unnamed"}</b> · {fam.variants.length} variants · {fam.fields.length} fields · {fam.rules.length} rules</div>
                <div>{issues.length ? <span className="text-reject">{issues.length} schema issue(s)</span> : <span className="text-accept">schema valid</span>}</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
