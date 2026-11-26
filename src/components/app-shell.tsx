import * as React from "react"
import { NavLink, useLocation, useNavigate } from "react-router-dom"
import {
  Activity,
  ClipboardCheck,
  CreditCard,
  FlaskConical,
  Gauge,
  History,
  KeyRound,
  LogOut,
  Moon,
  Plus,
  ScanLine,
  Search,
  ServerCog,
  SlidersHorizontal,
  ShieldCheck,
  Sun,
  Eye,
  EyeOff,
  DatabaseZap,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command"
import { Kbd } from "@/components/ui/kbd"
import { useTheme } from "@/components/theme-provider"
import { useConnection } from "@/auth/connection"
import { useCards, useReady, useReviewQueue } from "@/api/queries"
import { cn } from "@/lib/utils"
import { ConnectDialog } from "@/components/connect-dialog"

interface NavItem {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  admin?: boolean
  match?: RegExp
}

const NAV: { label: string; items: NavItem[] }[] = [
  {
    label: "Operations",
    items: [
      { to: "/", label: "Overview", icon: Gauge, admin: true, match: /^\/$/ },
      { to: "/validate", label: "Validate a card", icon: ScanLine },
      { to: "/review", label: "Review queue", icon: ClipboardCheck, admin: true },
      { to: "/runs", label: "Run history", icon: History, admin: true },
    ],
  },
  {
    label: "Card registry",
    items: [
      { to: "/cards", label: "Card programmes", icon: CreditCard },
      { to: "/cards/new", label: "Add programme", icon: Plus, admin: true, match: /^\/cards\/new/ },
      { to: "/registry", label: "Registry & sync", icon: DatabaseZap },
    ],
  },
  {
    label: "Quality",
    items: [
      { to: "/evaluations", label: "Evaluations", icon: FlaskConical, admin: true },
      { to: "/settings", label: "Decision settings", icon: SlidersHorizontal },
    ],
  },
  {
    label: "System",
    items: [{ to: "/system", label: "Health & metrics", icon: Activity }],
  },
]

export const TITLES: [RegExp, string][] = [
  [/^\/$/, "Overview"],
  [/^\/validate/, "Validate a card"],
  [/^\/review/, "Review queue"],
  [/^\/runs\/.+/, "Run"],
  [/^\/runs/, "Run history"],
  [/^\/cards\/new/, "Add programme"],
  [/^\/cards\/.+/, "Card programme"],
  [/^\/cards/, "Card programmes"],
  [/^\/registry/, "Registry & sync"],
  [/^\/evaluations\/sets\/.+/, "Evaluation set"],
  [/^\/evaluations\/.+/, "Evaluation report"],
  [/^\/evaluations/, "Evaluations"],
  [/^\/settings/, "Decision settings"],
  [/^\/system/, "Health & metrics"],
]

function isActive(item: NavItem, path: string) {
  if (item.match) return item.match.test(path)
  if (item.to === "/cards") return path === "/cards" || (/^\/cards\/[^/]+/.test(path) && !path.startsWith("/cards/new"))
  return path === item.to || path.startsWith(item.to + "/")
}

function AppSidebar() {
  const loc = useLocation()
  const c = useConnection()
  const ready = useReady()
  const queue = useReviewQueue({}, c.isAdmin)
  const pending = c.isAdmin ? queue.data?.pages[0]?.pending : undefined
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <NavLink to="/validate">
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <ShieldCheck className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Card Agent</span>
                  <span className="text-muted-foreground truncate text-xs">Enterprise console</span>
                </div>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {NAV.map((g) => (
          <SidebarGroup key={g.label}>
            <SidebarGroupLabel>{g.label}</SidebarGroupLabel>
            <SidebarMenu>
              {g.items.map((it) => {
                const locked = it.admin && !c.isAdmin
                return (
                  <SidebarMenuItem key={it.to}>
                    <SidebarMenuButton asChild isActive={isActive(it, loc.pathname)} tooltip={it.label}>
                      <NavLink to={it.to} className={cn(locked && "opacity-60")}>
                        <it.icon />
                        <span>{it.label}</span>
                        {locked && <KeyRound className="ml-auto size-3.5 opacity-60" aria-label="admin only" />}
                      </NavLink>
                    </SidebarMenuButton>
                    {it.to === "/review" && !!pending && <SidebarMenuBadge className="bg-review/25 text-foreground">{pending}</SidebarMenuBadge>}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <div className="bg-sidebar-accent/60 space-y-1 rounded-md p-2 text-xs group-data-[collapsible=icon]:hidden">
          <div className="flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", ready.data ? "bg-accept" : ready.isError ? "bg-reject" : "bg-muted-foreground")} />
            <span className="font-medium">{ready.data ? "Ready" : ready.isError ? "Unavailable" : "Checking…"}</span>
            {ready.data && <span className="text-muted-foreground ml-auto">v{ready.data.version}</span>}
          </div>
          {ready.data && (
            <div className="text-muted-foreground font-mono">
              registry {ready.data.registry} · {ready.data.families} prog · {ready.data.references} refs
            </div>
          )}
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function HealthPill() {
  const ready = useReady()
  const nav = useNavigate()
  const ok = !!ready.data
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button onClick={() => nav("/system")} className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs", ok ? "border-accept/40" : "border-reject/40 bg-reject/8")}>
          <span className={cn("size-2 rounded-full", ok ? "bg-accept" : ready.isLoading ? "bg-muted-foreground animate-pulse" : "bg-reject animate-pulse")} />
          <span className="hidden md:inline">{ok ? "API ready" : ready.isLoading ? "Checking" : "API unavailable"}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {ok ? `Qdrant reachable · ${ready.data!.embedder} · ${ready.data!.ocr}${ready.data!.settings_overrides ? " · settings overridden" : ""}` : (ready.error as Error)?.message ?? "checking /health/ready"}
      </TooltipContent>
    </Tooltip>
  )
}

function CommandMenu({ open, setOpen }: { open: boolean; setOpen: (o: boolean) => void }) {
  const nav = useNavigate()
  const c = useConnection()
  const cards = useCards()
  const [q, setQ] = React.useState("")
  const go = (to: string) => {
    setOpen(false)
    nav(to)
  }
  const looksLikeId = /^[0-9a-f]{32}$/i.test(q.trim())
  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Go to" description="Navigate or open a run by id">
      <CommandInput placeholder="Search pages, programmes, or paste a run id…" value={q} onValueChange={setQ} />
      <CommandList>
        <CommandEmpty>No match.</CommandEmpty>
        {looksLikeId && c.isAdmin && (
          <CommandGroup heading="Run">
            <CommandItem onSelect={() => go(`/runs/${q.trim()}`)}>
              <History /> Open run {q.trim().slice(0, 12)}…
            </CommandItem>
          </CommandGroup>
        )}
        <CommandGroup heading="Pages">
          {NAV.flatMap((g) => g.items).map((it) => (
            <CommandItem key={it.to} onSelect={() => go(it.to)} value={it.label}>
              <it.icon /> {it.label}
            </CommandItem>
          ))}
        </CommandGroup>
        {cards.data?.items?.length ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Card programmes">
              {cards.data.items.map((f) => (
                <CommandItem key={f.family} value={`${f.name} ${f.family}`} onSelect={() => go(`/cards/${f.family}`)}>
                  <CreditCard /> {f.name} <span className="text-muted-foreground ml-auto font-mono text-xs">{f.family}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}
      </CommandList>
    </CommandDialog>
  )
}

function Header() {
  const loc = useLocation()
  const { theme, setTheme } = useTheme()
  const c = useConnection()
  const [cmd, setCmd] = React.useState(false)
  const title = TITLES.find(([r]) => r.test(loc.pathname))?.[1] ?? ""
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setCmd((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
  React.useEffect(() => {
    document.title = title ? `${title} · Card Agent` : "Card Agent"
  }, [title])
  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 rounded-t-xl border-b px-4 backdrop-blur">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
      <h2 className="min-w-0 truncate text-sm font-medium">{title}</h2>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Button variant="outline" size="sm" className="text-muted-foreground hidden justify-start sm:flex xl:w-56" onClick={() => setCmd(true)} aria-label="Go to… (Ctrl K)">
          <Search /> <span className="hidden xl:inline">Go to…</span>
          <Kbd className="ml-auto hidden xl:inline-flex">Ctrl K</Kbd>
        </Button>
        <HealthPill />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" onClick={() => c.setPrefs({ maskPii: !c.prefs.maskPii })} aria-label="Toggle personal data masking">
              {c.prefs.maskPii ? <EyeOff /> : <Eye />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{c.prefs.maskPii ? "Personal data masked — click to reveal" : "Personal data visible — click to mask"}</TooltipContent>
        </Tooltip>
        <Button variant={c.isAdmin ? "outline" : "default"} size="sm" onClick={() => c.setAuthPromptOpen(true)}>
          {c.isAdmin ? <ShieldCheck className="text-accept" /> : <KeyRound />}
          <span className="hidden lg:inline">{c.isAdmin ? "Admin" : c.role === "admin-disabled" ? "Operator (admin off)" : "Sign in"}</span>
        </Button>
        {c.isAdmin && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" onClick={c.signOut} aria-label="Sign out">
                <LogOut />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Forget the admin token</TooltipContent>
          </Tooltip>
        )}
        <Button variant="ghost" size="icon" className="size-8" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">
          {theme === "dark" ? <Sun /> : <Moon />}
        </Button>
      </div>
      <CommandMenu open={cmd} setOpen={setCmd} />
    </header>
  )
}

function UnreachableBanner() {
  const ready = useReady()
  const c = useConnection()
  if (ready.data || ready.isLoading) return null
  return (
    <div className="border-reject/30 bg-reject/8 flex flex-wrap items-center gap-3 border-b px-4 py-2 text-sm">
      <ServerCog className="text-reject size-4" />
      <span>
        <b>The card agent API is not answering.</b> {(ready.error as Error)?.message} Data shown may be stale.
      </span>
      <Button size="sm" variant="outline" className="ml-auto h-7" onClick={() => c.setAuthPromptOpen(true)}>
        Connection settings
      </Button>
      <Button size="sm" variant="outline" className="h-7" onClick={() => ready.refetch()}>
        Retry
      </Button>
    </div>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const c = useConnection()
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Header />
        <UnreachableBanner />
        {c.role === "admin-disabled" && (
          <div className="bg-muted/50 text-muted-foreground border-b px-4 py-1.5 text-xs">
            Admin endpoints are disabled on this server — validation and read-only views only. <Badge variant="outline">CARDAGENT_API__ADMIN_TOKEN</Badge>
          </div>
        )}
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>
      <ConnectDialog />
    </SidebarProvider>
  )
}
