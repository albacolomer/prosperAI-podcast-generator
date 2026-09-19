import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import type { NamedSeriesPoint } from "@/types"

const chartConfig: ChartConfig = {
  value: { label: "Listeners", color: "#008300" },
}

interface LanguageDistributionChartProps {
  data: NamedSeriesPoint[]
}

export function LanguageDistributionChart({ data }: LanguageDistributionChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Language distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
          <BarChart data={data} layout="vertical" margin={{ left: 4, right: 12 }}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(value: number) => `${value}%`} />
            <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={88} tick={{ fontSize: 12 }} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => (
                    <div className="flex flex-1 items-center justify-between gap-3 leading-none">
                      <span className="text-muted-foreground">{chartConfig.value.label}</span>
                      <span className="font-mono font-medium text-foreground tabular-nums">{value}%</span>
                    </div>
                  )}
                />
              }
            />
            <Bar dataKey="value" fill="var(--color-value)" radius={[0, 4, 4, 0]} barSize={16} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
