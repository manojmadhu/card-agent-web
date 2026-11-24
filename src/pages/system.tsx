import * as React from "react"
import { Activity, CheckCircle2, PlugZap, XCircle } from "lucide-react"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ErrorState, Kv, PageHeader } from "@/components/common"
import { useMetrics, usePipelineSteps, useReady } from "@/api/queries"
import { useConnection } from "@/auth/connection"
import { buildUrl } from "@/api/client"

interface Sample {
  name: string
  labels: string
  value: number
}

/** Parse Prometheus text exposition (enough for counters/gauges/histogram sums). */
export function parseMetrics(text: string): { help: Record<string, string>; samples: Sample[] } {
  const help: Record<string, string> = {}
  const samples: Sample[] = []
  for (const line of text.split("\n")) {
    if (line.startsWith("# HELP ")) {
      const parts = line.split(" ")
      help[parts[2]] = parts.slice(3).join(" ")
      continue
    }
    if (!line || line.startsWith("#")) continue
    const m = line.match(/^([a-zA-Z_:][\w:]*)(\{[^}]*\})?\s+([^\s]+)/)
    if (m) samples.push({ name: m[1], labels: m[2] ?? "", value: Number(m[3]) })
  }
  return { help, samples }
}

export default function SystemPage() {
  const ready = useReady()
  const steps = usePipelineSteps()
  const metrics = useMetrics()
  const c = useConnection()
  const [filter, setFilter] = React.useState("cardagent_")
  const parsed = React.useMemo(() => (metrics.data ? parseMetrics(metrics.data) : null), [metrics.data])
  const shown = parsed?.samples.filter((s) => s.name.includes(filter) && !s.name.endsWith("_created")).slice(0, 200) ?? []

  return (
    <div className="mx-auto max-w-[1300px] space-y-4">
      <PageHeader title="Health & metrics" description="Liveness, readiness, the pipeline definition and the Prometheus metrics the service exposes." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">{ready.data ? <CheckCircle2 className="text-accept size-5" /> : <XCircle className="text-reject size-5" />} Readiness</CardTitle>
            <CardDescription>GET /health/ready — agent loaded and Qdrant answering</CardDescription>
            <CardAction><Button size="sm" variant="ghost" onClick={() => ready.refetch()}>Refresh</Button></CardAction>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            {ready.isError && <div className="col-span-2"><ErrorState error={ready.error} compact /></div>}
            {ready.data && (
              <>
                <Kv k="Version" v={ready.data.version} />
                <Kv k="Registry" v={ready.data.registry} mono />
                <Kv k="Programmes" v={ready.data.families} />
                <Kv k="References" v={ready.data.references} />
                <Kv k="Matcher" v={ready.data.embedder} mono />
                <Kv k="OCR" v={ready.data.ocr} mono />
                <Kv k="VLM fallback" v={ready.data.vlm ? "available" : "off"} />
                <Kv k="Runs recorded" v={ready.data.runs_recorded ? "yes" : "no"} />
                <Kv k="Settings overridden" v={ready.data.settings_overrides ? "yes" : "no"} />
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><PlugZap className="size-5" /> Connection</CardTitle>
            <CardDescription>How this console reaches the API</CardDescription>
            <CardAction><Button size="sm" variant="outline" onClick={() => c.setAuthPromptOpen(true)}>Change</Button></CardAction>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Kv k="API base" v={c.baseUrl || `${location.origin} (same origin)`} mono />
            <Kv k="Access" v={c.isAdmin ? "admin (X-Admin-Token)" : c.role === "admin-disabled" ? "operator — admin disabled on server" : "operator (open endpoints only)"} />
            <Kv k="Token storage" v={c.adminToken ? (c.remember ? "this device (localStorage)" : "this tab only (sessionStorage)") : "none"} />
            <Kv k="OpenAPI" v={<a className="underline" href={buildUrl("/docs")} target="_blank" rel="noreferrer">{buildUrl("/docs")}</a>} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Activity className="size-5" /> Pipeline</CardTitle>
            <CardDescription>GET /v1/pipeline/steps</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-1 text-sm">
              {steps.data?.steps.map((s) => (
                <li key={s.id} className="flex gap-2"><span className="text-muted-foreground w-8 font-mono text-xs">[{s.stage}]</span>{s.title}<span className="text-muted-foreground ml-auto font-mono text-xs">{s.id}</span></li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Prometheus metrics</CardTitle>
          <CardDescription>GET /metrics, refreshed every 15 s. Scrape this endpoint from Prometheus for alerting; this view is for quick checks.</CardDescription>
          <CardAction><Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="filter" className="h-8 w-56 font-mono text-xs" /></CardAction>
        </CardHeader>
        <CardContent>
          {metrics.isError && <ErrorState error={metrics.error} compact />}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                <TableHead>Labels</TableHead>
                <TableHead className="text-right">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((s, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-xs" title={parsed?.help[s.name]}>{s.name}</TableCell>
                  <TableCell className="text-muted-foreground max-w-md truncate font-mono text-[11px]">{s.labels}</TableCell>
                  <TableCell className="tabular text-right font-mono text-xs">{Number.isInteger(s.value) ? s.value : s.value.toFixed(4)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {parsed && <p className="text-muted-foreground mt-2 text-xs">{shown.length} of {parsed.samples.length} samples shown <Badge variant="outline" className="ml-1">filter “{filter}”</Badge></p>}
        </CardContent>
      </Card>
    </div>
  )
}
