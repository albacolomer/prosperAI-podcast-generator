import { AudioLines } from "lucide-react"

/** Same markup/classes as NavBar's logo (position, size, sticky bar) so /onboarding and the simulated Home match real Home exactly. */
export function OnboardingBrandHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center px-4 sm:px-6">
        <div className="flex items-center gap-2 font-semibold tracking-tight text-foreground">
          <AudioLines className="size-6 text-primary" strokeWidth={2.5} />
          <span className="text-base">ProsperPod</span>
        </div>
      </div>
    </header>
  )
}
