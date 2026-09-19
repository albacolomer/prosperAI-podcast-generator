import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import type { TrendPoint } from "@/types"

const chartConfig: ChartConfig = {
  completion: { label: "Avg. completion rate", color: "#1baf7a" },
}

function formatDateTick(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

interface CompletionRateChartProps {
  data: TrendPoint[]
}

export function CompletionRateChart({ data }: CompletionRateChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Avg. completion rate</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-auto h-56 w-full">
          <LineChart data={data} margin={{ left: 4, right: 4 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={formatDateTick}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={44}
              tickFormatter={(value: number) => `${value}%`}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => formatDateTick(String(value))}
                  formatter={(value) => (
                    <div className="flex flex-1 items-center justify-between gap-3 leading-none">
                      <span className="text-muted-foreground">{chartConfig.completion.label}</span>
                      <span className="font-mono font-medium text-foreground tabular-nums">{value}%</span>
                    </div>
                  )}
                />
              }
            />
            <Line
              dataKey="value"
              name="completion"
              type="monotone"
              stroke="var(--color-completion)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
