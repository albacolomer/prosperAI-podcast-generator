import { Slider } from "@/components/ui/slider"
import { formatDuration } from "@/lib/format"
import { MAX_DURATION_MINUTES, MIN_DURATION_MINUTES } from "@/types"

interface DurationSliderProps {
  value: number
  onChange: (minutes: number) => void
  disabled?: boolean
}

export function DurationSlider({ value, onChange, disabled }: DurationSliderProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">{MIN_DURATION_MINUTES} min</span>
        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-sm font-medium text-foreground">
          {formatDuration(value * 60)}
        </span>
        <span className="text-xs text-muted-foreground">1 hr</span>
      </div>
      <Slider
        value={[value]}
        onValueChange={([next]) => onChange(next)}
        min={MIN_DURATION_MINUTES}
        max={MAX_DURATION_MINUTES}
        step={1}
        disabled={disabled}
        aria-label="Episode duration in minutes"
      />
    </div>
  )
}
