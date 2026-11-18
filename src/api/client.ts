// HTTP client for the card-agent service. All requests go through `request` / `stream`, which add the
// API key, turn error responses into ApiError, and support NDJSON streaming (live pipeline + evaluation).
import * as React from "react"

export interface Connection {
  /** Service origin, e.g. "https://card-agent.internal" — "" means same origin (dev proxy / served by the service). */
  baseUrl: string
  apiKey: string
  /** Keep the API key after the browser is closed (localStorage) instead of only for this tab (sessionStorage). */
  remember: boolean
}

const LS_KEY = "ca.connection"
const SS_KEY = "ca.apiKey"
const ENV_BASE = (import.meta.env.VITE_CARD_AGENT_URL as string | undefined) ?? ""

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
}

function load(): Connection {
  const saved = safe(() => JSON.parse(localStorage.getItem(LS_KEY) ?? "null") as Partial<Connection> | null, null)
  const sessionKey = safe(() => sessionStorage.getItem(SS_KEY), null)
  return {
    baseUrl: saved?.baseUrl ?? ENV_BASE,
    apiKey: saved?.remember ? (saved.apiKey ?? "") : (sessionKey ?? ""),
    remember: !!saved?.remember,
  }
}

let current: Connection = load()
const listeners = new Set<() => void>()

export function getConnection() {
  return current
}

export function setConnection(next: Partial<Connection>) {
  current = { ...current, ...next, baseUrl: (next.baseUrl ?? current.baseUrl).trim().replace(/\/+$/, "") }
  safe(() => {
    localStorage.setItem(LS_KEY, JSON.stringify({ baseUrl: current.baseUrl, remember: current.remember, apiKey: current.remember ? current.apiKey : undefined }))
    if (current.remember) sessionStorage.removeItem(SS_KEY)
    else sessionStorage.setItem(SS_KEY, current.apiKey)
  }, undefined)
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function useConnection(): Connection {
  return React.useSyncExternalStore(subscribe, getConnection)
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function apiUrl(path: string) {
  return `${current.baseUrl}${path}`
}

function headers(extra?: HeadersInit): Headers {
  const h = new Headers(extra)
  if (current.apiKey) h.set("X-API-Key", current.apiKey)
  return h
}

async function toError(r: Response): Promise<ApiError> {
  let msg = `${r.status} ${r.statusText}`
  try {
    const body = await r.json()
    const d = body?.detail
    msg = typeof d === "string" ? d : Array.isArray(d) ? d.map((x) => `${x.loc?.slice(1).join(".")}: ${x.msg}`).join("; ") : msg
  } catch {
    /* non-JSON error body */
  }
  if (r.status === 401) msg = "Not authorised — set a valid API key in Settings → Connection."
  if (r.status === 403) msg = `Forbidden — ${msg}`
  return new ApiError(r.status, msg)
}

async function send(path: string, init: RequestInit = {}): Promise<Response> {
  let r: Response
  try {
    r = await fetch(apiUrl(path), { ...init, headers: headers(init.headers) })
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e
    throw new ApiError(0, `Cannot reach the card-agent service at ${current.baseUrl || window.location.origin}. Is it running?`)
  }
  if (!r.ok) throw await toError(r)
  return r
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await send(path, init)
  return (await r.json()) as T
}

export const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
})

/** POST and read an NDJSON response line by line. */
export async function* stream<T>(path: string, init: RequestInit = {}): AsyncGenerator<T> {
  const r = await send(path, init)
  if (!r.body) throw new ApiError(0, "streaming is not supported by this browser")
  const reader = r.body.pipeThrough(new TextDecoderStream()).getReader()
  let buf = ""
  for (;;) {
    const { value, done } = await reader.read()
    if (value) buf += value
    let nl: number
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (line) yield JSON.parse(line) as T
    }
    if (done) break
  }
  if (buf.trim()) yield JSON.parse(buf) as T
}

export async function fetchBlob(path: string, signal?: AbortSignal): Promise<Blob> {
  const r = await send(path, { signal })
  return r.blob()
}
