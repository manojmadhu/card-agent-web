// Batch validation: group files into cards (docs TWO_SIDED_CARDS §9).
//  - "<stem>_front.<ext>" + "<stem>_back.<ext>" (also -front/-back, " front", _f/_b) → one card, sides declared
//  - "<stem>_1.<ext>" + "<stem>_2.<ext>" → one card, sides detected (field "images")
//  - anything else → one card per file (field "image", exactly as before)
import type { CardPhotos } from "@/api/endpoints"

export interface CardGroup {
  key: string
  label: string
  files: File[]
  photos: CardPhotos
}

const SIDE_RE = /^(.*?)[\s._-]+(front|back|f|b)$/i
const NUM_RE = /^(.*?)[\s._-]+([12])$/

const stemOf = (name: string) => name.replace(/\.[^.]+$/, "")

export function pairFiles(files: File[]): CardGroup[] {
  const bySide = new Map<string, { front?: File; back?: File }>()
  const byNum = new Map<string, { 1?: File; 2?: File }>()
  const order: string[] = []
  const singles: File[] = []
  for (const f of files) {
    const stem = stemOf(f.name)
    const s = stem.match(SIDE_RE)
    if (s) {
      const key = s[1].toLowerCase()
      const side = s[2].toLowerCase().startsWith("f") ? "front" : "back"
      const g = bySide.get(key) ?? {}
      if (g[side]) {
        singles.push(f) // a second "front" for the same stem: keep it as its own card
        continue
      }
      g[side] = f
      if (!bySide.has(key)) order.push(`s:${key}`)
      bySide.set(key, g)
      continue
    }
    const n = stem.match(NUM_RE)
    if (n) {
      const key = n[1].toLowerCase()
      const g = byNum.get(key) ?? {}
      const k = n[2] === "1" ? 1 : 2
      if (g[k]) {
        singles.push(f)
        continue
      }
      g[k] = f
      if (!byNum.has(key)) order.push(`n:${key}`)
      byNum.set(key, g)
      continue
    }
    order.push(`x:${order.length}:${f.name}`)
    singles.push(f)
  }
  const out: CardGroup[] = []
  const usedSingles = new Set<File>()
  for (const o of order) {
    if (o.startsWith("s:")) {
      const g = bySide.get(o.slice(2))!
      const fs = [g.front, g.back].filter(Boolean) as File[]
      out.push({ key: o, label: fs.map((f) => f.name).join(" + "), files: fs, photos: { front: g.front, back: g.back } })
    } else if (o.startsWith("n:")) {
      const g = byNum.get(o.slice(2))!
      const fs = [g[1], g[2]].filter(Boolean) as File[]
      // a lone "_1" without "_2" is an ordinary single photo
      out.push(fs.length === 2 ? { key: o, label: fs.map((f) => f.name).join(" + "), files: fs, photos: { images: fs } } : { key: o, label: fs[0].name, files: fs, photos: { image: fs[0] } })
    } else {
      const f = singles.find((x) => !usedSingles.has(x) && o.endsWith(`:${x.name}`))
      if (f) {
        usedSingles.add(f)
        out.push({ key: o, label: f.name, files: [f], photos: { image: f } })
      }
    }
  }
  // duplicates that could not be paired
  singles.filter((f) => !usedSingles.has(f)).forEach((f, i) => out.push({ key: `d:${i}:${f.name}`, label: f.name, files: [f], photos: { image: f } }))
  return out
}
