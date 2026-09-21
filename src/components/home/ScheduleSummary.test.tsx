import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { ScheduleStatus } from "@/types"
import { ScheduleSummary } from "./ScheduleSummary"

type Configured = Extract<ScheduleStatus, { configured: true }>

// Monday 21 September 2026, 07:00 in Madrid.
const NOW = Date.parse("2026-09-21T05:00:00.000Z")

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
  nextDeliveryAt: "2026-09-21T06:00:00.000Z",
  run: null,
  paused: null,
  ...overrides,
})

const html = (value: ScheduleStatus | null) => renderToStaticMarkup(<ScheduleSummary status={value} now={NOW} />)
const words = (value: ScheduleStatus | null) => html(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()

describe("ScheduleSummary", () => {
  it("shows the frequency and when the next podcast is due", () => {
    expect(words(status())).toBe("Schedule active · Every day Next episode: Today, 8:00 AM")
    expect(words(status({ frequency: "weekly", weekday: "mon", nextDeliveryAt: "2026-09-28T06:00:00.000Z" }))).toBe("Schedule active · Every Monday Next episode: Monday, 8:00 AM")
  })

  it("shows nothing when the schedule is off, unsaved or unreachable", () => {
    expect(html(status({ enabled: false, nextDeliveryAt: null }))).toBe("")
    expect(html({ configured: false, enabled: false, nextDeliveryAt: null, run: null })).toBe("")
    expect(html(null)).toBe("")
  })

  it("shows a paused state, not an active one, when there are no interests", () => {
    const paused = status({ interests: [], paused: "no-interests", nextDeliveryAt: null })

    expect(html(paused)).toContain('data-state="paused"')
    expect(html(paused)).not.toContain("Schedule active")
    expect(html(paused)).not.toContain("Next episode")
    expect(words(paused)).toContain("Schedule paused · Every day No interests selected.")
  })
})
