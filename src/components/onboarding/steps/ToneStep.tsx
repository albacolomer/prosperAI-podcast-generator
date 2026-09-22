import { Button } from "@/components/ui/button"
import { tones } from "@/data/tones"
import { cn } from "@/lib/utils"
import type { Tone } from "@/types"

interface ToneStepProps {
  value: Tone
  onChange: (tone: Tone) => void
  onNext: () => void
}

/** The same six tones (labels, values and descriptions) as Home's Podcast Settings — data/tones.ts is the single source. */
export function ToneStep({ value, onChange, onNext }: ToneStepProps) {
  const selected = tones.find((option) => option.id === value)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">How should your podcast feel?</h2>
        <p className="mt-1 text-muted-foreground">Choose the style that sounds most like you.</p>
      </div>

      <div className="flex flex-col gap-2">
        {tones.map((option) => {
          const isSelected = option.id === value
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(option.id)}
              aria-pressed={isSelected}
              className={cn(
                "flex items-center justify-between gap-3 rounded-xl border p-4 text-left transition-colors",
                isSelected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-foreground/20",
              )}
            >
              <span className="flex flex-col gap-0.5">
                <span className={cn("font-semibold", isSelected ? "text-primary" : "text-foreground")}>{option.label}</span>
                <span className="text-sm text-muted-foreground">{option.description}</span>
              </span>
              <span
                className={cn(
                  "size-4 shrink-0 rounded-full border-2",
                  isSelected ? "border-primary bg-primary" : "border-border",
                )}
              />
            </button>
          )
        })}
      </div>

      {selected ? <p className="text-xs font-medium text-primary">We'll shape today's episode around a {selected.label.toLowerCase()} feel.</p> : null}

      <Button type="button" size="lg" onClick={onNext} className="w-full rounded-full sm:w-auto sm:self-end">
        Continue
      </Button>
    </div>
  )
}
