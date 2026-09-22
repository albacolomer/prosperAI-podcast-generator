import { useState } from "react"
import { EngagementTable } from "@/components/dashboard/EngagementTable"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { ContentDimension, DashboardMetrics } from "@/types"

interface ContentSectionProps {
  metrics: DashboardMetrics
}

const DIMENSION_OPTIONS: { value: ContentDimension; label: string }[] = [
  { value: "interest", label: "Interest" },
  { value: "language", label: "Language" },
  { value: "tone", label: "Tone" },
  { value: "duration", label: "Duration" },
]

/** One card: people respond differently to each interest, language, tone and duration, and a selector switches between the four,
 * all drawn from the same underlying podcasts, sessions and feedback. */
export function ContentSection({ metrics }: ContentSectionProps) {
  const { content } = metrics
  const [dimension, setDimension] = useState<ContentDimension>("interest")
  const option = DIMENSION_OPTIONS.find((entry) => entry.value === dimension) ?? DIMENSION_OPTIONS[0]

  return (
    <Card>
      <CardHeader>
        <Select value={dimension} onValueChange={(value) => setDimension(value as ContentDimension)}>
          <SelectTrigger size="sm" aria-label="Dimension" className="w-fit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DIMENSION_OPTIONS.map((entry) => (
              <SelectItem key={entry.value} value={entry.value}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <EngagementTable rows={content.engagementByDimension[dimension]} nameColumnLabel={option.label} />
      </CardContent>
    </Card>
  )
}
