import * as React from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, ArrowRight, Check, ImageUp, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AdminRequired, PageHeader } from "@/components/common"
import { CardForm, RoiEditor, YamlEditor } from "@/components/card-editor"
import { ReferenceManager } from "@/components/reference-manager"
import { useCards } from "@/api/queries"
import { api } from "@/api/endpoints"
import type { CardFamily } from "@/api/types"
import { useConnection } from "@/auth/connection"
import { cardToYaml, emptyCard, parseCardYaml, validateCard } from "@/lib/card-schema"
import { useSaveCard } from "@/lib/use-save-card"
import { rgbHex } from "@/lib/format"
import { cn } from "@/lib/utils"

const STEPS = [
  { id: "identity", title: "Identity", desc: "Id, country, keywords" },
  { id: "variants", title: "Variants", desc: "Tiers, colours, prefixes" },
  { id: "fields", title: "Fields & layout", desc: "What to read, where" },
  { id: "rules", title: "Rules", desc: "What makes it valid" },
  { id: "review", title: "Review & create", desc: "YAML, then save" },
  { id: "refs", title: "Reference images", desc: "3–20 per variant" },
] as const

export default function CardNewPage() {
  const { isAdmin } = useConnection()
  const cards = useCards()
  const nav = useNavigate()
  const saver = useSaveCard()
  const [step, setStep] = React.useState(0)
  const [card, setCard] = React.useState<CardFamily>(emptyCard)
  const [yaml, setYaml] = React.useState("")
  const [created, setCreated] = React.useState<CardFamily | null>(null)
  const [sample, setSample] = React.useState<string | null>(null)

  if (!isAdmin) return <AdminRequired what="Adding a programme" />

  const issues = validateCard(card)
  const stepIssues = (i: number) => {
    if (i === 0) {
      const own = issues.filter((x) => ["id", "country", "issuer", "name", "keywords"].some((k) => x.path === k || x.path.startsWith(k + ".")))
      if (cards.data?.items.some((c) => c.family === card.id)) own.unshift({ path: "id", message: `programme ${card.id} already exists`, line: 0 })
      return own
    }
    const key = ["", "variants", "fields", "rules"][i]
    return key ? issues.filter((x) => x.path.startsWith(key)) : []
  }
  const cur = step < 4 ? stepIssues(step) : []

  const next = () => {
    if (cur.length) return toast.error(cur[0].message)
    if (step === 3) setYaml(cardToYaml(card, `# ${card.name} (${card.id}) — created in the Card Agent console ${new Date().toISOString().slice(0, 10)}\n# Calibrate colours, regions and formats on real, consented cards before trusting ACCEPTs.`))
    setStep((s) => s + 1)
  }

  const create = async () => {
    const p = parseCardYaml(yaml)
    if (!p.card) return toast.error("The YAML has problems", { description: p.issues[0]?.message })
    const out = await saver.save(p.card.id, yaml)
    if (out) {
      setCreated(p.card)
      setStep(5)
    }
  }

  const copyFrom = async (id: string) => {
    try {
      const c = await api.getCard(id)
      setCard({ ...c.definition, id: card.id, country: card.country, name: card.name, issuer: card.issuer, keywords: card.keywords, negative_keywords: [...new Set([...card.negative_keywords, ...c.definition.keywords.filter((k) => /^[A-Z]/.test(k)).slice(0, 2)])] })
      toast.success(`Layout, variants, fields and rules copied from ${c.name}`, { description: "Its keywords were added as negative keywords." })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="mx-auto max-w-[1300px]">
      <PageHeader title="Add a card programme" description="Define how to recognise and validate a new programme, then upload reference images. No code change and no restart: every replica picks it up within seconds." />
      <ol className="mb-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="steps">
        {STEPS.map((s, i) => (
          <li key={s.id}>
            <button
              onClick={() => i < step && !created && setStep(i)}
              disabled={i > step || (!!created && i < 5)}
              aria-current={i === step ? "step" : undefined}
              className={cn("flex w-full items-center gap-2 rounded-lg border p-2.5 text-left transition-colors", i === step && "border-foreground/40 bg-accent", i < step && !created && "hover:bg-accent/60", i > step && "opacity-55")}
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

      <div className="space-y-4">
        {step === 0 && (
          <>
            {!!cards.data?.items.length && (
              <Card className="gap-3">
                <CardHeader>
                  <CardTitle className="text-sm">Start from an existing programme (optional)</CardTitle>
                  <CardDescription>Copies variants, fields and rules; you then change what differs.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Select onValueChange={copyFrom}>
                    <SelectTrigger className="w-[280px]"><SelectValue placeholder="Copy layout from…" /></SelectTrigger>
                    <SelectContent>{cards.data.items.map((c) => <SelectItem key={c.family} value={c.family}>{c.name} ({c.family})</SelectItem>)}</SelectContent>
                  </Select>
                </CardContent>
              </Card>
            )}
            <CardForm value={card} onChange={setCard} sections={["identity"]} />
          </>
        )}
        {step === 1 && <CardForm value={card} onChange={setCard} sections={["variants"]} />}
        {step === 2 && (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <CardForm value={card} onChange={setCard} sections={["fields"]} />
            <Card className="h-fit xl:sticky xl:top-20">
              <CardHeader>
                <CardTitle className="text-sm">Draw the regions</CardTitle>
                <CardDescription>Open a clean, flat photo of the card (stays in your browser) and drag each field's region.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="outline" size="sm" asChild>
                  <label className="cursor-pointer">
                    <ImageUp /> {sample ? "Change sample photo" : "Open a sample photo"}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setSample(URL.createObjectURL(f)) }} />
                  </label>
                </Button>
                <RoiEditor image={sample ? <img src={sample} alt="sample card" /> : <div style={{ background: rgbHex(card.variants[0]?.body_color_rgb) }} />} fields={card.fields} onChange={(fields) => setCard({ ...card, fields })} />
              </CardContent>
            </Card>
          </div>
        )}
        {step === 3 && <CardForm value={card} onChange={setCard} sections={["rules"]} />}
        {step === 4 && (
          <Card>
            <CardHeader>
              <CardTitle>Definition for {card.id}</CardTitle>
              <CardDescription>Final check — you can still edit the YAML. Saving sends <span className="font-mono">PUT /v1/cards/{card.id}</span>.</CardDescription>
            </CardHeader>
            <CardContent><YamlEditor value={yaml} onChange={(v) => { setYaml(v); saver.setServerIssues([]) }} serverIssues={saver.serverIssues} height="520px" /></CardContent>
          </Card>
        )}
        {step === 5 && created && (
          <>
            <Alert className="border-accept/40">
              <Check className="text-accept" />
              <AlertTitle>{created.name} is live</AlertTitle>
              <AlertDescription>Upload 3–20 clean reference images for every variant. Until a variant has references it cannot be matched visually.</AlertDescription>
            </Alert>
            <ReferenceManager family={created.id} def={created} />
          </>
        )}

        {cur.length > 0 && (
          <Alert variant="destructive">
            <AlertTitle>Fix before continuing</AlertTitle>
            <AlertDescription><ul className="list-disc pl-4">{cur.slice(0, 5).map((c) => <li key={c.path + c.message}>{c.path && <span className="font-mono">{c.path}: </span>}{c.message}</li>)}</ul></AlertDescription>
          </Alert>
        )}

        <div className="flex justify-between">
          <Button variant="outline" disabled={step === 0 || step === 5} onClick={() => setStep((s) => s - 1)}><ArrowLeft /> Back</Button>
          {step < 4 && <Button onClick={next}>Next <ArrowRight /></Button>}
          {step === 4 && <Button onClick={create} disabled={saver.saving}>{saver.saving ? <Loader2 className="animate-spin" /> : <Check />} Create programme</Button>}
          {step === 5 && <Button onClick={() => nav(`/cards/${created!.id}`)}>Done <ArrowRight /></Button>}
        </div>
      </div>
    </div>
  )
}
