import { useSyncExternalStore } from "react"
import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

export interface BarRow {
  name: string
  value: number
  /** Printed at the end of the bar; defaults to the formatted value. */
  label?: string
  /** Shown in the tooltip instead of the formatted value (a share, a request count). */
  detail?: string
}

interface BarListProps {
  rows: BarRow[]
  /** What the bars measure, for the tooltip and the accessible name. */
  seriesLabel: string
  color: string
  formatValue: (value: number) => string
  /** Width reserved for the names on the left (capped on narrow screens, where long names wrap). */
  nameWidth?: number
  /** Width reserved on the right for the value printed at the end of a bar. */
  labelWidth?: number
  /** Shortens a name on the axis; the tooltip keeps the full one. */
  formatName?: (name: string) => string
}

const ROW_HEIGHT = 34
const NARROW_QUERY = "(max-width: 639px)"
const NARROW_NAME_WIDTH = 104

/** Recharts sizes its margins in pixels, so the narrow-screen layout has to be chosen in JS. */
function useNarrowScreen(): boolean {
  return useSyncExternalStore(
    (notify) => {
      if (typeof window.matchMedia !== "function") return () => undefined
      const query = window.matchMedia(NARROW_QUERY)
      query.addEventListener("change", notify)
      return () => query.removeEventListener("change", notify)
    },
    () => typeof window.matchMedia === "function" && window.matchMedia(NARROW_QUERY).matches,
    () => false,
  )
}

/** Ranked horizontal bars with the value printed at the end of each. One series, so one hue. */
export function BarList({ rows, seriesLabel, color, formatValue, nameWidth = 132, labelWidth = 56, formatName }: BarListProps) {
  const narrow = useNarrowScreen()
  const config: ChartConfig = { value: { label: seriesLabel, color } }
  const data = rows.map((row) => ({ ...row, label: row.label ?? formatValue(row.value) }))

  return (
    <ChartContainer
      config={config}
      className="aspect-auto w-full"
      style={{ height: data.length * ROW_HEIGHT + 16 }}
      role="img"
      aria-label={seriesLabel}
    >
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: labelWidth, top: 0, bottom: 0 }} barCategoryGap={6}>
        <XAxis type="number" hide domain={[0, "dataMax"]} />
        <YAxis
          type="category"
          dataKey="name"
          tickLine={false}
          axisLine={false}
          width={narrow ? Math.min(nameWidth, NARROW_NAME_WIDTH) : nameWidth}
          tick={{ fontSize: 12 }}
          tickFormatter={formatName}
          interval={0}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              formatter={(value, _name, item) => (
                <div className="flex flex-1 items-center justify-between gap-3 leading-none">
                  <span className="text-muted-foreground">{seriesLabel}</span>
                  <span className="font-mono font-medium text-foreground tabular-nums">
                    {(item.payload as BarRow).detail ?? formatValue(Number(value))}
                  </span>
                </div>
              )}
            />
          }
        />
        <Bar dataKey="value" fill="var(--color-value)" radius={[0, 4, 4, 0]} barSize={16}>
          <LabelList dataKey="label" position="right" className="fill-foreground tabular-nums" fontSize={12} />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
