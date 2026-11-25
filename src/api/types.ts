// Types for the card-agent-enterprise v1 API (branch feature/qdrant-platform, docs/API.md).
// Shapes are taken from the server's pydantic models and from recorded responses.

export type Decision = "ACCEPT" | "REVIEW" | "REJECT"
/** Card side (schema 2.1, two-sided cards). Absent everywhere on 2.0 servers = front only. */
export type Side = "front" | "back"
export const SIDES: Side[] = ["front", "back"]
export type ReviewStatus = "none" | "pending" | "accepted" | "rejected"

// ------------------------------------------------------------------ validation result (schema 2.0)
export interface CardInfo {
  family: string
  family_name: string
  country: string
  issuer: string
  family_confidence: number
  variant: string | null
  variant_name: string | null
  variant_confidence: number
}

export interface FieldResult {
  value: string | null
  confidence: number
  source: "ocr_roi" | "ocr_fulltext" | "vlm" | "none"
  valid_format: boolean
  valid_until?: string | null
  side?: Side // 2.1: side the field is printed on
}

export interface RuleResult {
  rule: string
  field: string
  critical: boolean
  result: "pass" | "fail" | "skip"
  detail?: string | null
}

export interface Candidate {
  id: string
  score: number
  signals: Record<string, number>
  photo?: number // 2.1: photo that gave the best score (two-photo requests)
}

export interface QualityInfo {
  width: number
  height: number
  blur: number
  brightness: number
  glare_ratio: number
  passed: boolean
  issues: string[]
  card_detected?: boolean | null
  detector?: string | null
  rotation?: number | null
  aligned_to_reference?: boolean | null
}

/** 2.1: one entry per uploaded photo (also for one-photo requests). */
export interface PhotoInfo {
  photo: number // 0-based upload position (order: front, back, image, images)
  upload: "image" | "front" | "back" | "images"
  declared: Side | null
  side: Side | null // side the photo was used as; null = not used
  status: "used" | "not_used" | "retake" | "invalid"
  side_corrected: boolean
  quality: QualityInfo | null
  reference_id: string | null
  inliers: number | null
  fields: string[]
}

export interface ValidationResult {
  schema_version: string
  request_id: string
  run_id?: string | null
  status: Decision
  reasons: string[]
  card?: CardInfo | null
  fields: Record<string, FieldResult>
  validation: RuleResult[]
  quality?: QualityInfo | null
  candidates: Record<string, Candidate[]>
  model_versions: Record<string, string>
  timings_ms: Record<string, number>
  processing_ms: number
  photos?: PhotoInfo[] // 2.1
  missing_sides?: Side[] // 2.1: required sides without a usable photo
}

// ------------------------------------------------------------------ stream
export type StepId = "ingest" | "quality" | "normalise" | "ocr" | "embed" | "search" | "family" | "variant" | "fields" | "rules" | "decision"
export type StepStatus = "pending" | "running" | "pass" | "warn" | "fail" | "skip"

export interface StepState {
  id: StepId
  status: StepStatus
  summary: string
  ms: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detail: any
}

export interface PipelineStep {
  id: StepId
  title: string
  stage: string
}

export interface StreamPhoto {
  photo: number
  label: string // declared side or "photo 1"; becomes the detected side once known
  side: Side | null
  normalisedUrl: string | null
}

export interface StreamSnapshot {
  steps: StepState[]
  normalisedUrl?: string
  result?: ValidationResult
  photos?: StreamPhoto[] // 2.1
}

// ------------------------------------------------------------------ cards
export type NormaliseKind = "digits" | "upper" | "alnum" | "date_mm_yy" | "date_dd_mm_yyyy" | "emirates_id" | "none"
export type RuleKind = "regex" | "not_expired" | "emirates_id_format" | "luhn" | "prefix_matches_variant" | "length" | "lookup" | "date_order"

export interface VariantDef {
  id: string
  name: string
  body_color_rgb: [number, number, number]
  keywords: string[]
  number_prefix?: string | null
}

export interface FieldSpec {
  name: string
  roi: [number, number, number, number]
  regex: string
  required: boolean
  normalise: NormaliseKind
  anchor?: string | null
  script: "latin" | "arabic"
  side?: Side // 2.1: default front; the roi is on a reference image of this side
}

export interface RuleSpec {
  type: RuleKind
  field: string
  critical: boolean
  params: Record<string, unknown>
}

export interface CardFamily {
  id: string
  country: string
  issuer: string
  name: string
  keywords: string[]
  negative_keywords: string[]
  variants: VariantDef[]
  fields: FieldSpec[]
  rules: RuleSpec[]
  schema_version: number
  sides?: SideDef[] // 2.1: default [{id: front}]
}

export interface SideDef {
  id: Side
  required?: boolean | null // default: required when a required field is on it, or it is the only side
}

export interface VariantRefCount {
  id: string
  name: string
  reference_images: number
  reference_images_by_side?: Partial<Record<Side, number>> // 2.1
}

export interface CardListItem {
  family: string
  name: string
  country: string
  issuer: string
  source: "api" | "registry" | null
  updated_at: string | null
  variants: VariantRefCount[]
  sides?: Side[] // 2.1
}

export interface CardList {
  registry_version: string
  families: number
  reference_images: number
  items: CardListItem[]
}

export interface CardView {
  family: string
  name: string
  country: string
  issuer: string
  source: "api" | "registry" | null
  created_at: string | null
  updated_at: string | null
  definition: CardFamily
  variants: VariantRefCount[]
  variants_without_references: string[]
  sides?: { id: Side; required: boolean; fields: string[] }[] // 2.1 (effective)
  missing_references?: { variant: string; side: Side }[] // 2.1
}

export interface PutCardResult extends CardView {
  created: boolean
  changed?: boolean
  references_deleted?: number
  keypoints_refreshed?: number
  registry_version: string
}

export interface ReferenceInfo {
  ref_id: string
  filename: string
  sha256: string
  source: string
  added_at: string
  side?: Side // 2.1 (absent = front)
}

export interface ReferenceList {
  family: string
  sides?: Side[] // 2.1
  variants: { id: string; name: string; references: ReferenceInfo[] }[]
}

export interface UploadRefResult {
  family: string
  variant: string
  created: number
  results: { filename: string; status: "created" | "exists" | "rejected"; ref_id?: string; error?: string; side?: Side }[]
  reference_images_in_variant: number
  side?: Side // 2.1
  reference_images_in_side?: number // 2.1
  registry_version: string
}

// ------------------------------------------------------------------ registry
export interface RegistrySummary {
  version: string
  families: number
  variants: number
  reference_images: number
  items: { family: string; country: string; name: string; variants: VariantRefCount[]; sides?: Side[] }[]
}

/** POST /v1/registry/sync — counters from store/sync.py plus the totals below. */
export interface SyncResult {
  changed: boolean
  skipped_api_owned: string[] | number
  registry_version: string
  families: number
  references_total: number
  embedder: string
  seconds: number
  [k: string]: unknown
}

// ------------------------------------------------------------------ runs
export interface RunSummary {
  run_id: string
  request_id: string | null
  created_at: number
  created_iso: string
  source: string
  status: Decision
  reasons: string[]
  family: string | null
  variant: string | null
  family_confidence: number | null
  variant_confidence: number | null
  processing_ms: number | null
  registry_version: string | null
  review_status: ReviewStatus
  has_image: boolean
  photos?: number // 2.1: number of uploaded photos
}

export interface Review {
  decision: "accept" | "reject"
  family: string | null
  variant: string | null
  fields: Record<string, string>
  note: string | null
  reviewer: string | null
  reviewed_at: number
  enrolled: { ref_id: string; status: string } | null
  enrolled_photos?: { photo: number; side: Side; ref_id: string; status: string }[] // 2.1
}

export interface RunImage {
  photo: number
  side: Side | null
  upload: string
  path: string
}

export interface RunDetail extends RunSummary {
  result: ValidationResult
  review: Review | null
  images?: RunImage[] // 2.1 (absent on runs stored before two-sided support: one photo)
}

export interface Page<T> {
  items: T[]
  next_before: number | null
}

export interface ReviewQueue extends Page<RunSummary> {
  pending: number
}

export interface ReviewIn {
  decision: "accept" | "reject"
  family?: string | null
  variant?: string | null
  fields?: Record<string, string>
  note?: string | null
  reviewer?: string | null
  enroll?: boolean
  photo_sides?: Record<string, Side> // 2.1: side of each photo by position, for enrolment
}

export interface Stats {
  since: string | null
  until: string | null
  runs: number
  by_status: Record<Decision, number>
  auto_accept_rate: number | null
  review_rate: number | null
  review_queue: { pending: number; accepted: number; rejected: number }
  review_agreement: number | null
  latency_ms: { p50: number | null; p95: number | null; max: number | null }
  top_reasons: { reason: string; count: number }[]
  by_family: ({ family: string; total: number } & Record<Decision, number>)[]
  per_day: ({ date: string; total: number } & Record<Decision, number>)[]
  truncated: boolean
}

// ------------------------------------------------------------------ settings
export type SettingsSection = "scoring" | "quality" | "retrieval" | "embedder"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SettingsValues = Record<string, Record<string, any>>

export interface SettingsView {
  effective: SettingsValues
  defaults: SettingsValues
  overrides: SettingsValues
  tunable: Record<string, string[]>
  fixed: SettingsValues
}

// ------------------------------------------------------------------ evaluation
export interface EvaluationSet {
  kind: "set"
  set_id: string
  name: string
  manifest: string
  origin: "upload" | "reviewed_runs"
  cases: number
  created_at: number
  created_iso: string
  expected: Record<Decision, number>
  families: string[]
  runs_skipped?: number
}

export interface EvaluationSummary {
  cases: number
  status_agreement: number
  automation_rate: number
  accept_precision: number | null
  wrong_accepts: number
  field_accuracy: Record<string, number>
  latency_ms: { p50: number; p95: number; max: number }
  gate: { min_accept_precision: number; min_status_agreement: number; passed: boolean }
}

export interface EvaluationRow {
  file: string
  files?: Partial<Record<Side, string>> | string[] // 2.1: two-photo cases
  expected: Decision
  got: Decision
  expected_family: string | null
  expected_variant: string | null
  family: string | null
  variant: string | null
  id_correct: boolean | null
  reasons: string[]
  ms: number
  timings: Record<string, number>
  field_errors?: Record<string, { expected: string; got: string | null }>
}

export interface EvaluationReport extends EvaluationSummary {
  family_confusion: Record<string, Record<string, number>>
  identification_errors: Record<string, Record<string, number>>
  registry_version: string
  embedder: string
  rows?: EvaluationRow[]
}

export interface Evaluation {
  kind: "evaluation"
  evaluation_id: string
  set_id: string
  status: "queued" | "running" | "done" | "failed"
  settings_overrides: SettingsValues
  today: string | null
  created_at: number
  created_iso: string
  progress: { done: number; total: number | null }
  summary: EvaluationSummary | null
  error: string | null
  registry_version?: string
  embedder?: string
  report?: EvaluationReport | null
}

// ------------------------------------------------------------------ health
export interface Ready {
  status: "ready"
  version: string
  registry: string
  families: number
  references: number
  embedder: string
  ocr: string
  vlm: boolean
  runs_recorded: boolean
  settings_overrides: boolean
}
