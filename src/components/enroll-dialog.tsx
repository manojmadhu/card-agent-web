import * as React from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CardPreview } from "@/components/card-preview"
import { runImagePath } from "@/components/auth-image"
import { useEnroll, useFamilies } from "@/api/hooks"
import type { RunSummary } from "@/api/types"

/** Governance loop: add a confirmed run's normalised card to a variant's reference set. */
export function EnrollDialog({ run, onOpenChange }: { run: RunSummary | null; onOpenChange: (o: boolean) => void }) {
  const { families } = useFamilies()
  const enroll = useEnroll()
  const [target, setTarget] = React.useState({ family: "", variant: "" })

  React.useEffect(() => {
    if (!run) return
    const f = run.family ?? families[0]?.family ?? ""
    setTarget({ family: f, variant: run.variant ?? families.find((x) => x.family === f)?.variants[0]?.id ?? "" })
  }, [run, families])

  const fam = families.find((f) => f.family === target.family)
  return (
    <Dialog open={!!run} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enroll as reference card</DialogTitle>
          <DialogDescription>The normalised card from this run is added to the chosen variant's reference set on the service, and the registry is re-indexed.</DialogDescription>
        </DialogHeader>
        {run && <CardPreview path={run.has_card ? runImagePath(run.id, "card", 640) : null} empty="This run has no normalised card image" />}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Family</Label>
            <Select value={target.family} onValueChange={(v) => setTarget({ family: v, variant: families.find((f) => f.family === v)?.variants[0]?.id ?? "" })}>
              <SelectTrigger className="w-full"><SelectValue placeholder="family" /></SelectTrigger>
              <SelectContent>{families.map((f) => <SelectItem key={f.family} value={f.family}>{f.family_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Variant</Label>
            <Select value={target.variant} onValueChange={(v) => setTarget((t) => ({ ...t, variant: v }))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="variant" /></SelectTrigger>
              <SelectContent>{fam?.variants.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!run?.has_card || !target.family || !target.variant || enroll.isPending}
            onClick={() => enroll.mutate({ id: run!.id, ...target }, { onSuccess: () => onOpenChange(false) })}
          >
            {enroll.isPending ? "Enrolling…" : "Enroll"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
