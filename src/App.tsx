import * as React from "react"
import { HashRouter, Route, Routes, useLocation } from "react-router-dom"
import { Moon, RefreshCw, Sun } from "lucide-react"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppSidebar } from "@/components/app-sidebar"
import { ThemeProvider, useTheme } from "@/components/theme-provider"
import { StoreProvider, useStore } from "@/store"
import DashboardPage from "@/pages/dashboard"
import ValidatePage from "@/pages/validate"
import RunsPage from "@/pages/runs"
import FamiliesPage from "@/pages/families"
import ReferencesPage from "@/pages/references"
import SettingsPage from "@/pages/settings"

const FamilyEditorPage = React.lazy(() => import("@/pages/family-editor"))
const NewFamilyPage = React.lazy(() => import("@/pages/new-family"))

const TITLES: [RegExp, string][] = [
  [/^\/$/, "Dashboard"],
  [/^\/validate/, "Validate a card"],
  [/^\/runs/, "Runs & review"],
  [/^\/registry\/new/, "Add card family"],
  [/^\/registry\/.+/, "Card family"],
  [/^\/registry/, "Card families"],
  [/^\/references/, "Reference cards"],
  [/^\/settings/, "Thresholds & settings"],
]

function Header() {
  const loc = useLocation()
  const { reload, indexing } = useStore()
  const { theme, setTheme } = useTheme()
  const title = TITLES.find(([r]) => r.test(loc.pathname))?.[1] ?? ""
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
      <span className="text-muted-foreground text-sm">Card Agent</span>
      <span className="text-muted-foreground text-sm">/</span>
      <h1 className="text-sm font-medium">{title}</h1>
      <div className="ml-auto flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => reload()} disabled={indexing}>
          <RefreshCw className={indexing ? "animate-spin" : ""} />
          <span className="hidden sm:inline">Reload registry</span>
        </Button>
        <Button variant="ghost" size="icon" className="size-8" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">
          {theme === "dark" ? <Sun /> : <Moon />}
        </Button>
      </div>
    </header>
  )
}

function ValidateRoute() {
  const loc = useLocation()
  return <ValidatePage key={loc.search} />
}

function Shell() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Header />
        <div className="flex-1 p-4 md:p-6">
          <React.Suspense fallback={<div className="text-muted-foreground p-6 text-sm">Loading…</div>}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/validate" element={<ValidateRoute />} />
            <Route path="/runs" element={<RunsPage />} />
            <Route path="/registry" element={<FamiliesPage />} />
            <Route path="/registry/new" element={<NewFamilyPage />} />
            <Route path="/registry/:id" element={<FamilyEditorPage />} />
            <Route path="/references" element={<ReferencesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
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
      <StoreProvider>
        <TooltipProvider delayDuration={150}>
          <HashRouter>
            <Shell />
          </HashRouter>
          <Toaster richColors position="bottom-right" />
        </TooltipProvider>
      </StoreProvider>
    </ThemeProvider>
  )
}
