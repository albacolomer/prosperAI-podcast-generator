import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { DEFAULT_PODCAST_SETTINGS } from "@/types"
import type { PodcastSettings, ScheduleRunStatus, ScheduleStatus } from "@/types"
import { ScheduleFields } from "./ScheduleFields"

type Configured = Extract<ScheduleStatus, { configured: true }>

const status = (overrides: Partial<Configured> = {}): Configured => ({
  configured: true,
  enabled: true,
  frequency: "daily",
  deliveryTime: "08:00",
  weekday: "mon",
  dayOfMonth: 1,
  language: "en",
  tone: "conversational",
  interests: ["AI"],
  timeZone: "Europe/Madrid",
  nextDeliveryAt: "2026-09-22T06:00:00.000Z",
  run: null,
  paused: null,
  ...overrides,
})

const run = (overrides: Partial<ScheduleRunStatus> = {}): ScheduleRunStatus => ({
  status: "completed",
  deliveryAt: "2026-09-21T06:00:00.000Z",
  timeZone: "Europe/Madrid",
  attempts: 1,
  startedAt: "2026-09-21T05:45:00.000Z",
  finishedAt: "2026-09-21T05:52:00.000Z",
  late: false,
  ...overrides,
})

const render = (settings: Partial<PodcastSettings> = {}, scheduleStatus: ScheduleStatus | null = null, hasInterests = true) =>
  renderToStaticMarkup(
    <ScheduleFields
      settings={{ ...DEFAULT_PODCAST_SETTINGS, ...settings }}
      updateDraft={vi.fn()}
      disabled={!hasInterests}
      hasInterests={hasInterests}
      status={scheduleStatus}
    />,
  )

/** The text of the page, with the markup gone. */
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ")

/** The switch's own tag. (Its class names mention "disabled:" for styling, so only the attribute counts.) */
const switchTag = (html: string) => /<button[^>]*role="switch"[^>]*>/.exec(html)?.[0] ?? ""
const isDisabled = (tag: string) => /\sdisabled=""/.test(tag)

/** The weekday buttons, as [name, chosen]. */
const weekdays = (html: string) =>
  (html.match(/<button[^>]*role="radio"[^>]*>/g) ?? []).map((tag) => [/aria-label="([^"]+)"/.exec(tag)?.[1], tag.includes('aria-checked="true"')] as const)

describe("frequency", () => {
  it("shows no extra selector for a daily schedule", () => {
    const html = render({ frequency: "daily" })
    expect(html).not.toContain("Delivered on")
    expect(html).not.toContain("Day of the month")
  })

  it("shows exactly one weekday choice, Monday to Sunday, for a weekly schedule", () => {
    const html = render({ frequency: "weekly", weekday: "fri" })

    expect(html).toContain("Delivered on")
    expect(html).not.toContain("Day of the month")
    for (const name of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]) expect(html).toContain(`aria-label="${name}"`)
    // Seven days, exactly one of them chosen.
    expect(weekdays(html)).toEqual([["Monday", false], ["Tuesday", false], ["Wednesday", false], ["Thursday", false], ["Friday", true], ["Saturday", false], ["Sunday", false]])
  })

  it("shows a day-of-month choice, and no weekdays, for a monthly schedule", () => {
    const html = render({ frequency: "monthly", dayOfMonth: 15 })

    expect(html).toContain("Day of the month")
    expect(html).not.toContain("Delivered on")
    expect(html).not.toContain('aria-label="Monday"')
    expect(html).toContain('aria-label="Day of the month"')
  })

  it("chooses the day the settings hold, for every weekday", () => {
    for (const [weekday, name] of [["mon", "Monday"], ["wed", "Wednesday"], ["sun", "Sunday"]] as const) {
      expect(weekdays(render({ frequency: "weekly", weekday })).filter(([, chosen]) => chosen)).toEqual([[name, true]])
    }
  })

  it("offers only the delivery time and frequency in the shared row", () => {
    const html = render()
    expect(html).toContain("Frequency")
    expect(html).toContain("Delivery time")
  })
})

describe("the schedule switch", () => {
  it("is off by default and on when the schedule is enabled", () => {
    expect(render({ scheduleEnabled: false })).toMatch(/role="switch"[^>]*aria-checked="false"/)
    expect(render({ scheduleEnabled: true })).toMatch(/role="switch"[^>]*aria-checked="true"/)
  })

  it("is labelled 'Schedule episodes'", () => {
    expect(text(render())).toContain("Schedule episodes")
  })

  it("cannot be switched on with no interests, and says so", () => {
    const html = render({ scheduleEnabled: false }, null, false)

    expect(isDisabled(switchTag(html))).toBe(true)
    expect(html).toContain('role="alert"')
    expect(text(html)).toContain("Add at least one interest to schedule episodes.")
  })

  it("can be used, and shows no complaint, when there are interests", () => {
    const html = render({ scheduleEnabled: false }, null, true)

    expect(switchTag(html)).not.toBe("")
    expect(isDisabled(switchTag(html))).toBe(false)
    expect(text(html)).not.toContain("Add at least one interest")
  })

  it("can still be switched off when the interests are gone, so the schedule can be stopped", () => {
    const html = render({ scheduleEnabled: true }, null, false)

    expect(switchTag(html)).toContain('aria-checked="true"')
    expect(isDisabled(switchTag(html))).toBe(false)
    expect(text(html)).not.toContain("Add at least one interest")
  })
})

describe("what the server says", () => {
  it("shows an active schedule with its frequency and the next delivery in the schedule's timezone", () => {
    const words = text(render({ scheduleEnabled: true }, status()))

    expect(words).toContain("Schedule active")
    expect(words).toContain("Every day")
    expect(words).toContain("Next episode: Tue, Sep 22, 8:00 AM (Europe/Madrid)")
  })

  it("names the weekday and the day of the month", () => {
    expect(text(render({}, status({ frequency: "weekly", weekday: "fri", nextDeliveryAt: "2026-09-25T06:00:00.000Z" })))).toContain("Every Friday")
    expect(text(render({}, status({ frequency: "monthly", dayOfMonth: 15, nextDeliveryAt: "2026-10-15T06:00:00.000Z" })))).toContain("Monthly on the 15th")
  })

  it("says the schedule is off, and shows no next delivery, when it is disabled", () => {
    const words = text(render({ scheduleEnabled: false }, status({ enabled: false, nextDeliveryAt: null })))

    expect(words).toContain("Schedule off")
    expect(words).not.toContain("Next episode")
    expect(words).not.toContain("Schedule active")
  })

  it("says nothing about a schedule the server does not have", () => {
    const words = text(render({}, { configured: false, enabled: false, nextDeliveryAt: null, run: null }))

    expect(words).not.toContain("Schedule active")
    expect(words).not.toContain("Schedule off")
    expect(words).not.toContain("Next episode")
  })

  it("shows 'No interests selected' for a schedule that lost its interests, and keeps its configuration on show", () => {
    const words = text(render({ scheduleEnabled: true }, status({ frequency: "weekly", weekday: "fri", interests: [], paused: "no-interests", nextDeliveryAt: null }), false))

    expect(words).toContain("Schedule paused")
    expect(words).toContain("No interests selected")
    expect(words).not.toContain("Schedule active")
    expect(words).not.toContain("Next episode")
  })
})

describe("the latest scheduled run", () => {
  it("shows a run in progress", () => {
    const html = render({}, status({ run: run({ status: "running", finishedAt: undefined }) }))
    expect(html).toContain('data-kind="running"')
    expect(text(html)).toContain("Generating your scheduled episode")
  })

  it("shows a completed run, and one that was late", () => {
    expect(text(render({}, status({ run: run() })))).toContain("Your scheduled episode is ready")
    const late = render({}, status({ run: run({ late: true, finishedAt: "2026-09-21T06:12:00.000Z" }) }))
    expect(late).toContain('data-kind="late"')
    expect(text(late)).toContain("arrived late")
  })

  it("shows a failure in words, with no internal detail", () => {
    const html = render({}, status({ run: run({ status: "failed", attempts: 2, message: "We couldn't validate this episode reliably.", late: undefined }) }))

    expect(html).toContain('data-kind="failed"')
    expect(text(html)).toContain("We couldn't validate this episode reliably. We tried twice.")
    expect(html).not.toMatch(/stack|OpenAI|validator|issue/i)
  })

  it("shows nothing when there has been no run", () => {
    expect(render({}, status())).not.toContain("schedule-last-run")
  })
})
