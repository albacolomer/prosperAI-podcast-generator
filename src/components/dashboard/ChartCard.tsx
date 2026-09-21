import type { ReactNode } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface ChartCardProps {
  title: string
  description?: ReactNode
  children: ReactNode
  className?: string
}

export function ChartCard({ title, description, children, className }: ChartCardProps) {
  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="min-w-0">{children}</CardContent>
    </Card>
  )
}
