import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { ScheduleFrequency } from "@/types"

const frequencyOptions: { value: ScheduleFrequency; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekdays", label: "Weekdays" },
  { value: "weekly", label: "Weekly" },
  { value: "custom", label: "Custom" },
]

interface ScheduleFrequencySelectProps {
  value: ScheduleFrequency
  onChange: (frequency: ScheduleFrequency) => void
  disabled?: boolean
}

export function ScheduleFrequencySelect({ value, onChange, disabled }: ScheduleFrequencySelectProps) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as ScheduleFrequency)} disabled={disabled}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {frequencyOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
