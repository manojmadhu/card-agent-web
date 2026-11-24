// Minimal, spec-compliant Server-Sent Events reader for a fetch() body.
// Handles CRLF/LF, multi-line `data:`, comments (`:`), and events split across network chunks.

export async function parseSse(body: ReadableStream<Uint8Array>, onEvent: (event: string, data: unknown) => void) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ""
  for (;;) {
    const { value, done } = await reader.read()
    if (value) buf += decoder.decode(value, { stream: true })
    buf = buf.replace(/\r\n?/g, "\n")
    let idx: number
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      dispatch(block, onEvent)
    }
    if (done) {
      if (buf.trim()) dispatch(buf, onEvent)
      return
    }
  }
}

export function dispatch(block: string, onEvent: (event: string, data: unknown) => void) {
  let event = "message"
  const data: string[] = []
  for (const line of block.split("\n")) {
    if (!line || line.startsWith(":")) continue
    const c = line.indexOf(":")
    const field = c < 0 ? line : line.slice(0, c)
    let val = c < 0 ? "" : line.slice(c + 1)
    if (val.startsWith(" ")) val = val.slice(1)
    if (field === "event") event = val
    else if (field === "data") data.push(val)
  }
  if (!data.length) return
  const raw = data.join("\n")
  let parsed: unknown = raw
  try {
    parsed = JSON.parse(raw)
  } catch {
    /* plain text payload */
  }
  onEvent(event, parsed)
}
