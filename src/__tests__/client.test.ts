import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiError, NOT_THE_API, request, setConnection } from "@/api/client"

const respond = (body: string, type: string, status = 200) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(body, { status, headers: { "content-type": type } }))

describe("API client", () => {
  afterEach(() => vi.restoreAllMocks())
  setConnection({ baseUrl: "", adminToken: "" })

  it("rejects an HTML page answering a JSON endpoint (no /v1 proxy) instead of returning it as data", async () => {
    respond("<!doctype html><html>console</html>", "text/html")
    const err = (await request("/v1/cards").catch((e) => e)) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(502)
    expect(err.message).toBe(NOT_THE_API)
  })
  it("rejects HTML for text endpoints too, but returns real text", async () => {
    respond("<html></html>", "text/html")
    await expect(request("/metrics", { expect: "text" })).rejects.toBeInstanceOf(ApiError)
    respond("up 1\n", "text/plain; version=0.0.4")
    await expect(request("/metrics", { expect: "text" })).resolves.toBe("up 1\n")
  })
  it("returns JSON and maps FastAPI errors", async () => {
    respond('{"items":[]}', "application/json")
    await expect(request("/v1/cards")).resolves.toEqual({ items: [] })
    respond('{"detail":"invalid admin token"}', "application/json", 401)
    await expect(request("/v1/runs")).rejects.toMatchObject({ status: 401, message: "invalid admin token" })
  })
})
