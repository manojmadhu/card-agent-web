// Read-only view of a ValidationResult (schema 2.0): identification, fields, rules, quality, timings.
import { Link } from "react-router-dom"
import type { ValidationResult } from "@/api/types"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DecisionBadge, Kv, ScoreBar, StepIcon } from "@/components/common"
import { RulesList } from "@/components/pipeline"
import { maskValue, ms, reasonLabel } from "@/lib/format"
import { useConnection } from "@/auth/connection"
import { cn } from "@/lib/utils"

export function ResultSummary({ r, runLink = true, runId }: { r: ValidationResult; runLink?: boolean; runId?: string }) {
  const { isAdmin } = useConnection()
  const rid = runId ?? r.run_id
  return (
    <div className="space-y-3">
      <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kv k="Programme" v={r.card ? <Link to={`/cards/${r.card.family}`} className="hover:underline">{r.card.family_name}</Link> : "Not identified"} />
        <Kv k="Variant" v={r.card?.variant_name ?? "—"} />
        <Kv k="Confidence (family / variant)" v={r.card ? `${r.card.family_confidence.toFixed(2)} / ${r.card.variant_confidence.toFixed(2)}` : "—"} />
        <Kv
          k="Run"
          v={rid ? isAdmin && runLink ? <Link to={`/runs/${rid}`} className="font-mono text-xs hover:underline">{rid.slice(0, 12)}…</Link> : <span className="font-mono text-xs">{rid.slice(0, 12)}…</span> : <span className="text-muted-foreground">not recorded</span>}
        />
      </div>
      {r.reasons.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {r.reasons.map((x) => (
            <Badge key={x} variant="outline" className={cn("font-normal", r.status === "REJECT" ? "border-reject/40" : "border-review/50")} title={x}>
              <span className="font-mono text-[10px]">{x.split(":")[0]}</span>
              <span className="text-muted-foreground">{reasonLabel(x).split(" — ")[1] ? `· ${reasonLabel(x).split(" — ")[1]}` : `· ${reasonLabel(x)}`}</span>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

export function FieldsTable({ r }: { r: ValidationResult }) {
  const { prefs } = useConnection()
  const entries = Object.entries(r.fields ?? {})
  if (!entries.length) return <p className="text-muted-foreground text-sm">No fields extracted.</p>
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Field</TableHead>
          <TableHead>Value</TableHead>
          <TableHead>Source</TableHead>
          <TableHead className="w-32">Confidence</TableHead>
          <TableHead className="text-right">Format</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map(([k, f]) => (
          <TableRow key={k}>
            <TableCell className="text-sm">{k}</TableCell>
            <TableCell className="font-mono text-xs">
              {f.value ? maskValue(k, f.value, prefs.maskPii) : <span className="text-reject">not read</span>}
              {f.valid_until && <span className="text-muted-foreground"> · valid until {f.valid_until}</span>}
            </TableCell>
            <TableCell className="text-muted-foreground text-xs">{f.source}</TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <ScoreBar value={f.confidence} tone={f.confidence >= 0.55 ? "bg-accept" : "bg-review"} />
                <span className="tabular w-8 text-right text-xs">{f.confidence.toFixed(2)}</span>
              </div>
            </TableCell>
            <TableCell className="text-right">{f.valid_format ? <StepIcon status="pass" className="ml-auto" /> : <StepIcon status="fail" className="ml-auto" />}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function ResultDetails({ r }: { r: ValidationResult }) {
  const timings = Object.entries(r.timings_ms ?? {})
  const total = timings.reduce((a, [, v]) => a + v, 0) || 1
  const fam = r.candidates?.family ?? []
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="gap-3">
        <CardHeader>
          <CardTitle className="text-sm">Extracted fields</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldsTable r={r} />
        </CardContent>
      </Card>
      <Card className="gap-3">
        <CardHeader>
          <CardTitle className="text-sm">Validation rules</CardTitle>
        </CardHeader>
        <CardContent>{r.validation?.length ? <RulesList results={r.validation} /> : <p className="text-muted-foreground text-sm">No rules ran.</p>}</CardContent>
      </Card>
      <Card className="gap-3">
        <CardHeader>
          <CardTitle className="text-sm">Programme candidates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {fam.length === 0 && <p className="text-muted-foreground text-sm">No candidates.</p>}
          {fam.map((c, i) => (
            <div key={c.id} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className={cn(i === 0 && "font-medium")}>{c.id}</span>
                <span className="tabular">{c.score.toFixed(3)}</span>
              </div>
              <ScoreBar value={c.score} tone={i === 0 ? "bg-accept" : "bg-muted-foreground/50"} />
              <div className="text-muted-foreground flex flex-wrap gap-x-3 text-[11px]">
                {Object.entries(c.signals).map(([k, v]) => (
                  <span key={k}>{k} {v.toFixed(2)}</span>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card className="gap-3">
        <CardHeader>
          <CardTitle className="text-sm">Quality &amp; timing · {ms(r.processing_ms)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {r.quality && (
            <div className="grid grid-cols-3 gap-2 text-xs">
              <Kv k="Sharpness" v={r.quality.blur} />
              <Kv k="Brightness" v={r.quality.brightness} />
              <Kv k="Glare" v={`${(r.quality.glare_ratio * 100).toFixed(1)}%`} />
              <Kv k="Card detected" v={r.quality.card_detected == null ? "—" : r.quality.card_detected ? `yes (${r.quality.detector})` : "no"} />
              <Kv k="Rotation" v={`${r.quality.rotation ?? 0}°`} />
              <Kv k="Aligned" v={r.quality.aligned_to_reference ? "yes" : "no"} />
            </div>
          )}
          <div className="space-y-1">
            <div className="flex h-3 w-full overflow-hidden rounded-full" aria-label="stage timing">
              {timings.map(([k, v], i) => (
                <div key={k} title={`${k} ${v} ms`} style={{ width: `${(v / total) * 100}%`, background: `var(--chart-${(i % 5) + 1})` }} />
              ))}
            </div>
            <div className="text-muted-foreground flex flex-wrap gap-x-3 text-[11px]">
              {timings.map(([k, v], i) => (
                <span key={k} className="flex items-center gap-1">
                  <span className="size-2 rounded-sm" style={{ background: `var(--chart-${(i % 5) + 1})` }} />
                  {k} {v} ms
                </span>
              ))}
            </div>
          </div>
          <div className="text-muted-foreground font-mono text-[11px]">
            {Object.entries(r.model_versions ?? {}).map(([k, v]) => `${k}=${v}`).join(" · ")}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function DecisionHeadline({ r }: { r: ValidationResult }) {
  return (
    <div className="flex items-center gap-3">
      <DecisionBadge status={r.status} className="h-8 px-3 text-sm" />
      <div className="text-sm">
        <div className="font-medium">{r.status === "ACCEPT" ? "Card accepted automatically" : r.status === "REVIEW" ? "A person must decide" : "Card rejected"}</div>
        <div className="text-muted-foreground text-xs">{r.reasons.length ? reasonLabel(r.reasons[0]) : "All checks passed"}</div>
      </div>
    </div>
  )
}
