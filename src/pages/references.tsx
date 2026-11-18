import * as React from "react"
import { Grid3x3 } from "lucide-react"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { RefGallery } from "@/components/ref-gallery"
import { useFamilies, useRegistry, useSeparability } from "@/api/hooks"
import { cn } from "@/lib/utils"

export default function ReferencesPage() {
  const { families } = useFamilies()
  const reg = useRegistry()
  const [fam, setFam] = React.useState("all")
  const [showSep, setShowSep] = React.useState(false)
  const sep = useSeparability(showSep)

  const variants = reg.data?.families.flatMap((f) => f.variants.map((v) => ({ ...v, family: f.family }))) ?? []
  const total = variants.reduce((a, v) => a + v.reference_images, 0)
  const thin = variants.filter((v) => v.reference_images < 5)

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Reference cards</h2>
          <p className="text-muted-foreground text-sm">The enrolled images the agent matches against for the visual signal. “Training” here = enrolment + threshold tuning — no model retraining.</p>
        </div>
        <div className="ml-auto">
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
            <CardDescription>Loaded by the service</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {reg.isLoading ? <Skeleton className="h-32" /> : (
              <>
                <Row k="Registry version" v={<span className="font-mono text-xs">{reg.data?.version}</span>} />
                <Row k="Reference images" v={total} />
                <Row k="Variants" v={variants.length} />
                <Row k="Variants with < 5 refs" v={<span className={thin.length ? "text-review" : ""}>{thin.length}</span>} />
                <Row k="Visual signature" v={<span className="text-xs">ORB keypoints + HSV histogram</span>} />
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Variant separability</CardTitle>
            <CardDescription>Mean visual similarity between reference groups, computed by the service. A bright diagonal with dark off-diagonal cells is easy to tell apart; bright off-diagonal cells are look-alikes that rely on the text and colour signals.</CardDescription>
            {!showSep && <CardAction><Button size="sm" variant="outline" onClick={() => setShowSep(true)}><Grid3x3 /> Compute</Button></CardAction>}
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {!showSep && <p className="text-muted-foreground text-sm">Compares every pair of reference images (takes a few seconds on the service).</p>}
            {showSep && sep.isLoading && <Skeleton className="h-48 w-full" />}
            {sep.error && <p className="text-reject text-sm">{sep.error.message}</p>}
            {sep.data && (
              <table className="text-[10px]">
                <thead>
                  <tr>
                    <th />
                    {sep.data.groups.map((g) => <th key={g} className="h-24 w-9 align-bottom"><div className="w-9 origin-bottom-left translate-x-4 -rotate-60 font-mono font-normal whitespace-nowrap">{g}</div></th>)}
                  </tr>
                </thead>
                <tbody>
                  {sep.data.groups.map((a, i) => (
                    <tr key={a}>
                      <td className="pr-2 text-right font-mono whitespace-nowrap">{a}</td>
                      {sep.data!.groups.map((b, j) => {
                        const v = sep.data!.matrix[i][j]
                        const t = Math.max(0, Math.min(1, v))
                        return (
                          <td key={b} title={`${a} × ${b}: ${v.toFixed(3)}`} className={cn("border-background tabular size-9 border text-center", t > 0.6 ? "text-white" : "")} style={{ background: `color-mix(in oklch, ${i === j ? "var(--accept)" : "var(--chart-4)"} ${Math.round(t * 100)}%, var(--muted))` }}>
                            {v >= 0.995 ? "1.0" : v.toFixed(2).replace(/^0/, "")}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      <RefGallery familyId={fam === "all" ? undefined : fam} />
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
