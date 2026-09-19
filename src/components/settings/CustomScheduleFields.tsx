import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { DayOfWeek } from "@/types"

const days: { value: DayOfWeek; label: string }[] = [
  { value: "mon", label: "M" },
  { value: "tue", label: "T" },
  { value: "wed", label: "W" },
  { value: "thu", label: "T" },
  { value: "fri", label: "F" },
  { value: "sat", label: "S" },
  { value: "sun", label: "S" },
]

interface CustomScheduleFieldsProps {
  value: DayOfWeek[]
  onChange: (days: DayOfWeek[]) => void
  disabled?: boolean
}

export function CustomScheduleFields({ value, onChange, disabled }: CustomScheduleFieldsProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">Repeat on</span>
      <ToggleGroup
        type="multiple"
        value={value}
        onValueChange={(next) => onChange(next as DayOfWeek[])}
        variant="outline"
        disabled={disabled}
      >
        {days.map((day) => (
          <ToggleGroupItem key={day.value} value={day.value} aria-label={day.value} className="w-9">
            {day.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}
