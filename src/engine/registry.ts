// Card Registry index: YAML families + reference images → in-memory embedding index (linear scan).
// Mirrors the MVP: registry/<family>.yaml + registry/refs/<family>/<variant>/*.png, hot-reload = rebuild + swap.
import type { Family } from "./schema"
import { embed } from "./embed"
import { hashStr, renderReferences } from "./render"
import { bodyColour, loadImage, normalise, type RGB } from "./vision"

export interface RefEntry {
  id: string
  family: string
  variant: string
  source: "synthetic" | "upload"
  thumb: string // small JPEG data URL for the UI
  embedding: number[]
  body: RGB
  added_at: string
}

export interface UploadedRef {
  id: string
  family: string
  variant: string
  dataUrl: string // normalised 506×319 JPEG
  added_at: string
}

function thumbOf(c: HTMLCanvasElement, w = 253, h = 160) {
  const t = document.createElement("canvas")
  t.width = w
  t.height = h
  t.getContext("2d")!.drawImage(c, 0, 0, w, h)
  return t.toDataURL("image/jpeg", 0.82)
}

export async function buildIndex(families: Family[], uploads: UploadedRef[], syntheticPerVariant = 3): Promise<RefEntry[]> {
  const out: RefEntry[] = []
  for (const f of families) {
    for (const v of f.variants) {
      if (syntheticPerVariant > 0) {
        renderReferences(f, v, syntheticPerVariant).forEach((r, i) => {
          const n = normalise(r.canvas)
          out.push({ id: `${f.family}/${v.id}/ref_${i}.png`, family: f.family, variant: v.id, source: "synthetic", thumb: thumbOf(n), embedding: embed(n), body: bodyColour(n), added_at: "seed" })
        })
      }
      for (const u of uploads.filter((u) => u.family === f.family && u.variant === v.id)) {
        const im = await loadImage(u.dataUrl)
        const n = normalise(im)
        out.push({ id: `${f.family}/${v.id}/${u.id}`, family: f.family, variant: v.id, source: "upload", thumb: thumbOf(n), embedding: embed(n), body: bodyColour(n), added_at: u.added_at })
      }
    }
  }
  return out
}

/** Registry version = hash of every YAML + reference id (stamped into each result, like the MVP). */
export function registryVersion(yamls: Record<string, string>, uploads: UploadedRef[]) {
  const s = Object.keys(yamls).sort().map((k) => k + yamls[k]).join("\n") + uploads.map((u) => u.id).sort().join(",")
  return "reg-" + hashStr(s).toString(16).padStart(8, "0")
}

/** Downscale an uploaded photo to the 506×319 card aspect so it can live in browser storage. */
export async function prepareUpload(file: File): Promise<string> {
  const url = await new Promise<string>((res, rej) => {
    const fr = new FileReader()
    fr.onload = () => res(fr.result as string)
    fr.onerror = () => rej(fr.error)
    fr.readAsDataURL(file)
  })
  const im = await loadImage(url)
  const n = normalise(im)
  const t = document.createElement("canvas")
  t.width = 506
  t.height = 319
  t.getContext("2d")!.drawImage(n, 0, 0, 506, 319)
  return t.toDataURL("image/jpeg", 0.85)
}
