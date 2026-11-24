import { describe, expect, it } from "vitest"
import { dispatch, parseSse } from "@/api/sse"

function streamOf(chunks: string[]) {
  const enc = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(c) {
      chunks.forEach((x) => c.enqueue(enc.encode(x)))
      c.close()
    },
  })
}

describe("SSE parser", () => {
  it("parses events split across network chunks, CRLF and comments", async () => {
    const got: [string, unknown][] = []
    await parseSse(streamOf([": keep-alive\r\n\r\nevent: snap", "shot\r\ndata: {\"steps\":[]}\r\n\r\nevent: step\ndata: {\"id\":\"ingest\",", "\"status\":\"pass\"}\n\n"]), (e, d) => got.push([e, d]))
    expect(got).toEqual([
      ["snapshot", { steps: [] }],
      ["step", { id: "ingest", status: "pass" }],
    ])
  })
  it("joins multi-line data and defaults the event name", () => {
    const got: [string, unknown][] = []
    dispatch("data: hello\ndata: world", (e, d) => got.push([e, d]))
    expect(got).toEqual([["message", "hello\nworld"]])
  })
  it("handles a final event without a trailing blank line", async () => {
    const got: string[] = []
    await parseSse(streamOf(["event: result\ndata: {\"ok\":true}"]), (e) => got.push(e))
    expect(got).toEqual(["result"])
  })
})
