import { Minus, TrendingDown, TrendingUp } from "lucide-react"
import type { ReactNode } from "react"
import { Card, CardContent } from "@/components/ui/card"
import type { Change } from "@/lib/analytics/format"
import { cn } from "@/lib/utils"

interface StatCardProps {
  label: string
  value: string
  /** Context under the number: what it is a share of, how many it is based on. */
  detail?: ReactNode
  change?: Change | null
  /** A caveat about how to read the number. */
  note?: ReactNode
}

export function ChangeIndicator({ change }: { change: Change }) {
  const Icon = change.direction === "up" ? TrendingUp : change.direction === "down" ? TrendingDown : Minus
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        change.tone === "good" && "text-status-good",
        change.tone === "bad" && "text-status-bad",
        change.tone === "neutral" && "text-muted-foreground",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {change.text}
    </span>
  )
}

export function StatCard({ label, value, detail, change, note }: StatCardProps) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-1">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        <p className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">{value}</p>
        {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
        {change ? (
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs">
            <ChangeIndicator change={change} />
            <span className="text-muted-foreground">vs previous period</span>
          </p>
        ) : null}
        {note ? <p className="mt-1 text-xs text-muted-foreground italic">{note}</p> : null}
      </CardContent>
    </Card>
  )
}

/** A number inside a larger card (retention, research reuse), where a full StatCard would be too heavy. */
export function MiniStat({ label, value, detail, change }: Omit<StatCardProps, "note">) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tracking-tight text-foreground tabular-nums">{value}</p>
      {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
      {change ? <ChangeIndicator change={change} /> : null}
    </div>
  )
}

interface RateSplitCardProps {
  label: string
  /** A 0-1 share; the bar splits between it and its complement. Null draws an empty bar. */
  likeShare: number | null
  likeValue: string
  dislikeValue: string
}

/** A KPI card that shows a rate and its complement together (like vs. dislike) instead of splitting them across two cards. */
export function RateSplitCard({ label, likeShare, likeValue, dislikeValue }: RateSplitCardProps) {
  const likePercent = Math.round((likeShare ?? 0) * 100)
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold tabular-nums text-status-good">Like {likeValue}</span>
          <span className="text-sm font-semibold tabular-nums text-status-bad">Dislike {dislikeValue}</span>
        </div>
        <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-status-good" style={{ width: `${likePercent}%` }} />
          <div className="h-full bg-status-bad" style={{ width: `${100 - likePercent}%` }} />
        </div>
      </CardContent>
    </Card>
  )
}
