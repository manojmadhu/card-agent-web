// Save a card definition (PUT /v1/cards/{id}) with the API's ownership and validation semantics:
//  409 → the card is registry-managed (Git); the caller can retry with ?force=true after confirmation.
//  422 → pydantic errors, returned as issues with YAML line numbers.
import * as React from "react"
import { toast } from "sonner"
import { api } from "@/api/endpoints"
import { ApiError } from "@/api/client"
import type { PutCardResult } from "@/api/types"
import { lineForPath, type Issue } from "@/lib/card-schema"
import { useInvalidateCards } from "@/api/queries"
import { useQueryClient } from "@tanstack/react-query"

export function useSaveCard() {
  const invalidate = useInvalidateCards()
  const qc = useQueryClient()
  const [saving, setSaving] = React.useState(false)
  const [serverIssues, setServerIssues] = React.useState<Issue[]>([])
  const [conflict, setConflict] = React.useState<{ id: string; yaml: string; message: string } | null>(null)

  const save = async (id: string, yaml: string, force = false): Promise<PutCardResult | null> => {
    setSaving(true)
    setServerIssues([])
    try {
      const out = await api.putCardYaml(id, yaml, force)
      invalidate(id)
      qc.invalidateQueries({ queryKey: ["cards", id, "yaml"] })
      qc.invalidateQueries({ queryKey: ["cards", id, "references"] })
      const extras = [out.references_deleted ? `${out.references_deleted} reference image(s) deleted` : "", out.keypoints_refreshed ? `${out.keypoints_refreshed} keypoint set(s) re-extracted` : ""].filter(Boolean).join(" · ")
      toast.success(out.created ? `${id} created` : out.changed === false ? `${id}: no changes` : `${id} saved`, { description: [extras, `registry ${out.registry_version}`].filter(Boolean).join(" · ") })
      setConflict(null)
      return out
    } catch (e) {
      const err = e as ApiError
      if (err.status === 409) setConflict({ id, yaml, message: err.message })
      else if (err.status === 422 || err.status === 400) {
        const issues = err.issues.length ? err.issues.map((i) => ({ ...i, line: lineForPath(yaml, i.path) })) : [{ path: "", message: err.message, line: 1 }]
        setServerIssues(issues)
        toast.error("The server rejected the definition", { description: issues.slice(0, 2).map((i) => `${i.path} ${i.message}`).join(" · ") })
      } else toast.error("Save failed", { description: err.message })
      return null
    } finally {
      setSaving(false)
    }
  }
  return { save, saving, serverIssues, setServerIssues, conflict, setConflict }
}
