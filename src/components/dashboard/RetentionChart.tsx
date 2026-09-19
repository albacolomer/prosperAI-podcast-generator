import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import type { RetentionPoint } from "@/types"

const chartConfig: ChartConfig = {
  retentionPercent: { label: "Retention", color: "#e34948" },
}

interface RetentionChartProps {
  data: RetentionPoint[]
}

export function RetentionChart({ data }: RetentionChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Retention by week</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
          <LineChart data={data} margin={{ left: 4, right: 4 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="weeksSinceSignup"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(week: number) => `Wk ${week}`}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={44}
              domain={[0, 100]}
              tickFormatter={(value: number) => `${value}%`}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(week) => `Week ${week}`}
                  formatter={(value) => (
                    <div className="flex flex-1 items-center justify-between gap-3 leading-none">
                      <span className="text-muted-foreground">{chartConfig.retentionPercent.label}</span>
                      <span className="font-mono font-medium text-foreground tabular-nums">{value}%</span>
                    </div>
                  )}
                />
              }
            />
            <Line
              dataKey="retentionPercent"
              type="monotone"
              stroke="var(--color-retentionPercent)"
              strokeWidth={2}
              dot={{ r: 4, fill: "var(--color-retentionPercent)", strokeWidth: 0 }}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
