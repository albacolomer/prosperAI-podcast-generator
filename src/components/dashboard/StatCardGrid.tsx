import { StatCard } from "@/components/dashboard/StatCard"
import type { DashboardMetrics } from "@/types"

interface StatCardGridProps {
  kpis: DashboardMetrics["kpis"]
}

export function StatCardGrid({ kpis }: StatCardGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {Object.values(kpis).map((stat) => (
        <StatCard key={stat.id} stat={stat} />
      ))}
    </div>
  )
}
