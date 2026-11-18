import { SEED_YAML } from "@/engine/seed"
import { parseFamilyYaml } from "@/engine/schema"
import { buildIndex } from "@/engine/registry"
import { SAMPLE_CASES, buildSample } from "@/engine/samples"
import { DEFAULT_SETTINGS, runPipeline } from "@/engine/pipeline"
const fams = Object.values(SEED_YAML).map((y) => { const p = parseFamilyYaml(y); if (!p.family) throw new Error(JSON.stringify(p.issues)); return p.family })
const index = await buildIndex(fams, [])
const rows: any[] = []
for (const c of SAMPLE_CASES) {
  const s = buildSample(c, fams)!
  const gen = runPipeline({ request_id: c.id, image: s.canvas, printed: s.tokens, fx: c.fx, origW: 1012, origH: 638, sourceLabel: "sample" }, { families: fams, index, settings: { ...DEFAULT_SETTINGS, step_delay_ms: 0 }, registryVersion: "t" })
  let last: any
  for await (const u of gen) last = u
  const st = Object.fromEntries(last.steps.map((x: any) => [x.id, x.status[0] + ":" + x.summary]))
  rows.push({ id: c.id, exp: c.expected, got: last.result.status, ok: c.expected === last.result.status, fam: last.result.card.family + "/" + last.result.card.variant, reasons: last.result.reasons.join(","), q: last.result.quality, search: st.search, family: st.family, variant: st.variant, fields: st.fields })
}
document.getElementById("out")!.textContent = JSON.stringify(rows, null, 1)
