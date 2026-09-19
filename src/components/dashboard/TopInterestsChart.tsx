import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { formatCompactNumber } from "@/lib/format"
import type { NamedSeriesPoint } from "@/types"

const chartConfig: ChartConfig = {
  value: { label: "Mentions", color: "#eda100" },
}

interface TopInterestsChartProps {
  data: NamedSeriesPoint[]
}

export function TopInterestsChart({ data }: TopInterestsChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top interests</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
          <BarChart data={data} layout="vertical" margin={{ left: 4, right: 12 }}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={formatCompactNumber} />
            <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={132} tick={{ fontSize: 12 }} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="value" fill="var(--color-value)" radius={[0, 4, 4, 0]} barSize={16} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
