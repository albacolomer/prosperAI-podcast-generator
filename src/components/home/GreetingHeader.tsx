import { ScheduleSummary } from "@/components/home/ScheduleSummary"
import { mockCurrentUser } from "@/data/mockUser"
import type { ScheduleStatus } from "@/types"

interface GreetingHeaderProps {
  /** The schedule as the server holds it; summarised under the greeting when it is on. */
  scheduleStatus: ScheduleStatus | null
}

export function getGreeting(): { text: string; emoji: string } {
  const hour = new Date().getHours()
  if (hour < 5) return { text: "Good night", emoji: "🌙" }
  if (hour < 12) return { text: "Good morning", emoji: "☀️" }
  if (hour < 18) return { text: "Good afternoon", emoji: "⛅" }
  return { text: "Good evening", emoji: "🌆" }
}

/** No manual "Generate" action: podcasts arrive on the schedule set in Podcast settings, so this only greets and summarises it. */
export function GreetingHeader({ scheduleStatus }: GreetingHeaderProps) {
  const { text, emoji } = getGreeting()
  const dateLabel = new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" })

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="text-sm text-muted-foreground">{dateLabel}</p>
        <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {text}, {mockCurrentUser.name}
          <span aria-hidden="true">{emoji}</span>
        </h1>
        <p className="mt-1 text-muted-foreground">Your podcasts are generated automatically, according to your schedule.</p>
      </div>

      <ScheduleSummary status={scheduleStatus} />
    </div>
  )
}
