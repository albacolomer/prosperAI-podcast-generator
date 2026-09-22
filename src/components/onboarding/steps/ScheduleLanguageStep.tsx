import { DayOfMonthSelect } from "@/components/settings/DayOfMonthSelect"
import { DeliveryTimePicker } from "@/components/settings/DeliveryTimePicker"
import { LanguageSelect } from "@/components/settings/LanguageSelect"
import { WeekdayPicker } from "@/components/settings/WeekdayPicker"
import { Button } from "@/components/ui/button"
import { onboardingFrequencies } from "@/data/onboardingOptions"
import { cn } from "@/lib/utils"
import type { DayOfWeek, ScheduleFrequency } from "@/types"
import type { OnboardingSchedule } from "@/types/onboarding"

interface ScheduleLanguageStepProps {
  schedule: OnboardingSchedule
  language: string
  onFrequencyChange: (frequency: ScheduleFrequency) => void
  onWeekdayChange: (weekday: DayOfWeek) => void
  onDayOfMonthChange: (day: number) => void
  onDeliveryTimeChange: (time: string) => void
  onLanguageChange: (code: string) => void
  onSubmit: () => void
}

export function ScheduleLanguageStep({
  schedule,
  language,
  onFrequencyChange,
  onWeekdayChange,
  onDayOfMonthChange,
  onDeliveryTimeChange,
  onLanguageChange,
  onSubmit,
}: ScheduleLanguageStepProps) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">One last thing.</h2>
      </div>

      <div className="flex flex-col gap-3">
        <p className="font-medium text-foreground">How often would you like your podcast?</p>
        <div className="grid grid-cols-3 gap-2">
          {onboardingFrequencies.map((option) => {
            const isSelected = option.value === schedule.frequency
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onFrequencyChange(option.value)}
                aria-pressed={isSelected}
                className={cn(
                  "flex h-11 items-center justify-center rounded-xl border text-sm font-semibold transition-colors",
                  isSelected ? "border-primary bg-primary/5 text-primary ring-1 ring-primary" : "border-border text-foreground hover:border-foreground/20",
                )}
              >
                {option.label}
              </button>
            )
          })}
        </div>

        {schedule.frequency === "weekly" ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-muted-foreground">Which day?</span>
            <WeekdayPicker value={schedule.weekday} onChange={onWeekdayChange} />
          </div>
        ) : null}

        {schedule.frequency === "monthly" ? (
          <DayOfMonthSelect value={schedule.dayOfMonth} onChange={onDayOfMonthChange} />
        ) : null}

        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-muted-foreground">What time should it arrive?</span>
          <DeliveryTimePicker value={schedule.deliveryTime} onChange={onDeliveryTimeChange} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="font-medium text-foreground">What language would you like to listen in?</p>
        <LanguageSelect value={language} onChange={onLanguageChange} />
      </div>

      <Button
        type="button"
        size="lg"
        onClick={onSubmit}
        className="w-full rounded-full bg-cta-strong text-cta-strong-foreground hover:bg-cta-strong/90 sm:w-auto sm:self-end"
      >
        Create my first podcast
      </Button>
    </div>
  )
}
