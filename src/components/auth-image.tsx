// <img> for service-hosted images. Image tags can't send the API key header, so the bytes are fetched
// with it and shown through an object URL (cached, so lists don't refetch on every render).
import * as React from "react"
import { ImageOff } from "lucide-react"
import { fetchBlob, useConnection } from "@/api/client"
import { cn } from "@/lib/utils"

const cache = new Map<string, Promise<string>>()
const MAX = 400

function load(path: string): Promise<string> {
  let p = cache.get(path)
  if (!p) {
    p = fetchBlob(path).then((b) => URL.createObjectURL(b))
    p.catch(() => cache.delete(path))
    cache.set(path, p)
    if (cache.size > MAX) {
      const [oldest] = cache.keys()
      cache.get(oldest)?.then((u) => URL.revokeObjectURL(u))
      cache.delete(oldest)
    }
  }
  return p
}

/** Drop cached images under a path prefix (after an image was replaced or deleted). */
export function forgetImages(prefix: string) {
  for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k)
}

export function useAuthImage(path: string | null | undefined) {
  const conn = useConnection()
  const [state, setState] = React.useState<{ url: string | null; error: boolean }>({ url: null, error: false })
  React.useEffect(() => {
    if (!path) return setState({ url: null, error: false })
    let live = true
    setState((s) => ({ url: s.url, error: false }))
    load(path).then(
      (url) => live && setState({ url, error: false }),
      () => live && setState({ url: null, error: true })
    )
    return () => {
      live = false
    }
  }, [path, conn.baseUrl, conn.apiKey])
  return state
}

export function AuthImage({ path, alt = "", className, fallbackClassName }: { path: string | null | undefined; alt?: string; className?: string; fallbackClassName?: string }) {
  const { url, error } = useAuthImage(path)
  if (url) return <img src={url} alt={alt} className={className} loading="lazy" />
  return (
    <span className={cn("bg-muted text-muted-foreground flex items-center justify-center", !error && "animate-pulse", className, fallbackClassName)} aria-label={error ? "image unavailable" : "loading image"}>
      {error && <ImageOff className="size-4 opacity-60" />}
    </span>
  )
}

export const runImagePath = (id: string, kind: "original" | "card" = "original", w?: number) => `/v1/runs/${id}/image?kind=${kind}${w ? `&w=${w}` : ""}`
export const refImagePath = (refId: string, w?: number) => {
  const [f, v, ...rest] = refId.split("/")
  return `/v1/registry/refs/${f}/${v}/${encodeURIComponent(rest.join("/"))}${w ? `?w=${w}` : ""}`
}
export const evalImagePath = (file: string, w?: number) => `/v1/eval/cases/${encodeURIComponent(file)}/image${w ? `?w=${w}` : ""}`
