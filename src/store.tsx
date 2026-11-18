import * as React from "react"
import { toast } from "sonner"
import { SEED_YAML } from "@/engine/seed"
import { parseFamilyYaml, type Family } from "@/engine/schema"
import { buildIndex, registryVersion, type RefEntry, type UploadedRef } from "@/engine/registry"
import { DEFAULT_SETTINGS, type PipelineResult, type Settings, type StepState } from "@/engine/pipeline"
import type { Decision } from "@/engine/samples"
import { idbGet, idbSet, lsGet, lsSet } from "@/lib/idb"

export interface YamlVersion {
  version: string
  yaml: string
  at: string
  note: string
}

export interface RunRecord {
  id: string
  at: string
  source: "sample" | "upload" | "api"
  sampleId?: string
  label: string
  expected?: Decision
  truth?: { family?: string; variant?: string }
  thumb?: string
  review?: { decision: Decision; at: string; note?: string }
  result: PipelineResult
  steps: StepState[]
}

interface Store {
  ready: boolean
  yamls: Record<string, string>
  history: Record<string, YamlVersion[]>
  families: Family[]
  invalid: string[]
  uploads: UploadedRef[]
  index: RefEntry[]
  indexing: boolean
  version: string
  settings: Settings
  runs: RunRecord[]
  saveFamily: (id: string, yaml: string, note?: string) => { ok: boolean; error?: string }
  deleteFamily: (id: string) => void
  addUploads: (refs: UploadedRef[]) => void
  removeUpload: (id: string) => void
  reload: () => Promise<void>
  setSettings: (s: Partial<Settings>) => void
  addRun: (r: RunRecord) => void
  updateRun: (id: string, patch: Partial<RunRecord>) => void
  clearRuns: () => void
  resetDemo: () => void
}

const Ctx = React.createContext<Store | null>(null)

const hashYaml = (s: string) => {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i)
  return (h >>> 0).toString(16).slice(0, 7)
}

function parseAll(yamls: Record<string, string>) {
  const families: Family[] = []
  const invalid: string[] = []
  for (const [id, y] of Object.entries(yamls)) {
    const p = parseFamilyYaml(y)
    if (p.family) families.push(p.family)
    else invalid.push(id)
  }
  families.sort((a, b) => a.family_name.localeCompare(b.family_name))
  return { families, invalid }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [yamls, setYamls] = React.useState<Record<string, string>>(() => lsGet("ca.yamls", SEED_YAML))
  const [history, setHistory] = React.useState<Record<string, YamlVersion[]>>(() =>
    lsGet(
      "ca.history",
      Object.fromEntries(Object.entries(SEED_YAML).map(([k, y]) => [k, [{ version: hashYaml(y), yaml: y, at: new Date().toISOString(), note: "Seed from card-agent MVP registry" }]]))
    )
  )
  const [settings, setSettingsState] = React.useState<Settings>(() => ({ ...DEFAULT_SETTINGS, ...lsGet<Partial<Settings>>("ca.settings", {}) }))
  const [uploads, setUploads] = React.useState<UploadedRef[]>([])
  const [runs, setRuns] = React.useState<RunRecord[]>([])
  const [index, setIndex] = React.useState<RefEntry[]>([])
  const [indexing, setIndexing] = React.useState(true)
  const [ready, setReady] = React.useState(false)
  const { families, invalid } = React.useMemo(() => parseAll(yamls), [yamls])
  const version = React.useMemo(() => registryVersion(yamls, uploads), [yamls, uploads])

  // hydrate IndexedDB-backed state
  React.useEffect(() => {
    Promise.all([idbGet<UploadedRef[]>("uploads", []), idbGet<RunRecord[]>("runs", [])]).then(([u, r]) => {
      setUploads(u)
      setRuns(r)
      setReady(true)
    })
  }, [])

  // hot reload: rebuild the index off the UI path, then swap atomically
  const familiesRef = React.useRef(families)
  familiesRef.current = families
  const uploadsRef = React.useRef(uploads)
  uploadsRef.current = uploads
  const reload = React.useCallback(async () => {
    setIndexing(true)
    await new Promise((r) => setTimeout(r, 30))
    const next = await buildIndex(familiesRef.current, uploadsRef.current)
    setIndex(next)
    setIndexing(false)
  }, [])
  React.useEffect(() => {
    if (ready) reload()
  }, [ready, families, uploads, reload])

  React.useEffect(() => lsSet("ca.yamls", yamls), [yamls])
  React.useEffect(() => lsSet("ca.history", history), [history])
  React.useEffect(() => lsSet("ca.settings", settings), [settings])
  React.useEffect(() => {
    if (ready) idbSet("uploads", uploads)
  }, [uploads, ready])
  React.useEffect(() => {
    if (ready) idbSet("runs", runs)
  }, [runs, ready])

  const saveFamily = React.useCallback((id: string, yaml: string, note = "Edited in console") => {
    const p = parseFamilyYaml(yaml)
    if (!p.family) return { ok: false, error: p.issues[0]?.message ?? "invalid YAML" }
    const newId = p.family.family
    setYamls((y) => {
      const n = { ...y }
      if (newId !== id) delete n[id]
      n[newId] = yaml
      return n
    })
    setHistory((h) => {
      const list = [...(h[id] ?? [])]
      const v = hashYaml(yaml)
      if (list[0]?.version !== v) list.unshift({ version: v, yaml, at: new Date().toISOString(), note })
      const n = { ...h }
      if (newId !== id) delete n[id]
      n[newId] = list.slice(0, 30)
      return n
    })
    return { ok: true }
  }, [])

  const deleteFamily = React.useCallback((id: string) => {
    setYamls((y) => {
      const n = { ...y }
      delete n[id]
      return n
    })
    setUploads((u) => u.filter((x) => x.family !== id))
  }, [])

  const value: Store = {
    ready,
    yamls,
    history,
    families,
    invalid,
    uploads,
    index,
    indexing,
    version,
    settings,
    runs,
    saveFamily,
    deleteFamily,
    addUploads: (refs) => setUploads((u) => [...u, ...refs]),
    removeUpload: (id) => setUploads((u) => u.filter((x) => x.id !== id)),
    reload: async () => {
      await reload()
      toast.success("Registry reloaded", { description: `Index rebuilt and swapped in` })
    },
    setSettings: (s) => setSettingsState((o) => ({ ...o, ...s })),
    addRun: (r) => setRuns((rs) => [r, ...rs].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 400)),
    updateRun: (id, patch) => setRuns((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r))),
    clearRuns: () => setRuns([]),
    resetDemo: () => {
      setYamls(SEED_YAML)
      setHistory({})
      setUploads([])
      setRuns([])
      setSettingsState(DEFAULT_SETTINGS)
    },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const s = React.useContext(Ctx)
  if (!s) throw new Error("useStore outside provider")
  return s
}
