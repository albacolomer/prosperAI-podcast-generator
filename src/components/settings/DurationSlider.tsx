import { Slider } from "@/components/ui/slider"
import { formatDuration } from "@/lib/format"

interface DurationSliderProps {
  value: number
  onChange: (minutes: number) => void
  disabled?: boolean
}

export function DurationSlider({ value, onChange, disabled }: DurationSliderProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">0 min</span>
        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-sm font-medium text-foreground">
          {formatDuration(value * 60)}
        </span>
        <span className="text-xs text-muted-foreground">1 hr</span>
      </div>
      <Slider
        value={[value]}
        onValueChange={([next]) => onChange(next)}
        min={0}
        max={60}
        step={1}
        disabled={disabled}
        aria-label="Episode duration in minutes"
      />
    </div>
  )
}
