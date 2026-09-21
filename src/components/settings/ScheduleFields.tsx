import { CalendarCheck, CircleAlert, Loader2 } from "lucide-react"
import { DayOfMonthSelect } from "@/components/settings/DayOfMonthSelect"
import { DeliveryTimePicker } from "@/components/settings/DeliveryTimePicker"
import { ScheduleFrequencySelect } from "@/components/settings/ScheduleFrequencySelect"
import { WeekdayPicker } from "@/components/settings/WeekdayPicker"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { describeRun, SCHEDULE_NEEDS_INTERESTS, summarizeSchedule } from "@/lib/scheduleText"
import type { PodcastSettings, ScheduleStatus } from "@/types"

interface ScheduleFieldsProps {
  settings: PodcastSettings
  updateDraft: (partial: Partial<PodcastSettings>) => void
  /** Nothing to make an episode from yet: the timing controls are shown but cannot be used. */
  disabled?: boolean
  /** At least one interest is selected. Without one the schedule cannot be switched on (it can still be switched off). */
  hasInterests: boolean
  /** What the server holds. `null` when it has not answered. */
  status: ScheduleStatus | null
}

/** The schedule controls, and what the server says it is doing: the next delivery and how the latest scheduled run went. */
export function ScheduleFields({ settings, updateDraft, disabled, hasInterests, status }: ScheduleFieldsProps) {
  const summary = summarizeSchedule(status)
  // Turning the schedule on needs interests; turning it off never does, so a schedule that lost its interests can still be stopped.
  const cannotEnable = !hasInterests && !settings.scheduleEnabled
  const run = describeRun(status?.run)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="schedule-enabled" className="font-medium text-foreground">
            Schedule episodes
          </Label>
          <span className="text-xs text-muted-foreground">Generate one automatically, even when this page is closed.</span>
        </div>
        <Switch
          id="schedule-enabled"
          checked={settings.scheduleEnabled}
          onCheckedChange={(scheduleEnabled) => updateDraft({ scheduleEnabled })}
          disabled={cannotEnable}
          aria-describedby={cannotEnable ? "schedule-needs-interests" : undefined}
        />
      </div>
      {cannotEnable ? (
        <p id="schedule-needs-interests" role="alert" className="text-xs text-destructive">
          {SCHEDULE_NEEDS_INTERESTS}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Frequency</span>
          <ScheduleFrequencySelect value={settings.frequency} onChange={(frequency) => updateDraft({ frequency })} disabled={disabled} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Delivery time</span>
          <DeliveryTimePicker value={settings.deliveryTime} onChange={(deliveryTime) => updateDraft({ deliveryTime })} disabled={disabled} />
        </div>
      </div>

      {settings.frequency === "weekly" ? (
        <WeekdayPicker value={settings.weekday} onChange={(weekday) => updateDraft({ weekday })} disabled={disabled} />
      ) : null}
      {settings.frequency === "monthly" ? (
        <DayOfMonthSelect value={settings.dayOfMonth} onChange={(dayOfMonth) => updateDraft({ dayOfMonth })} disabled={disabled} />
      ) : null}

      <p className="text-xs text-muted-foreground">
        The delivery time is when your episode should be ready. We start about 15 minutes earlier, and try once more if something goes wrong.
      </p>

      {summary.active ? (
        <div className="flex items-start gap-2 rounded-lg bg-secondary/60 p-3 text-sm" data-testid="schedule-summary">
          <CalendarCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-foreground">Schedule active · {summary.frequency}</span>
            {summary.nextDelivery ? (
              <span className="text-muted-foreground">
                Next episode: {summary.nextDelivery} ({summary.timeZone})
              </span>
            ) : null}
          </div>
        </div>
      ) : summary.paused ? (
        <p className="text-xs text-muted-foreground" data-testid="schedule-summary">
          Schedule paused. {summary.paused}
        </p>
      ) : summary.frequency ? (
        <p className="text-xs text-muted-foreground" data-testid="schedule-summary">
          Schedule off. Turn it on and save to receive episodes automatically.
        </p>
      ) : null}

      {run ? (
        <div className="flex items-start gap-2 text-xs text-muted-foreground" data-testid="schedule-last-run" data-kind={run.kind}>
          {run.kind === "running" ? (
            <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin" />
          ) : run.kind === "failed" ? (
            <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" />
          ) : null}
          <span>
            <span className="font-medium text-foreground">{run.title}.</span> {run.detail}
          </span>
        </div>
      ) : null}
    </div>
  )
}
