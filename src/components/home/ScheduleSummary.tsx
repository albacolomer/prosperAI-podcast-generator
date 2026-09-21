import { CalendarCheck, CalendarClock } from "lucide-react"
import { summarizeSchedule } from "@/lib/scheduleText"
import type { ScheduleStatus } from "@/types"

interface ScheduleSummaryProps {
  /** What the server holds; `null` until it has answered. */
  status: ScheduleStatus | null
  /** Injectable so "Today" and "Tomorrow" can be tested. */
  now?: number
}

/**
 * A small status line under the Generate button: is a podcast scheduled, and when is the next one. It is a summary only; the
 * schedule is edited in Podcast settings. Nothing is shown while the schedule is off.
 */
export function ScheduleSummary({ status, now }: ScheduleSummaryProps) {
  const summary = summarizeSchedule(status, now)

  if (summary.active) {
    return (
      <div className="flex items-start gap-2 text-sm sm:text-right" data-testid="schedule-summary" data-state="active">
        <CalendarCheck className="mt-0.5 size-4 shrink-0 text-primary sm:order-last" />
        <div className="flex flex-col">
          <span className="font-medium text-foreground">Schedule active · {summary.frequency}</span>
          {summary.nextDelivery ? <span className="text-muted-foreground">Next episode: {summary.nextDelivery}</span> : null}
        </div>
      </div>
    )
  }

  if (summary.paused) {
    return (
      <div className="flex items-start gap-2 text-sm sm:text-right" data-testid="schedule-summary" data-state="paused">
        <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted-foreground sm:order-last" />
        <div className="flex flex-col">
          <span className="font-medium text-foreground">Schedule paused · {summary.frequency}</span>
          <span className="text-muted-foreground">{summary.paused}</span>
        </div>
      </div>
    )
  }

  return null
}
