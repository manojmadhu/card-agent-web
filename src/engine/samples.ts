// Labelled test photos — same scenarios as the MVP's samples/ + tests/run_eval.py.
import type { Family } from "./schema"
import { photoify, renderCard, specFor, type CardSpec, type PhotoFx, type PrintedToken } from "./render"

export type Decision = "ACCEPT" | "REVIEW" | "REJECT"

export interface SampleCase {
  id: string
  label: string
  note: string
  family?: string
  variant?: string
  values?: Record<string, string>
  fx: PhotoFx
  expected: Decision
  custom?: CardSpec // for cards not in the registry
  strip?: boolean // issuer wordmark + variant label unreadable (worn card)
}

export const SAMPLE_CASES: SampleCase[] = [
  { id: "fazaa_silver", label: "Fazaa Silver", note: "Clean photo", family: "fazaa", variant: "silver", values: { holder_name: "AHMED ALI HASSAN", card_number: "1042873391", expiry_date: "08/28" }, fx: {}, expected: "ACCEPT" },
  { id: "fazaa_gold", label: "Fazaa Gold", note: "Clean photo", family: "fazaa", variant: "gold", values: { holder_name: "FATIMA SAEED", card_number: "2210457783", expiry_date: "11/27" }, fx: { brightness: 1.05 }, expected: "ACCEPT" },
  { id: "fazaa_platinum", label: "Fazaa Platinum", note: "Clean photo", family: "fazaa", variant: "platinum", values: { holder_name: "OMAR KHALID", card_number: "3198822450", expiry_date: "02/29" }, fx: {}, expected: "ACCEPT" },
  { id: "fazaa_gold_upside_down", label: "Fazaa Gold · upside-down", note: "Normaliser must rotate 180°", family: "fazaa", variant: "gold", values: { holder_name: "MARIAM YOUSEF", card_number: "2877001234", expiry_date: "05/28" }, fx: { rotate180: true }, expected: "ACCEPT" },
  { id: "fazaa_gold_prefix_mismatch", label: "Fazaa Gold · prefix mismatch", note: "Gold card with a silver number prefix", family: "fazaa", variant: "gold", values: { holder_name: "KHALID RASHID", card_number: "1877001299", expiry_date: "05/28" }, fx: {}, expected: "REVIEW" },
  { id: "esaad_classic", label: "Esaad Classic", note: "Clean photo", family: "esaad", variant: "classic", values: { holder_name: "SARA AL MANSOORI", card_number: "104455667788", emirates_id: "784-1990-1234567-1", expiry_date: "12/27" }, fx: {}, expected: "ACCEPT" },
  { id: "esaad_gold", label: "Esaad Gold", note: "Clean photo", family: "esaad", variant: "gold", values: { holder_name: "NOURA SALEM", card_number: "209988776655", emirates_id: "784-1985-7654321-3", expiry_date: "07/28" }, fx: { brightness: 0.95 }, expected: "ACCEPT" },
  { id: "esaad_privilege", label: "Esaad Privilege", note: "Dark card body", family: "esaad", variant: "privilege", values: { holder_name: "RASHED OBAID", card_number: "401122334455", emirates_id: "784-1979-1112223-4", expiry_date: "09/27" }, fx: {}, expected: "ACCEPT" },
  { id: "esaad_expired", label: "Esaad Platinum · expired", note: "Expiry 03/24 — critical rule fails", family: "esaad", variant: "platinum", values: { holder_name: "HESSA AL ZAABI", card_number: "305544332211", emirates_id: "784-1992-2223334-5", expiry_date: "03/24" }, fx: {}, expected: "REJECT" },
  { id: "fazaa_blurry", label: "Fazaa Silver · blurry", note: "Quality gate → RETAKE", family: "fazaa", variant: "silver", values: { holder_name: "AHMED ALI HASSAN", card_number: "1042873391", expiry_date: "08/28" }, fx: { blur: 7, noise: 0 }, expected: "REJECT" },
  { id: "esaad_gold_glare", label: "Esaad Gold · glare on logo", note: "English wordmark washed out — Arabic keyword still read", family: "esaad", variant: "gold", values: { holder_name: "NOURA SALEM", card_number: "209988776655", emirates_id: "784-1985-7654321-3", expiry_date: "07/28" }, fx: { glare: { x: 0.2, y: 0.1, r: 0.3 } }, expected: "ACCEPT" },
  { id: "gold_worn_logo", label: "Gold card · worn issuer logo", note: "No issuer text readable — looks like Fazaa Gold → human review", family: "fazaa", variant: "gold", values: { holder_name: "SAIF AL KETBI", card_number: "2455120987", expiry_date: "04/28" }, fx: { brightness: 0.97 }, strip: true, expected: "REVIEW" },
  {
    id: "unknown_card",
    label: "Unknown card (Noor Rewards)",
    note: "Not in the registry → rejected",
    fx: {},
    expected: "REJECT",
    custom: {
      title: "NOOR REWARDS",
      subtitle: "نور",
      issuer: "Noor Loyalty LLC",
      variantLabel: "MEMBER",
      body: [20, 120, 90],
      seed: "noor",
      fields: [
        { roi: [0.05, 0.42, 0.75, 0.55], text: "5521 0098 7712" },
        { roi: [0.05, 0.6, 0.75, 0.72], text: "LAYLA HAMAD" },
        { roi: [0.05, 0.76, 0.5, 0.88], text: "10/27", anchor: "VALID" },
      ],
    },
  },
]

export function buildSample(c: SampleCase, families: Family[]): { canvas: HTMLCanvasElement; tokens: PrintedToken[] } | null {
  let spec: CardSpec
  if (c.custom) spec = c.custom
  else {
    const f = families.find((x) => x.family === c.family)
    const v = f?.variants.find((x) => x.id === c.variant)
    if (!f || !v) return null
    spec = specFor(f, v, c.values ?? {})
    if (c.strip) spec = { ...spec, title: "", subtitle: undefined, issuer: undefined, variantLabel: undefined }
  }
  const { canvas, tokens } = renderCard(spec)
  return { canvas: photoify(canvas, c.fx, c.id.length * 7 + 3), tokens }
}
