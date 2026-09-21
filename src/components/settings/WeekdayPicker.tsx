import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { WEEKDAY_NAMES } from "@/lib/scheduleText"
import { DAYS_OF_WEEK } from "@/types"
import type { DayOfWeek } from "@/types"

interface WeekdayPickerProps {
  value: DayOfWeek
  onChange: (day: DayOfWeek) => void
  disabled?: boolean
}

/** Exactly one weekday: pressing the chosen day again does not clear it. */
export function WeekdayPicker({ value, onChange, disabled }: WeekdayPickerProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">Delivered on</span>
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(next) => next && onChange(next as DayOfWeek)}
        variant="outline"
        disabled={disabled}
        aria-label="Day of the week"
      >
        {DAYS_OF_WEEK.map((day) => (
          <ToggleGroupItem key={day} value={day} aria-label={WEEKDAY_NAMES[day]} className="w-9">
            {WEEKDAY_NAMES[day].slice(0, 2)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}
