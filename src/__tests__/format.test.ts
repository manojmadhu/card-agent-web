import { describe, expect, it } from "vitest"
import { maskValue, pct, reasonLabel, rgbHex, hexRgb } from "@/lib/format"
import { parseMetrics } from "@/pages/system"
import { ApiError } from "@/api/client"

describe("formatting", () => {
  it("masks card numbers and names", () => {
    expect(maskValue("card_number", "2210457783", true)).toBe("••••••7783")
    expect(maskValue("holder_name", "FATIMA SAEED", true)).toBe("F••••• S••••")
    expect(maskValue("card_number", "2210457783", false)).toBe("2210457783")
    expect(maskValue("expiry_date", "11/27", true)).toBe("11/27")
  })
  it("labels reason codes", () => {
    expect(reasonLabel("RULE_FAILED:not_expired:expiry_date")).toBe("Validation rule failed — not_expired · expiry_date")
    expect(reasonLabel("CARD_EXPIRED")).toBe("Card is expired")
  })
  it("formats percentages and colours", () => {
    expect(pct(0.4167)).toBe("41.7%")
    expect(pct(null)).toBe("—")
    expect(rgbHex([201, 162, 39])).toBe("#c9a227")
    expect(hexRgb("#c9a227")).toEqual([201, 162, 39])
  })
})

describe("API errors", () => {
  it("summarises pydantic validation errors", () => {
    const e = new ApiError(422, [{ loc: ["body", "fields", 0, "regex"], msg: "regex does not compile" }])
    expect(e.message).toBe("fields.0.regex: regex does not compile")
    expect(e.issues).toEqual([{ path: "fields.0.regex", message: "regex does not compile" }])
  })
})

describe("Prometheus parser", () => {
  it("reads help, labels and values", () => {
    const m = parseMetrics('# HELP cardagent_requests_total Decisions by status\n# TYPE cardagent_requests_total counter\ncardagent_requests_total{status="ACCEPT"} 10.0\nup 1\n')
    expect(m.help.cardagent_requests_total).toBe("Decisions by status")
    expect(m.samples).toEqual([
      { name: "cardagent_requests_total", labels: '{status="ACCEPT"}', value: 10 },
      { name: "up", labels: "", value: 1 },
    ])
  })
})
