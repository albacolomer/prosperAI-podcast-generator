import { describe, expect, it } from "vitest"
import { DEFAULT_PODCAST_SETTINGS } from "@/types"
import { currentWeekday, normalizeSettings } from "./settingsMigration"

describe("currentWeekday", () => {
  it("counts from Monday", () => {
    expect(currentWeekday(new Date(2026, 8, 21))).toBe("mon") // Monday 21 September 2026, local time
    expect(currentWeekday(new Date(2026, 8, 24))).toBe("thu")
    expect(currentWeekday(new Date(2026, 8, 27))).toBe("sun")
  })
})

describe("normalizeSettings", () => {
  it("gives defaults for nothing saved, with today as the weekday and the schedule off", () => {
    expect(normalizeSettings({}, "wed")).toEqual({ ...DEFAULT_PODCAST_SETTINGS, weekday: "wed" })
    expect(normalizeSettings(undefined, "wed").scheduleEnabled).toBe(false)
    expect(normalizeSettings(null, "wed").frequency).toBe("daily")
  })

  it("keeps a saved schedule as it was", () => {
    const saved = { language: "es", tone: "humorous", scheduleEnabled: true, frequency: "monthly", weekday: "fri", dayOfMonth: 15, deliveryTime: "07:30" }
    expect(normalizeSettings(saved, "mon")).toMatchObject(saved)
  })

  it("persists an explicit weekday and keeps it rather than following today", () => {
    expect(normalizeSettings({ frequency: "weekly", weekday: "sat" }, "mon").weekday).toBe("sat")
  })

  it("turns the frequencies that no longer exist into daily", () => {
    expect(normalizeSettings({ frequency: "weekdays" }).frequency).toBe("daily")
    expect(normalizeSettings({ frequency: "custom", customDays: ["mon", "wed"] }).frequency).toBe("daily")
  })

  it("drops custom days and a saved voice, which are not settings any more", () => {
    const migrated = normalizeSettings({ customDays: ["mon"], voiceId: "nova" })
    expect(migrated).not.toHaveProperty("customDays")
    expect(migrated).not.toHaveProperty("voiceId")
  })

  it("never accepts days 29 to 31, a day of 0 or a fraction", () => {
    for (const dayOfMonth of [29, 30, 31, 0, -1, 1.5, "15", null]) {
      expect(normalizeSettings({ frequency: "monthly", dayOfMonth }).dayOfMonth).toBe(1)
    }
    expect(normalizeSettings({ dayOfMonth: 28 }).dayOfMonth).toBe(28)
  })

  it("replaces a weekday, delivery time or switch that is not valid", () => {
    const migrated = normalizeSettings({ weekday: "funday", deliveryTime: "8am", scheduleEnabled: "yes" }, "tue")
    expect(migrated).toMatchObject({ weekday: "tue", deliveryTime: "08:00", scheduleEnabled: false })
  })

  it("keeps the episode length fixed whatever was saved", () => {
    expect(normalizeSettings({ durationMinutes: 45 }).durationMinutes).toBe(9)
  })
})
