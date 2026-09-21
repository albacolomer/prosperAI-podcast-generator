import { Area, AreaChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { formatShortDate } from "@/lib/analytics/format"
import { formatCompactNumber } from "@/lib/format"
import type { TrendPoint } from "@/types"

interface TrendChartProps {
  data: TrendPoint[]
  /** What the value is, shown in the tooltip. */
  seriesLabel: string
  color: string
  formatValue: (value: number) => string
  /** Ticks on the value axis; defaults to compact numbers. */
  formatTick?: (value: number) => string
  /** Rates: zoom the value axis around the data (in 5-point steps, within 0-1) so a few points of movement are visible. */
  rate?: boolean
  variant?: "area" | "line"
}

function rateDomain(data: TrendPoint[]): [number, number] {
  const values = data.map((point) => point.value).filter((value): value is number => value !== null)
  if (values.length === 0) return [0, 1]
  const low = Math.max(0, Math.floor((Math.min(...values) - 0.03) * 20) / 20)
  const high = Math.min(1, Math.ceil((Math.max(...values) + 0.03) * 20) / 20)
  return [low, high]
}

export function TrendChart({ data, seriesLabel, color, formatValue, formatTick = formatCompactNumber, rate = false, variant = "area" }: TrendChartProps) {
  const config: ChartConfig = { value: { label: seriesLabel, color } }
  const margin = { left: 4, right: 8, top: 4 }
  const xAxis = (
    <XAxis
      dataKey="date"
      tickLine={false}
      axisLine={false}
      tickMargin={8}
      minTickGap={36}
      tickFormatter={formatShortDate}
    />
  )
  const yAxis = (
    <YAxis
      tickLine={false}
      axisLine={false}
      tickMargin={8}
      width={rate ? 44 : 40}
      domain={rate ? rateDomain(data) : [0, "auto"]}
      tickFormatter={formatTick}
    />
  )
  const tooltip = (
    <ChartTooltip
      content={
        <ChartTooltipContent
          labelFormatter={(day, payload) => {
            const days = (payload?.[0]?.payload as TrendPoint | undefined)?.days ?? 1
            return days > 1 ? `Week of ${formatShortDate(String(day))}` : formatShortDate(String(day))
          }}
          formatter={(value) => (
            <div className="flex flex-1 items-center justify-between gap-3 leading-none">
              <span className="text-muted-foreground">{seriesLabel}</span>
              <span className="font-mono font-medium text-foreground tabular-nums">{formatValue(Number(value))}</span>
            </div>
          )}
        />
      }
    />
  )

  return (
    <ChartContainer config={config} className="aspect-auto h-60 w-full" role="img" aria-label={`${seriesLabel} over time`}>
      {variant === "area" ? (
        <AreaChart data={data} margin={margin}>
          <CartesianGrid vertical={false} />
          {xAxis}
          {yAxis}
          {tooltip}
          <Area dataKey="value" type="monotone" stroke="var(--color-value)" fill="var(--color-value)" fillOpacity={0.12} strokeWidth={2} />
        </AreaChart>
      ) : (
        <LineChart data={data} margin={margin}>
          <CartesianGrid vertical={false} />
          {xAxis}
          {yAxis}
          {tooltip}
          <Line
            dataKey="value"
            type="monotone"
            stroke="var(--color-value)"
            strokeWidth={2}
            dot={data.length <= 14 ? { r: 3, fill: "var(--color-value)", strokeWidth: 0 } : false}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      )}
    </ChartContainer>
  )
}
