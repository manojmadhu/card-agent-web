import * as React from "react"
import { Link } from "react-router-dom"
import { DatabaseZap, GitBranch, Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ConfirmDialog, ErrorState, JsonBlock, Kv, LoadingRows, PageHeader } from "@/components/common"
import { useRegistry } from "@/api/queries"
import { api } from "@/api/endpoints"
import type { SyncResult } from "@/api/types"
import { useConnection } from "@/auth/connection"

export default function RegistryPage() {
  const reg = useRegistry()
  const { isAdmin } = useConnection()
  const qc = useQueryClient()
  const [prune, setPrune] = React.useState(true)
  const [reembed, setReembed] = React.useState(false)
  const [confirm, setConfirm] = React.useState(false)
  const [result, setResult] = React.useState<SyncResult | null>(null)
  const [reloading, setReloading] = React.useState(false)

  const refreshAll = () => ["registry", "cards", "health", "settings"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }))

  return (
    <div className="mx-auto max-w-[1200px] space-y-4">
      <PageHeader
        title="Registry & sync"
        description="What the agent has loaded from Qdrant, and the optional import of Git-managed programmes from registry/cards and registry/refs."
        actions={
          isAdmin && (
            <Button
              variant="outline"
              size="sm"
              disabled={reloading}
              onClick={async () => {
                setReloading(true)
                try {
                  await api.reloadRegistry()
                  refreshAll()
                  toast.success("Reloaded cards and settings from Qdrant")
                } catch (e) {
                  toast.error("Reload failed — the previous version is kept", { description: (e as Error).message })
                } finally {
                  setReloading(false)
                }
              }}
            >
              {reloading ? <Loader2 className="animate-spin" /> : <RefreshCw />} Reload now
            </Button>
          )
        }
      />
      {reg.isError && <ErrorState error={reg.error} onRetry={() => reg.refetch()} />}
      {reg.isLoading ? (
        <LoadingRows rows={4} />
      ) : reg.data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            {[
              ["Registry version", <span key="v" className="font-mono">{reg.data.version}</span>],
              ["Programmes", reg.data.families],
              ["Variants", reg.data.variants],
              ["Reference images", reg.data.reference_images],
            ].map(([k, v]) => (
              <Card key={String(k)} className="gap-1 py-4">
                <CardContent><Kv k={String(k)} v={<span className="text-xl">{v}</span>} /></CardContent>
              </Card>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">The version changes on every card or settings write. Replicas pick up changes made elsewhere within qdrant.refresh_seconds; “Reload now” forces this replica.</p>
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Programme</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Variants · references</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reg.data.items.map((f) => (
                  <TableRow key={f.family}>
                    <TableCell><Link to={`/cards/${f.family}`} className="font-medium hover:underline">{f.name}</Link> <span className="text-muted-foreground font-mono text-xs">{f.family}</span></TableCell>
                    <TableCell className="font-mono text-xs">{f.country}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(f.sides?.length ?? 1) > 1 && <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">front + back</Badge>}
                        {f.variants.map((v) => {
                          const two = (f.sides?.length ?? 1) > 1
                          const gap = two ? f.sides!.some((sd) => !(v.reference_images_by_side?.[sd] ?? 0)) : !v.reference_images
                          return (
                            <Badge key={v.id} variant="outline" className={gap ? "border-review/60 bg-review/10" : ""}>
                              {v.id} · {two ? f.sides!.map((sd) => `${sd[0].toUpperCase()} ${v.reference_images_by_side?.[sd] ?? 0}`).join(" / ") : v.reference_images}
                            </Badge>
                          )
                        })}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><GitBranch className="size-4" /> Import from the Git registry</CardTitle>
          <CardDescription>
            Incremental: only new, changed or removed files under <span className="font-mono">registry/</span> on the server are processed. Programmes created through the API are never touched. An invalid YAML changes nothing (422).
          </CardDescription>
          {isAdmin && <CardAction><Button onClick={() => setConfirm(true)}><DatabaseZap /> Run sync</Button></CardAction>}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
              <div>
                <Label htmlFor="prune">Prune</Label>
                <p className="text-muted-foreground text-xs">Delete registry-owned programmes whose files are gone.</p>
              </div>
              <Switch id="prune" checked={prune} onCheckedChange={setPrune} disabled={!isAdmin} />
            </div>
            <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
              <div>
                <Label htmlFor="reembed">Re-embed every reference</Label>
                <p className="text-muted-foreground text-xs">Only after changing the matcher (embedder). Slow: processes every reference image.</p>
              </div>
              <Switch id="reembed" checked={reembed} onCheckedChange={setReembed} disabled={!isAdmin} />
            </div>
          </div>
          {result && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant={result.changed ? "default" : "secondary"}>{result.changed ? "changes applied" : "nothing changed"}</Badge>
                <span>{result.families} programmes · {result.references_total} references · {result.seconds}s · registry <span className="font-mono">{result.registry_version}</span></span>
              </div>
              <JsonBlock value={result} className="max-h-60" />
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Sync the Git registry now?"
        description={<>Imports <span className="font-mono">registry/cards/**/*.yaml</span> and <span className="font-mono">registry/refs</span>{prune ? ", pruning registry programmes whose files were removed" : ""}{reembed ? ", and re-embedding every reference image (slow)" : ""}. Live traffic keeps using the current version until the import finishes.</>}
        confirmLabel="Run sync"
        destructive={prune}
        onConfirm={async () => {
          const out = await api.syncRegistry(prune, reembed)
          setResult(out)
          refreshAll()
          toast.success(out.changed ? "Registry synced" : "Registry already up to date")
        }}
      />
    </div>
  )
}
