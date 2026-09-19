import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import type { NamedSeriesPoint } from "@/types"

const chartConfig: ChartConfig = {
  value: { label: "Share of episodes", color: "#e87ba4" },
}

interface VoicePopularityChartProps {
  data: NamedSeriesPoint[]
}

export function VoicePopularityChart({ data }: VoicePopularityChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Voice popularity</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
          <BarChart data={data} margin={{ left: 4, right: 4 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} width={32} tickFormatter={(value: number) => `${value}%`} />
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
            <Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]} barSize={28} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
