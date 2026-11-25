import { describe, expect, it } from "vitest"
import { pairFiles } from "@/lib/pairing"

const f = (n: string) => new File(["x"], n, { type: "image/jpeg" })

describe("batch pairing", () => {
  it("pairs _front/_back by stem and declares the sides", () => {
    const g = pairFiles([f("c1_front.jpg"), f("c2.jpg"), f("c1_back.jpg")])
    expect(g.map((x) => x.label)).toEqual(["c1_front.jpg + c1_back.jpg", "c2.jpg"])
    expect((g[0].photos.front as File | undefined)?.name).toBe("c1_front.jpg")
    expect((g[0].photos.back as File | undefined)?.name).toBe("c1_back.jpg")
    expect((g[1].photos.image as File | undefined)?.name).toBe("c2.jpg")
  })
  it("pairs _1/_2 as sides-detected images", () => {
    const g = pairFiles([f("card_2.png"), f("card_1.png")])
    expect(g).toHaveLength(1)
    expect(g[0].photos.images?.map((x) => (x as File).name)).toEqual(["card_1.png", "card_2.png"])
  })
  it("keeps one card per file when nothing pairs (unchanged behaviour)", () => {
    const g = pairFiles([f("a.jpg"), f("b.jpg"), f("scan_1.jpg")])
    expect(g.map((x) => Object.keys(x.photos))).toEqual([["image"], ["image"], ["image"]])
  })
  it("accepts -front / -b variants and is case-insensitive", () => {
    const g = pairFiles([f("X-Front.JPG"), f("x-b.jpg")])
    expect(g).toHaveLength(1)
    expect((g[0].photos.front as File | undefined)?.name).toBe("X-Front.JPG")
    expect((g[0].photos.back as File | undefined)?.name).toBe("x-b.jpg")
  })
  it("a lone back is sent as a declared back", () => {
    const g = pairFiles([f("only_back.jpg")])
    expect(g[0].photos).toEqual({ front: undefined, back: g[0].files[0] })
  })
})
