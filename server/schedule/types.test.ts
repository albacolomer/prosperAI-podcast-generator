import { describe, expect, it } from "vitest"
import { DAYS_OF_WEEK, MAX_DAY_OF_MONTH as CLIENT_MAX_DAY, SCHEDULE_FREQUENCIES as CLIENT_FREQUENCIES } from "../../src/types/settings.js"
import { MAX_DAY_OF_MONTH, SCHEDULE_FREQUENCIES, scheduleSettingsSchema, WEEKDAYS } from "./types.js"

describe("the server's copy of the schedule options", () => {
  it("matches the client's: daily, weekly and monthly, Monday to Sunday, days 1 to 28", () => {
    expect([...SCHEDULE_FREQUENCIES]).toEqual([...CLIENT_FREQUENCIES])
    expect([...SCHEDULE_FREQUENCIES]).toEqual(["daily", "weekly", "monthly"])
    expect([...WEEKDAYS]).toEqual([...DAYS_OF_WEEK])
    expect(MAX_DAY_OF_MONTH).toBe(CLIENT_MAX_DAY)
    expect(MAX_DAY_OF_MONTH).toBe(28)
  })
})

describe("scheduleSettingsSchema", () => {
  const valid = {
    enabled: true,
    frequency: "weekly",
    deliveryTime: "08:00",
    weekday: "mon",
    dayOfMonth: 1,
    language: "en",
    tone: "conversational",
    interests: ["AI"],
    timeZone: "Europe/Madrid",
  }

  it("accepts a valid schedule", () => {
    expect(scheduleSettingsSchema.safeParse(valid).success).toBe(true)
  })

  it.each([
    ["the removed weekdays frequency", { frequency: "weekdays" }],
    ["the removed custom frequency", { frequency: "custom" }],
    ["day 29 of the month", { dayOfMonth: 29 }],
    ["day 0", { dayOfMonth: 0 }],
    ["a fractional day", { dayOfMonth: 1.5 }],
    ["an unknown weekday", { weekday: "funday" }],
    ["a time that is not HH:MM", { deliveryTime: "8am" }],
    ["25:00", { deliveryTime: "25:00" }],
    ["an unknown timezone", { timeZone: "Mars/Olympus" }],
    ["an unknown language", { language: "xx" }],
    ["too many interests", { interests: Array.from({ length: 11 }, (_, index) => `Topic ${index}`) }],
    ["a blank interest", { interests: [" "] }],
    ["a non-boolean enabled", { enabled: "yes" }],
  ])("rejects %s", (_name, change) => {
    expect(scheduleSettingsSchema.safeParse({ ...valid, ...change }).success).toBe(false)
  })

  it("accepts days 1 and 28 and an empty set of interests", () => {
    expect(scheduleSettingsSchema.safeParse({ ...valid, dayOfMonth: 1 }).success).toBe(true)
    expect(scheduleSettingsSchema.safeParse({ ...valid, dayOfMonth: 28 }).success).toBe(true)
    expect(scheduleSettingsSchema.safeParse({ ...valid, interests: [] }).success).toBe(true)
  })
})
