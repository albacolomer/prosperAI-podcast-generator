import { ChevronLeft } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const TOTAL_STEPS = 5

interface OnboardingStepShellProps {
  step: number
  onBack?: () => void
  children: ReactNode
}

export function OnboardingStepShell({ step, onBack, children }: OnboardingStepShellProps) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div className="flex items-center gap-3">
        {onBack ? (
          <Button type="button" variant="ghost" size="icon-sm" onClick={onBack} aria-label="Go back">
            <ChevronLeft className="size-4" />
          </Button>
        ) : (
          <div className="size-7" aria-hidden="true" />
        )}

        <div className="flex flex-1 items-center gap-2">
          <div className="flex h-1.5 flex-1 gap-1">
            {Array.from({ length: TOTAL_STEPS }, (_, index) => (
              <div
                key={index}
                className={cn("h-full flex-1 rounded-full bg-muted transition-colors", index < step && "bg-primary")}
              />
            ))}
          </div>
          <span className="shrink-0 text-xs font-medium text-muted-foreground tabular-nums">
            {step} of {TOTAL_STEPS}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-6">{children}</div>
    </div>
  )
}
