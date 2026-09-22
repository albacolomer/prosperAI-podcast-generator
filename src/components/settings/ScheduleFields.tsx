import { Calendar } from "lucide-react"
import { DayOfMonthSelect } from "@/components/settings/DayOfMonthSelect"
import { DeliveryTimePicker } from "@/components/settings/DeliveryTimePicker"
import { ScheduleFrequencySelect } from "@/components/settings/ScheduleFrequencySelect"
import { WeekdayPicker } from "@/components/settings/WeekdayPicker"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { SCHEDULE_NEEDS_INTERESTS } from "@/lib/scheduleText"
import type { PodcastSettings } from "@/types"

interface ScheduleFieldsProps {
  settings: PodcastSettings
  updateDraft: (partial: Partial<PodcastSettings>) => void
  /** Nothing to make an episode from yet: the timing controls are shown but cannot be used. */
  disabled?: boolean
  /** At least one interest is selected. Without one the schedule cannot be switched on (it can still be switched off). */
  hasInterests: boolean
}

/**
 * The whole "Schedule" setting: its own row, with the on/off switch on the same line as the label (no separate
 * "Schedule episodes" heading), and — once it is on — the controls that say when. What the schedule is doing is
 * shown on Home, not here.
 */
export function ScheduleFields({ settings, updateDraft, disabled, hasInterests }: ScheduleFieldsProps) {
  // Turning the schedule on needs interests; turning it off never does, so a schedule that lost its interests can still be stopped.
  const cannotEnable = !hasInterests && !settings.scheduleEnabled

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="schedule-enabled" className="flex items-center gap-2 font-medium text-foreground">
          <Calendar className="size-4 text-muted-foreground" />
          Schedule
        </Label>
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

      {settings.scheduleEnabled ? (
        <>
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
        </>
      ) : null}
    </div>
  )
}
