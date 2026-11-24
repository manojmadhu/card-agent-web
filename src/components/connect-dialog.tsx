import * as React from "react"
import { KeyRound, Loader2, PlugZap, ShieldCheck } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useConnection, type Role, type Unreachable } from "@/auth/connection"

const MSG: Partial<Record<Role, string>> = {
  "invalid-token": "The server rejected this admin token (HTTP 401).",
  "admin-disabled": "Connected, but the server has admin endpoints disabled (no CARDAGENT_API__ADMIN_TOKEN). Only validation and read-only views are available.",
}

function UnreachableHelp({ why, base }: { why?: Unreachable; base: string }) {
  const origin = window.location.origin
  const api = base.trim().replace(/\/+$/, "").replace(/\/v1$/, "") || origin
  const live = `${api}/health/live`
  const code = "bg-muted rounded px-1 font-mono text-[11px] break-all"
  if (why === "cors")
    return (
      <div className="space-y-1.5">
        <p><b>The API is running, but the browser blocked the request (CORS).</b> Allow this console's address on the API server and restart it:</p>
        <p className={code}>CARDAGENT_API__CORS_ORIGINS=[&quot;{origin}&quot;]</p>
        <p className="text-xs">PowerShell: <span className={code}>$env:CARDAGENT_API__CORS_ORIGINS = '["{origin}"]'</span>. The address must match exactly, including <span className="font-mono">localhost</span> vs <span className="font-mono">127.0.0.1</span> and the port. Or avoid CORS: leave this field empty and start the console with <span className={code}>CARD_AGENT_API={api}</span>.</p>
      </div>
    )
  if (why === "mixed-content")
    return <p><b>Blocked as mixed content:</b> this console is on HTTPS, the API on plain HTTP. Serve the API over HTTPS, or put it behind the console's reverse proxy (leave this field empty).</p>
  if (why === "not-api")
    return <p><b>That address is a web page, not the card-agent API.</b> Point it at the API server (its <span className="font-mono">/health/live</span> must answer <span className="font-mono">{'{"status":"ok"}'}</span>).</p>
  return (
    <div className="space-y-1.5">
      <p><b>Nothing answered at {api}.</b> The API is not running there, the port is wrong (the card-agent default is 8080), or a firewall blocks it.</p>
      <p className="text-xs">Check by opening <a href={live} target="_blank" rel="noreferrer" className="underline">{live}</a> in a new tab — it should show <span className="font-mono">{'{"status":"ok"}'}</span>.</p>
    </div>
  )
}

export function ConnectDialog() {
  const c = useConnection()
  const [base, setBase] = React.useState(c.baseUrl)
  const [token, setToken] = React.useState("")
  const [remember, setRemember] = React.useState(c.remember)
  const [busy, setBusy] = React.useState(false)
  const [result, setResult] = React.useState<Role | null>(null)
  React.useEffect(() => {
    if (c.authPromptOpen) {
      setBase(c.baseUrl)
      setToken("")
      setResult(null)
    }
  }, [c.authPromptOpen, c.baseUrl])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const r = await c.connect(base, token, remember)
    setBusy(false)
    setResult(r)
    if (r === "admin" || (r === "operator" && !token)) c.setAuthPromptOpen(false)
  }

  return (
    <Dialog open={c.authPromptOpen} onOpenChange={c.setAuthPromptOpen}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><PlugZap className="size-5" /> Connect to the card agent</DialogTitle>
            <DialogDescription>Validation is open. Card management, runs, statistics, settings and evaluations need the admin token.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="base">API base URL</Label>
            <Input id="base" value={base} onChange={(e) => setBase(e.target.value)} placeholder="(same origin) or http://card-agent.internal:8080" className="font-mono text-sm" />
            <p className="text-muted-foreground text-xs">Leave empty when the console is served behind the same reverse proxy as the API.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="token">Admin token</Label>
            <Input id="token" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="X-Admin-Token (optional for validation only)" autoComplete="off" className="font-mono" />
          </div>
          <div className="flex items-start gap-2">
            <Checkbox id="remember" checked={remember} onCheckedChange={(v) => setRemember(!!v)} />
            <Label htmlFor="remember" className="text-sm leading-snug font-normal">
              Remember on this device
              <span className="text-muted-foreground block text-xs">Off: the token is forgotten when this tab closes. Do not enable on shared computers.</span>
            </Label>
          </div>
          {result === "unknown" && (
            <Alert variant="destructive">
              <AlertDescription className="text-sm">
                <UnreachableHelp why={c.unreachable} base={base} />
              </AlertDescription>
            </Alert>
          )}
          {result && result !== "admin" && result !== "unknown" && MSG[result] && (
            <Alert variant={result === "admin-disabled" ? "default" : "destructive"}>
              <AlertDescription>{MSG[result]}</AlertDescription>
            </Alert>
          )}
          <DialogFooter className="gap-2">
            {c.adminToken && (
              <Button type="button" variant="ghost" onClick={() => { c.signOut(); c.setAuthPromptOpen(false) }}>
                Sign out
              </Button>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : token ? <KeyRound /> : <ShieldCheck />}
              {token ? "Connect as admin" : "Connect"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
