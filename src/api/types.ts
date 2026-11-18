// Types of the card-agent service (api.py). Keep in sync with cardagent/pipeline.py and cardagent/store.py.

export type Decision = "ACCEPT" | "REVIEW" | "REJECT"
export type StepStatus = "pending" | "running" | "pass" | "warn" | "fail" | "skip"
export type StageId = "ingest" | "quality" | "normalise" | "ocr" | "family" | "variant" | "fields" | "rules" | "decision"

export interface StageMeta {
  id: StageId
  title: string
  stage: string
}

export const STAGES: StageMeta[] = [
  { id: "ingest", title: "Ingest", stage: "0" },
  { id: "quality", title: "Quality gate", stage: "1" },
  { id: "normalise", title: "Normalise", stage: "2" },
  { id: "ocr", title: "Full-card OCR", stage: "3" },
  { id: "family", title: "Family classification", stage: "4" },
  { id: "variant", title: "Variant classification", stage: "5" },
  { id: "fields", title: "Field extraction", stage: "6" },
  { id: "rules", title: "Validation rules", stage: "7" },
  { id: "decision", title: "Decision", stage: "8" },
]

export interface StepState extends StageMeta {
  status: StepStatus
  summary: string
  ms: number
  // stage-specific evidence, see StepDetail in components/pipeline-trace.tsx
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detail: any
}

export interface FieldResult {
  value: string | null
  confidence: number
  source: "ocr_roi" | "ocr_fulltext" | "vlm"
  valid_format: boolean
  valid_until?: string | null
}

export interface RuleResult {
  rule: string
  field: string
  critical: boolean
  result: "pass" | "fail" | "skip"
  detail: string | null
}

export interface ValidationResult {
  schema_version: string
  request_id: string
  status: Decision
  card: {
    family: string
    family_name: string
    issuer: string
    family_confidence: number
    variant: string | null
    variant_name: string | null
    variant_confidence: number
  } | null
  fields: Record<string, FieldResult>
  validation: RuleResult[]
  reasons: string[]
  quality: {
    width: number
    height: number
    blur: number
    brightness: number
    glare_ratio: number
    passed: boolean
    issues: string[]
    card_detected?: boolean
    detector?: string
    rotation?: number
    ocr_mean_conf?: number
  } | null
  candidates: {
    family?: { family: string; score: number; signals: Record<string, number> }[]
    variant?: { variant: string; score: number; signals: Record<string, number> }[]
  }
  model_versions: { pipeline: string; registry: string; ocr: string }
  processing_ms: number
}

export interface Review {
  decision: "ACCEPT" | "REJECT"
  note: string | null
  reviewer: string | null
  at: string
}

export interface RunSummary {
  id: string
  request_id: string
  created_at: string
  source: string
  label: string | null
  status: Decision
  family: string | null
  variant: string | null
  family_confidence: number | null
  variant_confidence: number | null
  processing_ms: number | null
  reasons: string[]
  exit_stage: string | null
  registry_version: string | null
  has_image: boolean
  has_card: boolean
  review: Review | null
  enrolled: string[]
}

export interface RunDetail extends RunSummary {
  result: ValidationResult
  trace: StepState[]
}

export interface RunList {
  items: RunSummary[]
  total: number
  limit: number
  offset: number
  review_queue: number
}

export interface Stats {
  range_hours: number | null
  total: number
  by_status: Record<Decision, number>
  auto_accept_rate: number
  latency_ms: { p50: number; p95: number; max: number }
  series: { bucket: "hour" | "day"; points: ({ t: string } & Record<Decision, number>)[] }
  by_family: ({ family: string } & Record<Decision, number>)[]
  top_reasons: { reason: string; count: number }[]
  exit_stages: Record<string, number>
  review: {
    queue: number
    reviewed_review_cases: number
    audited_decisions: number
    agreement: number | null
    wrong_accepts: number
    wrong_rejects: number
    confusion: Record<Decision, { ACCEPT: number; REJECT: number }>
  }
}

export interface Thresholds {
  min_side: number
  min_blur: number
  min_brightness: number
  max_brightness: number
  max_glare: number
  family_min: number
  family_margin: number
  unknown_reject_below: number
  variant_min: number
  variant_margin: number
  field_min_conf: number
}

export interface SettingsResponse {
  current: Thresholds
  defaults: Thresholds
}

export interface Info {
  service: string
  api_version: string
  pipeline_version: string
  schema_version: string
  registry_version: string
  families: number
  registry_errors: Record<string, string>
  ocr: { engine: string; languages: string; installed: string[] }
  vlm: { enabled: boolean; model: string | null }
  stages: StageMeta[]
  auth: { enabled: boolean; role: "operator" | "admin" }
  store: { images: boolean; retention_days: number }
  evaluation: { cases: number }
}

export interface RegistrySummary {
  version: string
  families: {
    family: string
    name: string
    issuer: string
    variants: { id: string; name: string; body_color_rgb: [number, number, number]; reference_images: number }[]
  }[]
  errors: Record<string, string>
}

export interface FamilyFile {
  family: string
  yaml: string
  loaded: boolean
  error: string | null
  updated_at: string
  reference_images?: number
}

export interface HistoryEntry {
  version: string
  saved_at: string
  size: number
}

export interface RefImage {
  id: string
  family: string
  variant: string
  file: string
  size: number
  added_at: string
}

export interface Separability {
  registry_version: string
  groups: string[]
  matrix: number[][]
}

export interface EvalCase {
  file: string
  family: string | null
  variant: string | null
  expected_status: Decision
  card_number?: string
  holder_name?: string
}

export interface EvalRow {
  file: string
  expected: Decision
  got: Decision
  family_expected: string | null
  family_got: string | null
  variant_expected: string | null
  variant_got: string | null
  number_ok: boolean | null
  reasons: string[]
  processing_ms: number
  passed: boolean
}

export interface EvalSummary {
  total: number
  passed: number
  wrong_accepts: number
  auto_accept: number
  thresholds: Thresholds
  rows: EvalRow[]
}

export type StreamEvent =
  | { event: "start"; request_id: string; stages: StageMeta[] }
  | ({ event: "stage" } & StepState)
  | { event: "result"; run: RunSummary; result: ValidationResult }
  | { event: "error"; message: string }

export type EvalEvent =
  | { event: "start"; total: number }
  | ({ event: "case"; index: number } & EvalRow)
  | ({ event: "summary" } & EvalSummary)
  | { event: "error"; message: string }
