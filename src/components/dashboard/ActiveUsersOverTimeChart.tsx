import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { formatCompactNumber } from "@/lib/format"
import type { TrendPoint } from "@/types"

const chartConfig: ChartConfig = {
  activeUsers: { label: "Active users", color: "#eb6834" },
}

function formatDateTick(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

interface ActiveUsersOverTimeChartProps {
  data: TrendPoint[]
}

export function ActiveUsersOverTimeChart({ data }: ActiveUsersOverTimeChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Active users</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-auto h-56 w-full">
          <AreaChart data={data} margin={{ left: 4, right: 4 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={formatDateTick}
            />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} width={36} tickFormatter={formatCompactNumber} />
            <ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => formatDateTick(String(value))} />} />
            <Area
              dataKey="value"
              name="activeUsers"
              type="monotone"
              stroke="var(--color-activeUsers)"
              fill="var(--color-activeUsers)"
              fillOpacity={0.12}
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
