import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { DEFAULT_PODCAST_SETTINGS } from "@/types"
import type { PodcastSettings } from "@/types"
import { ScheduleFields } from "./ScheduleFields"

const render = (settings: Partial<PodcastSettings> = {}, hasInterests = true) =>
  renderToStaticMarkup(
    <ScheduleFields settings={{ ...DEFAULT_PODCAST_SETTINGS, ...settings }} updateDraft={vi.fn()} disabled={!hasInterests} hasInterests={hasInterests} />,
  )

/** The text of the page, with the markup gone. */
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ")

/** The switch's own tag. (Its class names mention "disabled:" for styling, so only the attribute counts.) */
const switchTag = (html: string) => /<button[^>]*role="switch"[^>]*>/.exec(html)?.[0] ?? ""
const isDisabled = (tag: string) => /\sdisabled=""/.test(tag)

/** The weekday buttons, as [name, chosen]. */
const weekdays = (html: string) =>
  (html.match(/<button[^>]*role="radio"[^>]*>/g) ?? []).map((tag) => [/aria-label="([^"]+)"/.exec(tag)?.[1], tag.includes('aria-checked="true"')] as const)

describe("when the schedule is off", () => {
  const weekly = render({ scheduleEnabled: false, frequency: "weekly" })
  const monthly = render({ scheduleEnabled: false, frequency: "monthly" })

  it("shows the switch on the Schedule row, and nothing else of the schedule", () => {
    expect(text(weekly)).toContain("Schedule")
    expect(text(weekly)).not.toContain("Schedule episodes")
    expect(weekly).toMatch(/role="switch"[^>]*aria-checked="false"/)
    expect(weekly).not.toContain("Frequency")
    expect(weekly).not.toContain("Delivery time")
    expect(weekly).not.toContain("Delivered on")
    expect(weekly).not.toContain('role="radio"')
    expect(monthly).not.toContain("Day of the month")
  })

  it("shows no schedule status or explanation", () => {
    for (const words of [text(weekly), text(monthly)]) {
      expect(words).not.toMatch(/Schedule active|Schedule off|Schedule paused|Next episode/)
      expect(words).not.toContain("Generate one automatically")
      expect(words).not.toContain("The delivery time is when")
      expect(words).not.toContain("try once more")
    }
  })
})

describe("when the schedule is on", () => {
  it("reveals the frequency and the delivery time", () => {
    const html = render({ scheduleEnabled: true })

    expect(html).toMatch(/role="switch"[^>]*aria-checked="true"/)
    expect(html).toContain("Frequency")
    expect(html).toContain("Delivery time")
  })

  it("shows no extra selector for a daily schedule", () => {
    const html = render({ scheduleEnabled: true, frequency: "daily" })

    expect(html).not.toContain("Delivered on")
    expect(html).not.toContain("Day of the month")
  })

  it("shows exactly one weekday choice, Monday to Sunday, for a weekly schedule", () => {
    const html = render({ scheduleEnabled: true, frequency: "weekly", weekday: "fri" })

    expect(html).toContain("Delivered on")
    expect(html).not.toContain("Day of the month")
    // Seven days, exactly one of them chosen.
    expect(weekdays(html)).toEqual([["Monday", false], ["Tuesday", false], ["Wednesday", false], ["Thursday", false], ["Friday", true], ["Saturday", false], ["Sunday", false]])
  })

  it("shows a day-of-month choice, and no weekdays, for a monthly schedule", () => {
    const html = render({ scheduleEnabled: true, frequency: "monthly", dayOfMonth: 15 })

    expect(html).toContain("Day of the month")
    expect(html).not.toContain("Delivered on")
    expect(html).not.toContain('aria-label="Monday"')
  })

  it("chooses the day the settings hold, for every weekday", () => {
    for (const [weekday, name] of [["mon", "Monday"], ["wed", "Wednesday"], ["sun", "Sunday"]] as const) {
      expect(weekdays(render({ scheduleEnabled: true, frequency: "weekly", weekday })).filter(([, chosen]) => chosen)).toEqual([[name, true]])
    }
  })

  it("does not show the explanatory paragraphs or the schedule status (Home shows that)", () => {
    const words = text(render({ scheduleEnabled: true }))

    expect(words).not.toContain("Generate one automatically")
    expect(words).not.toContain("The delivery time is when")
    expect(words).not.toMatch(/Schedule active|Schedule off|Schedule paused|Next episode/)
  })
})

describe("the Schedule row", () => {
  it("labels the row 'Schedule', exactly once, with no separate 'Schedule episodes' heading", () => {
    for (const html of [render({ scheduleEnabled: false }), render({ scheduleEnabled: true })]) {
      expect((text(html).match(/Schedule\b/g) ?? []).length).toBe(1)
      expect(text(html)).not.toContain("Schedule episodes")
    }
  })
})

describe("the schedule switch", () => {
  it("is off by default and on when the schedule is enabled", () => {
    expect(render({ scheduleEnabled: false })).toMatch(/role="switch"[^>]*aria-checked="false"/)
    expect(render({ scheduleEnabled: true })).toMatch(/role="switch"[^>]*aria-checked="true"/)
  })

  it("cannot be switched on with no interests, and says so", () => {
    const html = render({ scheduleEnabled: false }, false)

    expect(isDisabled(switchTag(html))).toBe(true)
    expect(html).toContain('role="alert"')
    expect(text(html)).toContain("Add at least one interest to schedule episodes.")
  })

  it("can be used, and shows no complaint, when there are interests", () => {
    const html = render({ scheduleEnabled: false }, true)

    expect(switchTag(html)).not.toBe("")
    expect(isDisabled(switchTag(html))).toBe(false)
    expect(text(html)).not.toContain("Add at least one interest")
  })

  it("can still be switched off when the interests are gone, so the schedule can be stopped", () => {
    const html = render({ scheduleEnabled: true }, false)

    expect(switchTag(html)).toContain('aria-checked="true"')
    expect(isDisabled(switchTag(html))).toBe(false)
    expect(text(html)).not.toContain("Add at least one interest")
  })
})
