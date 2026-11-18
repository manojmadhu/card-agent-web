// Seed registry — the two card families shipped with the card-agent MVP (registry/fazaa.yaml, registry/esaad.yaml).
// Layouts, colours and number formats are SYNTHETIC PLACEHOLDERS — calibrate with real, consented samples.

export const SEED_YAML: Record<string, string> = {
  fazaa: `# PLACEHOLDER layout/colours/formats — calibrate with real Fazaa samples.
family: fazaa
family_name: Fazaa
issuer: Fazaa (Ministry of Interior)
schema_version: 1

keywords: [FAZAA, FAZA, فزعة]
negative_keywords: [ESAAD, إسعاد]

weights: {text: 0.55, visual: 0.30, colour: 0.15}

variants:
  - id: silver
    name: Fazaa Silver
    body_color_rgb: [192, 194, 198]
    keywords: [SILVER, فضية]
    number_prefix: "1"
  - id: gold
    name: Fazaa Gold
    body_color_rgb: [201, 162, 39]
    keywords: [GOLD, ذهبية]
    number_prefix: "2"
  - id: platinum
    name: Fazaa Platinum
    body_color_rgb: [58, 60, 66]
    keywords: [PLATINUM, بلاتينية]
    number_prefix: "3"

# roi = [x0, y0, x1, y1] as fractions of the normalised 1012x638 card
fields:
  - name: holder_name
    roi: [0.05, 0.55, 0.75, 0.68]
    regex: "^[A-Z][A-Z .'-]{2,40}$"
    required: true
    normalise: upper
  - name: card_number
    roi: [0.05, 0.40, 0.75, 0.54]
    regex: "^\\\\d{10}$"
    required: true
    normalise: digits
  - name: expiry_date
    roi: [0.05, 0.72, 0.50, 0.86]
    regex: "^(0[1-9]|1[0-2])/(\\\\d{2}|\\\\d{4})$"
    required: true
    normalise: date_mm_yy
    anchor: EXP

rules:
  - {type: regex, field: card_number, critical: true}
  - {type: regex, field: holder_name, critical: false}
  - {type: not_expired, field: expiry_date, critical: true}
  - {type: prefix_matches_variant, field: card_number, critical: false}
  - {type: lookup, field: card_number, critical: false}
`,
  esaad: `# PLACEHOLDER layout/colours/formats — calibrate with real Esaad samples.
family: esaad
family_name: Esaad
issuer: Esaad (Dubai)
schema_version: 1

keywords: [ESAAD, ESSAD, إسعاد, اسعاد]
negative_keywords: [FAZAA, فزعة]

weights: {text: 0.55, visual: 0.30, colour: 0.15}

variants:
  - id: classic
    name: Esaad Classic
    body_color_rgb: [24, 92, 160]
    keywords: [CLASSIC]
    number_prefix: "10"
  - id: gold
    name: Esaad Gold
    body_color_rgb: [196, 152, 46]
    keywords: [GOLD, ذهبية]
    number_prefix: "20"
  - id: platinum
    name: Esaad Platinum
    body_color_rgb: [160, 165, 172]
    keywords: [PLATINUM, بلاتينية]
    number_prefix: "30"
  - id: privilege
    name: Esaad Privilege
    body_color_rgb: [22, 22, 26]
    keywords: [PRIVILEGE]
    number_prefix: "40"

fields:
  - name: holder_name
    roi: [0.05, 0.62, 0.80, 0.75]
    regex: "^[A-Z][A-Z .'-]{2,40}$"
    required: true
    normalise: upper
  - name: card_number
    roi: [0.05, 0.44, 0.80, 0.58]
    regex: "^\\\\d{12}$"
    required: true
    normalise: digits
  - name: emirates_id
    roi: [0.05, 0.78, 0.60, 0.90]
    regex: "^784-\\\\d{4}-\\\\d{7}-\\\\d$"
    required: false
    normalise: emirates_id
    anchor: ID
  - name: expiry_date
    roi: [0.60, 0.78, 0.96, 0.90]
    regex: "^(0[1-9]|1[0-2])/(\\\\d{2}|\\\\d{4})$"
    required: true
    normalise: date_mm_yy
    anchor: EXP

rules:
  - {type: regex, field: card_number, critical: true}
  - {type: regex, field: holder_name, critical: false}
  - {type: emirates_id_format, field: emirates_id, critical: false}
  - {type: not_expired, field: expiry_date, critical: true}
  - {type: prefix_matches_variant, field: card_number, critical: false}
`,
}
