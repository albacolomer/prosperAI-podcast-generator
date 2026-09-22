import { BrowserRouter, Route, Routes } from "react-router-dom"
import { AppShell } from "@/components/layout/AppShell"
import { DashboardPage } from "@/pages/DashboardPage"
import { EpisodesPage } from "@/pages/EpisodesPage"
import { HomePage } from "@/pages/HomePage"
import { NewsDebugPage } from "@/pages/NewsDebugPage"
import { NotFoundPage } from "@/pages/NotFoundPage"
import { OnboardingPage } from "@/pages/OnboardingPage"
import { ROUTES } from "@/lib/constants"

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Standalone: a focused new-user flow, not nested in the app's main navigation. */}
        <Route path={ROUTES.onboarding} element={<OnboardingPage />} />
        <Route element={<AppShell />}>
          <Route path={ROUTES.home} element={<HomePage />} />
          <Route path={ROUTES.episodes} element={<EpisodesPage />} />
          <Route path={ROUTES.dashboard} element={<DashboardPage />} />
          <Route path={ROUTES.newsDebug} element={<NewsDebugPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
