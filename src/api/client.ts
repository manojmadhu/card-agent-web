// HTTP client for the card-agent API: one place for base URL, admin token, timeouts, retries and errors.
import { parseSse } from "./sse"

export interface Connection {
  /** e.g. "/api" (same-origin reverse proxy) or "http://card-agent.internal:8080". No trailing slash, no /v1. */
  baseUrl: string
  adminToken: string
}

let current: Connection = { baseUrl: "", adminToken: "" }
const listeners = new Set<(e: ApiError) => void>()

export function setConnection(c: Connection) {
  current = { baseUrl: c.baseUrl.replace(/\/+$/, "").replace(/\/v1$/, ""), adminToken: c.adminToken }
}
export const getConnection = () => current

/** Global hook for auth / availability errors (the shell shows a banner or the sign-in dialog). */
export function onApiError(fn: (e: ApiError) => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** FastAPI errors are {"detail": string | pydantic-error[]}; keep both forms. */
export class ApiError extends Error {
  status: number
  detail: unknown
  retryAfter?: number
  constructor(status: number, detail: unknown, retryAfter?: number) {
    super(ApiError.describe(status, detail))
    this.status = status
    this.detail = detail
    this.retryAfter = retryAfter
  }
  static describe(status: number, detail: unknown): string {
    if (status === 0) return typeof detail === "string" ? detail : "Network error — the API cannot be reached"
    if (typeof detail === "string") return detail
    if (Array.isArray(detail))
      return detail
        .slice(0, 4)
        .map((d: { loc?: (string | number)[]; msg?: string }) => `${(d.loc ?? []).filter((x) => x !== "body").join(".") || "body"}: ${d.msg}`)
        .join(" · ")
    return `HTTP ${status}`
  }
  /** pydantic validation errors as {path, message} (for inline form/YAML highlighting). */
  get issues(): { path: string; message: string }[] {
    if (!Array.isArray(this.detail)) return []
    return this.detail.map((d: { loc?: (string | number)[]; msg?: string }) => ({ path: (d.loc ?? []).filter((x) => x !== "body").join("."), message: d.msg ?? "" }))
  }
  get isAuth() {
    return this.status === 401 || this.status === 403
  }
}

export interface RequestOptions {
  method?: string
  query?: Record<string, string | number | boolean | null | undefined>
  json?: unknown
  body?: BodyInit
  headers?: Record<string, string>
  admin?: boolean
  signal?: AbortSignal
  raw?: boolean // return the Response (blobs, text)
  timeoutMs?: number
}

export function buildUrl(path: string, query?: RequestOptions["query"]) {
  const u = `${current.baseUrl}${path}`
  const q = query
    ? Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")
    : ""
  return q ? `${u}?${q}` : u
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", ...opts.headers }
  if (current.adminToken) headers["X-Admin-Token"] = current.adminToken
  let body = opts.body
  if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json"
    body = JSON.stringify(opts.json)
  }
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(new DOMException("timeout", "TimeoutError")), opts.timeoutMs ?? 60_000)
  opts.signal?.addEventListener("abort", () => ctl.abort(opts.signal?.reason))
  let res: Response
  try {
    res = await fetch(buildUrl(path, opts.query), { method: opts.method ?? "GET", headers, body, signal: ctl.signal })
  } catch (e) {
    const err = new ApiError(0, (e as Error)?.name === "AbortError" || (e as DOMException)?.name === "TimeoutError" ? "Request timed out or was cancelled" : "Network error — the API cannot be reached")
    listeners.forEach((l) => l(err))
    throw err
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    let detail: unknown = `HTTP ${res.status}`
    try {
      const j = await res.json()
      detail = j?.detail ?? j
    } catch {
      /* not JSON */
    }
    const ra = res.headers.get("Retry-After")
    const err = new ApiError(res.status, detail, ra ? Number(ra) : undefined)
    listeners.forEach((l) => l(err))
    throw err
  }
  if (opts.raw) return res as unknown as T
  const ct = res.headers.get("content-type") ?? ""
  if (ct.includes("application/json")) return (await res.json()) as T
  return (await res.text()) as unknown as T
}

/** Fetch an admin-protected binary (e.g. a stored photo) as a Blob. */
export async function fetchBlob(path: string, signal?: AbortSignal): Promise<Blob> {
  const res = await request<Response>(path, { raw: true, signal })
  return res.blob()
}

/** Fetch an admin-protected image as an object URL (an <img src> cannot send the token header). */
export async function fetchImageUrl(path: string, signal?: AbortSignal): Promise<string> {
  return URL.createObjectURL(await fetchBlob(path, signal))
}

/** POST multipart and read Server-Sent Events from the response body (EventSource cannot POST). */
export async function streamRequest(
  path: string,
  form: FormData,
  query: RequestOptions["query"],
  onEvent: (event: string, data: unknown) => void,
  signal?: AbortSignal
): Promise<void> {
  const headers: Record<string, string> = { Accept: "text/event-stream" }
  if (current.adminToken) headers["X-Admin-Token"] = current.adminToken
  let res: Response
  try {
    res = await fetch(buildUrl(path, query), { method: "POST", body: form, headers, signal })
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e
    throw new ApiError(0, "Network error — the API cannot be reached")
  }
  if (!res.ok || !res.body) {
    let detail: unknown = `HTTP ${res.status}`
    try {
      detail = (await res.json())?.detail ?? detail
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail)
  }
  await parseSse(res.body, onEvent)
}
