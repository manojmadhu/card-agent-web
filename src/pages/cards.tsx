import * as React from "react"
import { Link, useNavigate } from "react-router-dom"
import { AlertTriangle, CreditCard, FileUp, GitBranch, Plus, Search } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { EmptyState, ErrorState, LoadingRows, PageHeader } from "@/components/common"
import { useCards } from "@/api/queries"
import { useConnection } from "@/auth/connection"
import { parseCardYaml } from "@/lib/card-schema"
import { useSaveCard } from "@/lib/use-save-card"
import { relTime } from "@/lib/format"

export function SourceBadge({ source }: { source: string | null }) {
  if (source === "registry")
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="gap-1"><GitBranch className="size-3" /> Git registry</Badge>
        </TooltipTrigger>
        <TooltipContent>Managed in registry/ and imported by sync. Changing it here needs “force” and hands it to the API.</TooltipContent>
      </Tooltip>
    )
  return <Badge variant="secondary">API</Badge>
}

export default function CardsPage() {
  const cards = useCards()
  const { isAdmin } = useConnection()
  const nav = useNavigate()
  const [q, setQ] = React.useState("")
  const saver = useSaveCard()

  const importYaml = async (file?: File) => {
    if (!file) return
    const text = await file.text()
    const p = parseCardYaml(text)
    if (!p.card) return toast.error(`${file.name} is not a valid card definition`, { description: p.issues.slice(0, 3).map((i) => `line ${i.line}: ${i.message}`).join(" · ") })
    if (cards.data?.items.some((c) => c.family === p.card!.id)) return toast.error(`${p.card.id} already exists — open it and paste the YAML in the editor instead`)
    const out = await saver.save(p.card.id, text)
    if (out) nav(`/cards/${p.card.id}?tab=references`)
  }

  const items = (cards.data?.items ?? []).filter((c) => !q || `${c.name} ${c.family} ${c.issuer} ${c.country}`.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeader
        title="Card programmes"
        description="Every programme the agent can recognise: its variants, and how many reference images each variant has. A variant with no references cannot be matched visually."
        actions={
          isAdmin && (
            <>
              <Button variant="outline" size="sm" asChild>
                <label className="cursor-pointer">
                  <FileUp /> Import YAML
                  <input type="file" accept=".yaml,.yml,application/yaml" className="hidden" onChange={(e) => importYaml(e.target.files?.[0])} />
                </label>
              </Button>
              <Button size="sm" asChild><Link to="/cards/new"><Plus /> Add programme</Link></Button>
            </>
          )
        }
      />
      {cards.data && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name, id, issuer, country" className="pl-8" />
          </div>
          <span className="text-muted-foreground text-sm">{cards.data.families} programmes · {cards.data.reference_images} reference images · registry <span className="font-mono">{cards.data.registry_version}</span></span>
        </div>
      )}
      {cards.isError && <ErrorState error={cards.error} onRetry={() => cards.refetch()} />}
      {cards.isLoading ? (
        <LoadingRows />
      ) : cards.data && cards.data.items.length === 0 ? (
        <EmptyState icon={<CreditCard />} title="No programmes yet" action={isAdmin && <Button asChild><Link to="/cards/new"><Plus /> Add the first programme</Link></Button>}>
          The platform starts empty. Add a programme with its variants, fields and rules, then upload 3–20 reference images per variant.
        </EmptyState>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Programme</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Variants (reference images)</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((c) => {
                const missing = c.variants.filter((v) => v.reference_images === 0)
                return (
                  <TableRow key={c.family} className="cursor-pointer" onClick={() => nav(`/cards/${c.family}`)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && nav(`/cards/${c.family}`)}>
                    <TableCell>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-muted-foreground font-mono text-xs">{c.family} · {c.issuer}</div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className="font-mono">{c.country}</Badge></TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {c.variants.map((v) => (
                          <Badge key={v.id} variant="outline" className={v.reference_images ? "" : "border-review/60 bg-review/10"}>
                            {v.name} <span className="tabular text-muted-foreground ml-1">{v.reference_images}</span>
                          </Badge>
                        ))}
                      </div>
                      {missing.length > 0 && <div className="text-review mt-1 flex items-center gap-1 text-xs"><AlertTriangle className="size-3" /> {missing.length} variant(s) without reference images</div>}
                    </TableCell>
                    <TableCell><SourceBadge source={c.source} /></TableCell>
                    <TableCell className="text-muted-foreground text-right text-xs">{relTime(c.updated_at)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
