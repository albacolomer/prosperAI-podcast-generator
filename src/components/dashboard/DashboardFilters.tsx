import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { DashboardRange } from "@/types"

const DASHBOARD_RANGES: DashboardRange[] = [7, 30, 90]

interface DashboardFiltersProps {
  value: DashboardRange
  onChange: (range: DashboardRange) => void
}

export function DashboardFilters({ value, onChange }: DashboardFiltersProps) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={String(value)}
      aria-label="Date range"
      onValueChange={(next) => {
        if (next) onChange(Number(next) as DashboardRange)
      }}
    >
      {DASHBOARD_RANGES.map((days) => (
        <ToggleGroupItem key={days} value={String(days)}>
          Last {days} days
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
