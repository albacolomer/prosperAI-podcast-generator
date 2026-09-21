import { describe, expect, it } from "vitest"
import type { ScheduleRunStatus, ScheduleStatus } from "@/types"
import { SCHEDULE_NEEDS_INTERESTS, DAY_OF_MONTH_OPTIONS, describeConfigProblem, describeFrequency, describeRun, formatDeliveryIn, formatTimeIn, isBannerWorthy, ordinal, summarizeSchedule } from "./scheduleText"

type Configured = Extract<ScheduleStatus, { configured: true }>

const scheduled = (overrides: Partial<Configured> = {}): Configured => ({
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

describe("SCHEDULE_NEEDS_INTERESTS", () => {
  it("tells the user what to do", () => {
    expect(SCHEDULE_NEEDS_INTERESTS).toBe("Add at least one interest to schedule episodes.")
  })
})

describe("describeConfigProblem", () => {
  it("says nothing without a problem", () => {
    expect(describeConfigProblem(null)).toBeNull()
    expect(describeConfigProblem(undefined)).toBeNull()
  })

  it("passes the server's message on and says the episode starts by itself once fixed", () => {
    const notice = describeConfigProblem({ message: "TAVILY_API_KEY is not set on the server." })

    expect(notice?.detail).toContain("TAVILY_API_KEY is not set on the server.")
    expect(notice?.detail).toContain("start automatically")
  })
})

describe("ordinal", () => {
  it.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [4, "4th"],
    [11, "11th"],
    [12, "12th"],
    [13, "13th"],
    [21, "21st"],
    [22, "22nd"],
    [23, "23rd"],
    [28, "28th"],
  ])("writes %i as %s", (day, text) => expect(ordinal(day)).toBe(text))
})

describe("DAY_OF_MONTH_OPTIONS", () => {
  it("offers days 1 to 28 and no others", () => {
    expect(DAY_OF_MONTH_OPTIONS.map(({ value }) => value)).toEqual(Array.from({ length: 28 }, (_, index) => index + 1))
    expect(DAY_OF_MONTH_OPTIONS[0]).toEqual({ value: 1, label: "1st" })
    expect(DAY_OF_MONTH_OPTIONS.at(-1)).toEqual({ value: 28, label: "28th" })
    expect(DAY_OF_MONTH_OPTIONS.some(({ value }) => value > 28)).toBe(false)
  })
})

describe("describeFrequency", () => {
  it("names daily, the chosen weekday and the chosen day of the month", () => {
    expect(describeFrequency({ frequency: "daily", weekday: "mon", dayOfMonth: 1 })).toBe("Every day")
    expect(describeFrequency({ frequency: "weekly", weekday: "fri", dayOfMonth: 1 })).toBe("Every Friday")
    expect(describeFrequency({ frequency: "monthly", weekday: "mon", dayOfMonth: 22 })).toBe("Monthly on the 22nd")
  })
})

describe("time formatting", () => {
  it("shows the delivery in the schedule's own timezone, not the viewer's", () => {
    expect(formatTimeIn("2026-09-21T06:00:00.000Z", "Europe/Madrid")).toBe("8:00 AM")
    expect(formatTimeIn("2026-09-21T06:00:00.000Z", "Asia/Tokyo")).toBe("3:00 PM")
    expect(formatDeliveryIn("2026-09-22T06:00:00.000Z", "Europe/Madrid")).toBe("Tue, Sep 22, 8:00 AM")
  })

  it("uses ordinary spaces", () => {
    expect(formatTimeIn("2026-09-21T06:00:00.000Z", "Europe/Madrid")).not.toMatch(/[^\S ]/)
  })

  it("falls back rather than throwing on an unknown zone", () => {
    expect(() => formatTimeIn("2026-09-21T06:00:00.000Z", "Not/AZone")).not.toThrow()
  })
})

describe("summarizeSchedule", () => {
  it("has nothing to say before a schedule is saved or while the server is unreachable", () => {
    expect(summarizeSchedule(null)).toEqual({ active: false })
    expect(summarizeSchedule({ configured: false, enabled: false, nextDeliveryAt: null, run: null })).toEqual({ active: false })
  })

  it("is active with the next delivery, the frequency and the weekday or day of the month", () => {
    expect(summarizeSchedule(scheduled())).toEqual({ active: true, frequency: "Every day", nextDelivery: "Tue, Sep 22, 8:00 AM", timeZone: "Europe/Madrid" })
    expect(summarizeSchedule(scheduled({ frequency: "weekly", weekday: "wed" })).frequency).toBe("Every Wednesday")
    expect(summarizeSchedule(scheduled({ frequency: "monthly", dayOfMonth: 15 })).frequency).toBe("Monthly on the 15th")
  })

  it("is inactive when switched off, and still says what is stored", () => {
    expect(summarizeSchedule(scheduled({ enabled: false, nextDeliveryAt: null }))).toEqual({ active: false, frequency: "Every day", timeZone: "Europe/Madrid" })
  })

  it("says 'No interests selected' for an enabled schedule that has none, and that it resumes", () => {
    const summary = summarizeSchedule(scheduled({ interests: [], paused: "no-interests", nextDeliveryAt: null }))

    expect(summary).toMatchObject({ active: false, frequency: "Every day", paused: expect.stringContaining("No interests selected") })
    expect(summary.paused).toContain("resumes")
    expect(summary.nextDelivery).toBeUndefined()
  })

  it("does not call a schedule that is switched off 'paused', whatever its interests", () => {
    expect(summarizeSchedule(scheduled({ enabled: false, interests: [], paused: null, nextDeliveryAt: null })).paused).toBeUndefined()
  })
})

describe("describeRun", () => {
  it("says nothing without a run", () => {
    expect(describeRun(null)).toBeNull()
    expect(describeRun(undefined)).toBeNull()
  })

  it("describes a run in progress, and a second attempt", () => {
    expect(describeRun(run({ status: "running", finishedAt: undefined }))).toMatchObject({ kind: "running", title: "Generating your scheduled episode" })
    const retrying = describeRun(run({ status: "running", attempts: 2, finishedAt: undefined }))
    expect(retrying).toMatchObject({ kind: "running", title: "Trying again to generate your scheduled episode" })
    expect(retrying?.detail).toContain("8:00 AM")
  })

  it("describes an episode that arrived on time and one that was late", () => {
    expect(describeRun(run())).toEqual({ kind: "completed", title: "Your scheduled episode is ready", detail: "Ready at 7:52 AM for the 8:00 AM delivery." })
    expect(describeRun(run({ late: true, finishedAt: "2026-09-21T06:12:00.000Z" }))).toEqual({
      kind: "late",
      title: "Your scheduled episode arrived late",
      detail: "It was due at 8:00 AM and was ready at 8:12 AM.",
    })
  })

  it("describes a failure with the safe message, and says when both attempts were used", () => {
    const failed = describeRun(run({ status: "failed", attempts: 2, message: "We couldn't select stories for this episode.", late: undefined }))
    expect(failed).toEqual({
      kind: "failed",
      title: "We couldn't generate your scheduled episode",
      detail: "We couldn't select stories for this episode. We tried twice.",
    })
    expect(describeRun(run({ status: "failed", attempts: 1, message: "Nope." }))?.detail).toBe("Nope.")
  })
})

describe("isBannerWorthy", () => {
  const now = Date.parse("2026-09-21T09:00:00.000Z")

  it("shows a run that is generating, a failure and a late episode", () => {
    expect(isBannerWorthy(run({ status: "running", finishedAt: undefined }), now)).toBe(true)
    expect(isBannerWorthy(run({ status: "failed", message: "x" }), now)).toBe(true)
    expect(isBannerWorthy(run({ late: true }), now)).toBe(true)
  })

  it("does not announce an episode that arrived on time", () => {
    expect(isBannerWorthy(run(), now)).toBe(false)
    expect(isBannerWorthy(null, now)).toBe(false)
  })

  it("lets a failure or a late episode go after a day, but not a run that is still going", () => {
    const dayAndAHalfLater = now + 36 * 60 * 60 * 1000
    expect(isBannerWorthy(run({ status: "failed", message: "x" }), dayAndAHalfLater)).toBe(false)
    expect(isBannerWorthy(run({ late: true }), dayAndAHalfLater)).toBe(false)
    expect(isBannerWorthy(run({ status: "running", finishedAt: undefined }), dayAndAHalfLater)).toBe(true)
  })
})
