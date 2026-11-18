import * as React from "react"
import { Link } from "react-router-dom"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DecisionBadge } from "@/components/status"
import { FlowStrip, StepTimeline } from "@/components/pipeline-trace"
import type { RunRecord } from "@/store"
import { Play } from "lucide-react"

export function RunSheet({ run, onOpenChange }: { run: RunRecord | null; onOpenChange: (o: boolean) => void }) {
  const [selected, setSelected] = React.useState<string | null>(null)
  React.useEffect(() => {
    setSelected(run?.steps.find((s) => (s.status === "fail" || s.status === "warn") && s.id !== "decision")?.id ?? "decision")
  }, [run])
  return (
    <Sheet open={!!run} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        {run && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                {run.label} <DecisionBadge status={run.result.status} />
              </SheetTitle>
              <SheetDescription className="font-mono text-xs">
                {run.id} · {new Date(run.at).toLocaleString()} · {run.result.processing_ms} ms · {run.result.model_versions.registry}
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-4 px-4 pb-6">
              <div className="flex gap-3">
                {run.thumb && <img src={run.thumb} className="h-20 rounded-md border" />}
                <div className="space-y-1 text-xs">
                  {run.expected && (
                    <div>
                      Expected <DecisionBadge status={run.expected} className="h-4 px-1 text-[9px]" /> {run.expected === run.result.status ? <Badge variant="outline" className="text-accept">correct</Badge> : <Badge variant="outline" className="text-reject">mismatch</Badge>}
                    </div>
                  )}
                  <div className="text-muted-foreground">Family: <span className="text-foreground">{run.result.card.family_name ?? "—"}</span> · Variant: <span className="text-foreground">{run.result.card.variant_name ?? "—"}</span></div>
                  {run.sampleId && (
                    <Button asChild size="sm" variant="outline" className="mt-1 h-7">
                      <Link to={`/validate?sample=${run.sampleId}`}><Play /> Replay live</Link>
                    </Button>
                  )}
                </div>
              </div>
              <FlowStrip steps={run.steps} compact onSelect={setSelected} selected={selected} />
              <Tabs defaultValue="steps">
                <TabsList>
                  <TabsTrigger value="steps">Steps</TabsTrigger>
                  <TabsTrigger value="json">JSON</TabsTrigger>
                </TabsList>
                <TabsContent value="steps" className="mt-3">
                  <StepTimeline steps={run.steps} selected={selected} setSelected={setSelected} />
                </TabsContent>
                <TabsContent value="json" className="mt-3">
                  <pre className="bg-muted/50 overflow-auto rounded-md p-3 font-mono text-[11px]">{JSON.stringify(run.result, null, 2)}</pre>
                </TabsContent>
              </Tabs>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
