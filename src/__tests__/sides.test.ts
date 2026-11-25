import { describe, expect, it } from "vitest"
import { cardToYaml, effectiveSides, emptyCard, parseCardYaml, validateCard } from "@/lib/card-schema"
import type { CardFamily } from "@/api/types"

const base = (): CardFamily => ({ ...emptyCard(), id: "ae.gamma", name: "Gamma", issuer: "G", keywords: ["GAMMAPASS"] })

describe("two-sided cards in the schema mirror (TWO_SIDED_CARDS §2)", () => {
  it("one-sided definitions are unchanged: no sides, front only, YAML has no sides/side keys", () => {
    const c = base()
    expect(validateCard(c)).toEqual([])
    const y = cardToYaml(c)
    expect(y).not.toMatch(/sides:|side:/)
    expect(effectiveSides(c)).toEqual([{ id: "front", required: true, fields: ["holder_name", "card_number", "expiry_date"] }])
  })
  it("card A: number on the back makes both sides required", () => {
    const c = base()
    c.sides = [{ id: "front" }, { id: "back" }]
    c.fields = c.fields.map((f) => (f.name === "card_number" ? { ...f, side: "back" } : f))
    expect(validateCard(c)).toEqual([])
    expect(effectiveSides(c).map((s) => [s.id, s.required, s.fields])).toEqual([
      ["front", true, ["holder_name", "expiry_date"]],
      ["back", true, ["card_number"]],
    ])
    const back = parseCardYaml(cardToYaml(c))
    expect(back.issues).toEqual([])
    expect(back.card?.fields.find((f) => f.name === "card_number")?.side).toBe("back")
  })
  it("card C: everything on the back, front optional", () => {
    const c = base()
    c.sides = [{ id: "front" }, { id: "back" }]
    c.fields = c.fields.map((f) => ({ ...f, side: "back" }))
    expect(effectiveSides(c).find((s) => s.id === "front")?.required).toBe(false)
  })
  it("rejects a field on a side that is not listed", () => {
    const c = base()
    c.fields[1] = { ...c.fields[1], side: "back" }
    expect(validateCard(c).map((i) => i.path)).toContain("fields.1.side")
  })
  it("rejects duplicate sides and required:false on a side with required fields", () => {
    const c = base()
    c.sides = [{ id: "front", required: false }, { id: "front" }]
    const paths = validateCard(c).map((i) => i.path)
    expect(paths).toContain("sides.1.id")
    expect(paths).toContain("sides.0.required")
  })
})
