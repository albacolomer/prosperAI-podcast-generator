import { Button } from "@/components/ui/button"
import { onboardingDurations } from "@/data/onboardingOptions"
import { cn } from "@/lib/utils"

interface DurationStepProps {
  value: number
  onChange: (minutes: number) => void
  onNext: () => void
}

export function DurationStep({ value, onChange, onNext }: DurationStepProps) {
  const selected = onboardingDurations.find((option) => option.minutes === value)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">How much time do you have?</h2>
        <p className="mt-1 text-muted-foreground">Choose a format that fits into your day.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {onboardingDurations.map((option) => {
          const isSelected = option.minutes === value
          return (
            <button
              key={option.minutes}
              type="button"
              onClick={() => onChange(option.minutes)}
              aria-pressed={isSelected}
              className={cn(
                "flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-colors",
                isSelected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-foreground/20",
              )}
            >
              <span className={cn("text-lg font-semibold", isSelected ? "text-primary" : "text-foreground")}>{option.label}</span>
              <span className="text-sm text-muted-foreground">{option.tagline}</span>
            </button>
          )
        })}
      </div>

      {selected ? <p className="text-xs font-medium text-primary">{selected.resultNote}</p> : null}

      <Button type="button" size="lg" onClick={onNext} className="w-full rounded-full sm:w-auto sm:self-end">
        Continue
      </Button>
    </div>
  )
}
