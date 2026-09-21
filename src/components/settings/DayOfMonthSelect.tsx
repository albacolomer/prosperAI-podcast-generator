import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DAY_OF_MONTH_OPTIONS } from "@/lib/scheduleText"

interface DayOfMonthSelectProps {
  value: number
  onChange: (day: number) => void
  disabled?: boolean
}

/** Days 1 to 28 only: 29-31 do not exist in every month. */
export function DayOfMonthSelect({ value, onChange, disabled }: DayOfMonthSelectProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">Day of the month</span>
      <Select value={String(value)} onValueChange={(next) => onChange(Number(next))} disabled={disabled}>
        <SelectTrigger className="w-full" aria-label="Day of the month">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {DAY_OF_MONTH_OPTIONS.map(({ value: day, label }) => (
            <SelectItem key={day} value={String(day)}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
