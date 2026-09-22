import { Check, Plus, X } from "lucide-react"
import { AddInterestDialog } from "@/components/interests/AddInterestDialog"
import { Button } from "@/components/ui/button"
import { onboardingInterests } from "@/data/onboardingOptions"
import { cn } from "@/lib/utils"
import { MAX_ONBOARDING_INTERESTS, MIN_ONBOARDING_INTERESTS } from "@/types/onboarding"

interface InterestsStepProps {
  selected: string[]
  onToggle: (label: string) => void
  onAddCustom: (label: string) => void
  onNext: () => void
}

const selectedChipClass = "bg-primary text-primary-foreground ring-primary"
const unselectedChipClass = "bg-secondary text-foreground ring-transparent hover:bg-secondary/70"

export function InterestsStep({ selected, onToggle, onAddCustom, onNext }: InterestsStepProps) {
  const atMax = selected.length >= MAX_ONBOARDING_INTERESTS
  const canContinue = selected.length >= MIN_ONBOARDING_INTERESTS
  // Anything selected that isn't one of the curated chips is a custom interest, added the same way Home's "+ Add" does.
  const customInterests = selected.filter((label) => !onboardingInterests.includes(label))

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">What are you curious about?</h2>
        <p className="mt-1 text-muted-foreground">Pick a few topics you'd like to hear about.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {onboardingInterests.map((interest) => {
          const isSelected = selected.includes(interest)
          const disabled = !isSelected && atMax
          return (
            <button
              key={interest}
              type="button"
              onClick={() => onToggle(interest)}
              disabled={disabled}
              aria-pressed={isSelected}
              className={cn(
                "inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium ring-1 transition-colors",
                isSelected ? selectedChipClass : unselectedChipClass,
                disabled && "cursor-not-allowed opacity-40 hover:bg-secondary",
              )}
            >
              {isSelected ? <Check className="size-3.5" /> : null}
              {interest}
            </button>
          )
        })}

        {/* Custom interests look exactly like a selected curated chip — just with a remove control, since they only exist while selected. */}
        {customInterests.map((label) => (
          <span key={label} className={cn("inline-flex h-10 items-center gap-1.5 rounded-full pr-2 pl-4 text-sm font-medium ring-1", selectedChipClass)}>
            <Check className="size-3.5" />
            {label}
            <button
              type="button"
              onClick={() => onToggle(label)}
              aria-label={`Remove ${label}`}
              className="flex size-5 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-primary-foreground/20"
            >
              <X className="size-3.5" />
            </button>
          </span>
        ))}

        <AddInterestDialog
          existingLabels={[...onboardingInterests, ...selected]}
          onAdd={onAddCustom}
          trigger={
            <button
              type="button"
              disabled={atMax}
              className={cn(
                "flex h-10 items-center gap-1 rounded-full border border-dashed border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground",
                atMax && "cursor-not-allowed opacity-40 hover:border-border hover:text-muted-foreground",
              )}
            >
              <Plus className="size-3.5" />
              Add interest
            </button>
          }
        />
      </div>

      <div className="flex min-h-5 flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>
          {selected.length} of {MAX_ONBOARDING_INTERESTS} selected · pick at least {MIN_ONBOARDING_INTERESTS}
        </span>
        {selected.length > 0 ? (
          <span className="font-medium text-primary">Your podcast will prioritize stories around these topics.</span>
        ) : null}
      </div>

      <Button type="button" size="lg" onClick={onNext} disabled={!canContinue} className="w-full rounded-full sm:w-auto sm:self-end">
        Continue
      </Button>
    </div>
  )
}
