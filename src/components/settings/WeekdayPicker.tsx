import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { WEEKDAY_NAMES } from "@/lib/scheduleText"
import { DAYS_OF_WEEK } from "@/types"
import type { DayOfWeek } from "@/types"

interface WeekdayPickerProps {
  value: DayOfWeek
  onChange: (day: DayOfWeek) => void
  disabled?: boolean
}

/**
 * Exactly one weekday: pressing the chosen day again does not clear it. The chosen day is filled with the accent colour; the
 * default toggle style (the muted grey, which is also the hover colour and almost the panel's own) did not read as chosen.
 */
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
          <ToggleGroupItem
            key={day}
            value={day}
            aria-label={WEEKDAY_NAMES[day]}
            className="size-8 rounded-full px-0 data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary/90 data-[state=on]:hover:text-primary-foreground"
          >
            {WEEKDAY_NAMES[day].slice(0, 2)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}
