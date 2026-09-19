import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

export type DashboardRange = 30 | 90

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
      onValueChange={(next) => {
        if (next) onChange(Number(next) as DashboardRange)
      }}
    >
      <ToggleGroupItem value="30">Last 30 days</ToggleGroupItem>
      <ToggleGroupItem value="90">Last 90 days</ToggleGroupItem>
    </ToggleGroup>
  )
}
