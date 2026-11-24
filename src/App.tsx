import * as React from "react"
import { HashRouter, Navigate, Route, Routes } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ThemeProvider } from "@/components/theme-provider"
import { ConnectionProvider } from "@/auth/connection"
import { AppShell } from "@/components/app-shell"
import { ApiError } from "@/api/client"
import ValidatePage from "@/pages/validate"

const OverviewPage = React.lazy(() => import("@/pages/overview"))
const ReviewPage = React.lazy(() => import("@/pages/review"))
const RunsPage = React.lazy(() => import("@/pages/runs"))
const RunDetailPage = React.lazy(() => import("@/pages/run-detail"))
const CardsPage = React.lazy(() => import("@/pages/cards"))
const CardDetailPage = React.lazy(() => import("@/pages/card-detail"))
const CardNewPage = React.lazy(() => import("@/pages/card-new"))
const RegistryPage = React.lazy(() => import("@/pages/registry"))
const SettingsPage = React.lazy(() => import("@/pages/settings"))
const EvaluationsPage = React.lazy(() => import("@/pages/evaluations"))
const EvaluationDetailPage = React.lazy(() => import("@/pages/evaluation-detail"))
const EvaluationSetPage = React.lazy(() => import("@/pages/evaluation-set"))
const SystemPage = React.lazy(() => import("@/pages/system"))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: true,
      // never retry client errors (auth, validation, not found); retry 503 / network twice with backoff
      retry: (count, e) => {
        const s = (e as ApiError)?.status
        return (s === 503 || s === 0 || s === undefined) && count < 2
      },
      retryDelay: (n, e) => ((e as ApiError)?.retryAfter ?? 2 ** n) * 1000,
    },
  },
})

function Fallback() {
  return <div className="text-muted-foreground p-6 text-sm">Loading…</div>
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ConnectionProvider>
          <TooltipProvider delayDuration={150}>
            <HashRouter>
              <AppShell>
                <React.Suspense fallback={<Fallback />}>
                  <Routes>
                    <Route path="/" element={<OverviewPage />} />
                    <Route path="/validate" element={<ValidatePage />} />
                    <Route path="/review" element={<ReviewPage />} />
                    <Route path="/runs" element={<RunsPage />} />
                    <Route path="/runs/:id" element={<RunDetailPage />} />
                    <Route path="/cards" element={<CardsPage />} />
                    <Route path="/cards/new" element={<CardNewPage />} />
                    <Route path="/cards/:id" element={<CardDetailPage />} />
                    <Route path="/registry" element={<RegistryPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/evaluations" element={<EvaluationsPage />} />
                    <Route path="/evaluations/sets/:id" element={<EvaluationSetPage />} />
                    <Route path="/evaluations/:id" element={<EvaluationDetailPage />} />
                    <Route path="/system" element={<SystemPage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </React.Suspense>
              </AppShell>
            </HashRouter>
            <Toaster richColors position="bottom-right" />
          </TooltipProvider>
        </ConnectionProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
