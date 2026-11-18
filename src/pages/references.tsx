import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { RefGallery } from "@/components/ref-gallery"
import { useStore } from "@/store"
import { cosine, EMBEDDER_NAME } from "@/engine/embed"
import { cn } from "@/lib/utils"

export default function ReferencesPage() {
  const { index, families, settings } = useStore()
  const [fam, setFam] = React.useState("all")
  const [syn, setSyn] = React.useState(true)
  const up = index.filter((r) => r.source === "upload").length

  // mean cosine similarity between every pair of variants — how separable the reference set is
  const groups = React.useMemo(() => {
    const g: { key: string; refs: typeof index }[] = []
    for (const f of families) for (const v of f.variants) g.push({ key: `${f.family}/${v.id}`, refs: index.filter((r) => r.family === f.family && r.variant === v.id) })
    return g.filter((x) => x.refs.length)
  }, [index, families])
  const matrix = React.useMemo(
    () =>
      groups.map((a) =>
        groups.map((b) => {
          let s = 0,
            n = 0
          for (const x of a.refs) for (const y of b.refs) if (x.id !== y.id) (s += cosine(x.embedding, y.embedding)), n++
          return n ? s / n : 1
        })
      ),
    [groups]
  )

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Reference cards</h2>
          <p className="text-muted-foreground text-sm">The enrolled images the agent matches against (“training” = enrolment + threshold tuning, no neural-network retraining).</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch id="syn" checked={syn} onCheckedChange={setSyn} />
            <Label htmlFor="syn" className="text-sm">Show synthetic</Label>
          </div>
          <Select value={fam} onValueChange={setFam}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All families</SelectItem>
              {families.map((f) => <SelectItem key={f.family} value={f.family}>{f.family_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Index</CardTitle>
            <CardDescription>Linear scan, cosine similarity</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row k="Reference images" v={index.length} />
            <Row k="Uploaded (real)" v={up} />
            <Row k="Synthetic (rendered from YAML)" v={index.length - up} />
            <Row k="Variants covered" v={groups.length} />
            <Row k="Embedder" v={<span className="font-mono text-xs">{EMBEDDER_NAME}</span>} />
            <Row k="Match floor" v={settings.sim_floor} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Variant separability</CardTitle>
            <CardDescription>Mean similarity between reference groups. Bright diagonal + dark off-diagonal = easy to tell apart; bright off-diagonal cells are look-alikes that need text/colour signals.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="text-[10px]">
              <thead>
                <tr>
                  <th />
                  {groups.map((g) => <th key={g.key} className="h-24 w-8 align-bottom"><div className="w-8 origin-bottom-left translate-x-4 -rotate-60 font-mono font-normal whitespace-nowrap">{g.key}</div></th>)}
                </tr>
              </thead>
              <tbody>
                {groups.map((a, i) => (
                  <tr key={a.key}>
                    <td className="pr-2 text-right font-mono whitespace-nowrap">{a.key}</td>
                    {groups.map((b, j) => {
                      const v = matrix[i][j]
                      const t = Math.max(0, (v - 0.3) / 0.7)
                      return (
                        <td key={b.key} title={`${a.key} × ${b.key}: ${v.toFixed(3)}`} className={cn("size-8 border border-background text-center tabular", t > 0.6 ? "text-white" : "")} style={{ background: `color-mix(in oklch, ${i === j ? "var(--accept)" : "var(--chart-4)"} ${Math.round(t * 100)}%, var(--muted))` }}>
                          {v >= 0.995 ? "1.0" : v.toFixed(2).slice(1)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <RefGallery familyId={fam === "all" ? undefined : fam} showSynthetic={syn} />
    </div>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b pb-2 last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="tabular font-medium">{v}</span>
    </div>
  )
}
