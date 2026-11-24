import { describe, expect, it } from "vitest"
import { cardToYaml, emptyCard, lineForPath, parseCardYaml, pyRegexToJs } from "@/lib/card-schema"

const FAZAA = `id: ae.fazaa
country: AE
issuer: Fazaa
name: Fazaa
keywords: [FAZAA, فزعة]
variants:
  - {id: gold, name: Fazaa Gold, body_color_rgb: [201, 162, 39], keywords: [GOLD], number_prefix: "2"}
fields:
  - {name: card_number, roi: [0.05, 0.40, 0.75, 0.54], regex: "\\\\d{10}", normalise: digits}
rules:
  - {type: regex, field: card_number, critical: true}
`

describe("card schema (mirror of registry/models.py)", () => {
  it("accepts the example definition", () => {
    const r = parseCardYaml(FAZAA)
    expect(r.issues).toEqual([])
    expect(r.card?.fields[0].required).toBe(true)
    expect(r.card?.fields[0].script).toBe("latin")
  })
  it("rejects a malformed id with the YAML line number", () => {
    const r = parseCardYaml(FAZAA.replace("id: ae.fazaa", "id: Fazaa"))
    expect(r.card).toBeUndefined()
    expect(r.issues[0]).toMatchObject({ path: "id", line: 1 })
  })
  it("rejects an invalid roi and a rule on an unknown field", () => {
    const bad = FAZAA.replace("[0.05, 0.40, 0.75, 0.54]", "[0.8, 0.40, 0.75, 0.54]").replace("field: card_number, critical", "field: nope, critical")
    const paths = parseCardYaml(bad).issues.map((i) => i.path)
    expect(paths).toContain("fields.0.roi")
    expect(paths).toContain("rules.0.field")
  })
  it("requires params.other_field for date_order", () => {
    const r = parseCardYaml(FAZAA.replace("{type: regex, field: card_number, critical: true}", "{type: date_order, field: card_number}"))
    expect(r.issues.some((i) => i.message.includes("other_field"))).toBe(true)
  })
  it("round-trips through YAML", () => {
    const c = { ...emptyCard(), id: "ae.test", name: "Test", issuer: "T", keywords: ["TEST"] }
    const back = parseCardYaml(cardToYaml(c))
    expect(back.issues).toEqual([])
    expect(back.card?.variants).toEqual(c.variants)
    expect(back.card?.fields.map((f) => f.roi)).toEqual(c.fields.map((f) => f.roi))
  })
  it("maps a server error path to a line", () => {
    expect(lineForPath(FAZAA, "fields.0.regex")).toBe(9)
  })
  it("translates Python named groups for browser checks", () => {
    expect(pyRegexToJs("(?P<n>\\d+)-(?P=n)")).toBe("(?<n>\\d+)-\\k<n>")
  })
})
