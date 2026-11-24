// Connection & access: API base URL + admin token, role detection, and operator preferences.
// The admin token is kept in sessionStorage by default (cleared when the tab closes); "remember on
// this device" moves it to localStorage. It is only ever sent as the X-Admin-Token header.
import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ApiError, getConnection, onApiError, request, setConnection } from "@/api/client"

export type Role = "unknown" | "operator" | "admin" | "admin-disabled" | "invalid-token"

/** Why the API could not be reached, as precisely as a browser can tell. */
export type Unreachable = "down" | "cors" | "mixed-content" | "not-api"

/**
 * A failed fetch looks the same whether the server is down or the browser blocked it (CORS).
 * A `no-cors` request tells them apart: it succeeds (opaque) whenever the server answers at all.
 */
export async function diagnose(base: string, err: unknown): Promise<Unreachable> {
  if ((err as ApiError)?.status === 502) return "not-api"
  const url = `${base}/health/live`
  if (location.protocol === "https:" && url.startsWith("http:")) return "mixed-content"
  if (!/^https?:/.test(url)) return "down" // same-origin path: no CORS involved
  try {
    await fetch(url, { mode: "no-cors", cache: "no-store", signal: AbortSignal.timeout(5000) })
    return "cors"
  } catch {
    return "down"
  }
}

interface Prefs {
  maskPii: boolean
  reviewer: string
}

interface ConnectionState {
  baseUrl: string
  adminToken: string
  remember: boolean
  role: Role
  checking: boolean
  reachable: boolean | null
  prefs: Prefs
  isAdmin: boolean
  unreachable?: Unreachable
  connect: (baseUrl: string, token: string, remember: boolean) => Promise<Role>
  signOut: () => void
  setPrefs: (p: Partial<Prefs>) => void
  authPromptOpen: boolean
  setAuthPromptOpen: (o: boolean) => void
}

const Ctx = React.createContext<ConnectionState | null>(null)
const DEFAULT_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ""
const K = { base: "ca.baseUrl", token: "ca.adminToken", prefs: "ca.prefs" }

function read(key: string) {
  try {
    return sessionStorage.getItem(key) ?? localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Probe what this token can do: admin endpoints answer 401 (bad token) or 403 (disabled on server). */
export async function probeRole(): Promise<{ role: Role; reachable: boolean; why?: Unreachable }> {
  try {
    await request("/health/live", { timeoutMs: 6000 })
  } catch (e) {
    return { role: "unknown", reachable: false, why: await diagnose(getConnection().baseUrl, e) }
  }
  if (!getConnection().adminToken) return { role: "operator", reachable: true }
  try {
    await request("/v1/review", { query: { limit: 1 }, timeoutMs: 8000 })
    return { role: "admin", reachable: true }
  } catch (e) {
    const err = e as ApiError
    if (err.status === 403) return { role: "admin-disabled", reachable: true }
    if (err.status === 401) return { role: "invalid-token", reachable: true }
    return { role: "operator", reachable: true }
  }
}

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient()
  const [baseUrl, setBaseUrl] = React.useState(() => read(K.base) ?? DEFAULT_BASE)
  const [adminToken, setToken] = React.useState(() => read(K.token) ?? "")
  const [remember, setRemember] = React.useState(() => {
    try {
      return !!localStorage.getItem(K.token)
    } catch {
      return false
    }
  })
  const [role, setRole] = React.useState<Role>("unknown")
  const [reachable, setReachable] = React.useState<boolean | null>(null)
  const [checking, setChecking] = React.useState(true)
  const [authPromptOpen, setAuthPromptOpen] = React.useState(false)
  const [unreachable, setUnreachable] = React.useState<Unreachable | undefined>()
  const [prefs, setPrefsState] = React.useState<Prefs>(() => {
    try {
      return { maskPii: true, reviewer: "", ...JSON.parse(localStorage.getItem(K.prefs) ?? "{}") }
    } catch {
      return { maskPii: true, reviewer: "" }
    }
  })

  setConnection({ baseUrl, adminToken })

  const evaluate = React.useCallback(async () => {
    setChecking(true)
    const r = await probeRole()
    setUnreachable(r.why)
    setRole(adminToken ? r.role : r.reachable ? "operator" : "unknown")
    setReachable(r.reachable)
    setChecking(false)
    return adminToken ? r.role : "operator"
  }, [adminToken])

  React.useEffect(() => {
    evaluate()
  }, [evaluate, baseUrl])

  // a 401 anywhere means the token stopped working (rotated on the server): ask again
  React.useEffect(() => {
    const off = onApiError((e) => {
        if (e.status === 401 && getConnection().adminToken) {
          setRole("invalid-token")
          setAuthPromptOpen(true)
        }
        if (e.status === 0 || e.status === 502) setReachable(false)
    })
    return () => {
      off()
    }
  }, [])

  const connect = async (b: string, token: string, rem: boolean) => {
    const clean = b.trim().replace(/\/+$/, "").replace(/\/v1$/, "")
    setConnection({ baseUrl: clean, adminToken: token.trim() })
    const r = await probeRole()
    setUnreachable(r.why)
    const newRole: Role = token.trim() ? r.role : r.reachable ? "operator" : "unknown"
    if (newRole === "invalid-token" || !r.reachable) {
      setConnection({ baseUrl, adminToken })
      return newRole
    }
    try {
      sessionStorage.removeItem(K.token)
      localStorage.removeItem(K.token)
      localStorage.setItem(K.base, clean)
      if (token.trim()) (rem ? localStorage : sessionStorage).setItem(K.token, token.trim())
    } catch {
      /* storage blocked: keep in memory */
    }
    setBaseUrl(clean)
    setToken(token.trim())
    setRemember(rem)
    setRole(newRole)
    setReachable(true)
    qc.invalidateQueries()
    return newRole
  }

  const signOut = () => {
    try {
      sessionStorage.removeItem(K.token)
      localStorage.removeItem(K.token)
    } catch {
      /* ignore */
    }
    setToken("")
    setRole(reachable ? "operator" : "unknown")
    qc.removeQueries()
  }

  const setPrefs = (p: Partial<Prefs>) =>
    setPrefsState((o) => {
      const n = { ...o, ...p }
      try {
        localStorage.setItem(K.prefs, JSON.stringify(n))
      } catch {
        /* ignore */
      }
      return n
    })

  return (
    <Ctx.Provider value={{ baseUrl, adminToken, remember, role, checking, reachable, prefs, isAdmin: role === "admin", unreachable, connect, signOut, setPrefs, authPromptOpen, setAuthPromptOpen }}>
      {children}
    </Ctx.Provider>
  )
}

export function useConnection() {
  const c = React.useContext(Ctx)
  if (!c) throw new Error("useConnection outside ConnectionProvider")
  return c
}
