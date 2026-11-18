import * as React from "react"
import { HashRouter, Link, Route, Routes, useLocation } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Moon, PlugZap, RefreshCw, Sun } from "lucide-react"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AppSidebar } from "@/components/app-sidebar"
import { ThemeProvider, useTheme } from "@/components/theme-provider"
import { useInfo, useReloadRegistry } from "@/api/hooks"
import { ApiError } from "@/api/client"
const DashboardPage = React.lazy(() => import("@/pages/dashboard"))
const ValidatePage = React.lazy(() => import("@/pages/validate"))
const RunsPage = React.lazy(() => import("@/pages/runs"))
const FamiliesPage = React.lazy(() => import("@/pages/families"))
const ReferencesPage = React.lazy(() => import("@/pages/references"))
const SettingsPage = React.lazy(() => import("@/pages/settings"))
const FamilyEditorPage = React.lazy(() => import("@/pages/family-editor"))
const NewFamilyPage = React.lazy(() => import("@/pages/new-family"))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      retry: (n, e) => !(e instanceof ApiError && [401, 403, 404, 422].includes(e.status)) && n < 2,
    },
  },
})

const TITLES: [RegExp, string][] = [
  [/^\/$/, "Dashboard"],
  [/^\/validate/, "Validate a card"],
  [/^\/runs/, "Runs & review"],
  [/^\/registry\/new/, "Add card family"],
  [/^\/registry\/.+/, "Card family"],
  [/^\/registry/, "Card families"],
  [/^\/references/, "Reference cards"],
  [/^\/settings/, "Settings"],
]

function Header() {
  const loc = useLocation()
  const info = useInfo()
  const reload = useReloadRegistry()
  const { theme, setTheme } = useTheme()
  const title = TITLES.find(([r]) => r.test(loc.pathname))?.[1] ?? ""
  const isAdmin = info.data?.auth.role === "admin"
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
      <span className="text-muted-foreground hidden text-sm sm:inline">Card Agent</span>
      <span className="text-muted-foreground hidden text-sm sm:inline">/</span>
      <h1 className="text-sm font-medium">{title}</h1>
      <div className="ml-auto flex items-center gap-2">
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={() => reload.mutate()} disabled={reload.isPending} title="Re-read every YAML and reference image on the service">
            <RefreshCw className={reload.isPending ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Reload registry</span>
          </Button>
        )}
        <Button variant="ghost" size="icon" className="size-8" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">
          {theme === "dark" ? <Sun /> : <Moon />}
        </Button>
      </div>
    </header>
  )
}

/** Shown above every page while the service can't be reached or rejects the key. */
function ConnectionBanner() {
  const loc = useLocation()
  const info = useInfo()
  if (!info.error || loc.pathname.startsWith("/settings")) return null
  const e = info.error as ApiError
  return (
    <Alert variant="destructive" className="mb-4">
      <PlugZap />
      <AlertTitle>{e.status === 401 ? "API key required" : "card-agent service unavailable"}</AlertTitle>
      <AlertDescription>
        <p>{e.message}</p>
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="outline" onClick={() => info.refetch()} disabled={info.isFetching}>Retry</Button>
          <Button size="sm" asChild><Link to="/settings">Connection settings</Link></Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}

function Shell() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Header />
        <div className="min-w-0 flex-1 p-4 md:p-6">
          <ConnectionBanner />
          <React.Suspense fallback={<div className="text-muted-foreground p-6 text-sm">Loading…</div>}>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/validate" element={<ValidatePage />} />
              <Route path="/runs" element={<RunsPage />} />
              <Route path="/registry" element={<FamiliesPage />} />
              <Route path="/registry/new" element={<NewFamilyPage />} />
              <Route path="/registry/:id" element={<FamilyEditorPage />} />
              <Route path="/references" element={<ReferencesPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<p className="text-muted-foreground text-sm">Page not found. <Link to="/" className="underline">Back to the dashboard</Link></p>} />
            </Routes>
          </React.Suspense>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={150}>
          <HashRouter>
            <Shell />
          </HashRouter>
          <Toaster richColors position="bottom-right" />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
