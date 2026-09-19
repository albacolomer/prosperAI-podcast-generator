import { Outlet } from "react-router-dom"
import { NavBar } from "@/components/layout/NavBar"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"

export function AppShell() {
  return (
    <TooltipProvider>
      <div className="min-h-svh bg-background">
        <NavBar />
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
          <Outlet />
        </main>
      </div>
      <Toaster theme="light" position="bottom-right" richColors />
    </TooltipProvider>
  )
}
