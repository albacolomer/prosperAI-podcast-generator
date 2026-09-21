import { describe, expect, it } from "vitest"
import { addDays, dateKey, instantOfWallTime, isValidTimeZone, wallTimeIn, weekdayIndex } from "./time.js"

const wall = (year: number, month: number, day: number, hour: number, minute: number) => ({ year, month, day, hour, minute })

describe("wallTimeIn", () => {
  it("reads the wall clock of the zone, not of the machine", () => {
    const instant = new Date("2026-09-21T06:00:00Z")
    expect(wallTimeIn(instant, "Europe/Madrid")).toEqual(wall(2026, 9, 21, 8, 0))
    expect(wallTimeIn(instant, "Asia/Tokyo")).toEqual(wall(2026, 9, 21, 15, 0))
    expect(wallTimeIn(instant, "America/New_York")).toEqual(wall(2026, 9, 21, 2, 0))
  })

  it("reads midnight as 00, never 24", () => {
    expect(wallTimeIn(new Date("2026-09-20T22:00:00Z"), "Europe/Madrid")).toEqual(wall(2026, 9, 21, 0, 0))
  })
})

describe("instantOfWallTime", () => {
  it("is the inverse of wallTimeIn on an ordinary day", () => {
    expect(instantOfWallTime(wall(2026, 9, 21, 8, 0), "Europe/Madrid").toISOString()).toBe("2026-09-21T06:00:00.000Z")
    expect(instantOfWallTime(wall(2026, 9, 21, 8, 0), "America/New_York").toISOString()).toBe("2026-09-21T12:00:00.000Z")
    expect(instantOfWallTime(wall(2026, 9, 21, 8, 0), "Asia/Kolkata").toISOString()).toBe("2026-09-21T02:30:00.000Z")
  })

  it("follows the clock change: 08:00 is an hour earlier in UTC in summer than in winter", () => {
    expect(instantOfWallTime(wall(2026, 3, 28, 8, 0), "Europe/Madrid").toISOString()).toBe("2026-03-28T07:00:00.000Z")
    // The clocks went forward overnight.
    expect(instantOfWallTime(wall(2026, 3, 29, 8, 0), "Europe/Madrid").toISOString()).toBe("2026-03-29T06:00:00.000Z")
    expect(instantOfWallTime(wall(2026, 10, 24, 8, 0), "Europe/Madrid").toISOString()).toBe("2026-10-24T06:00:00.000Z")
    // ...and back.
    expect(instantOfWallTime(wall(2026, 10, 25, 8, 0), "Europe/Madrid").toISOString()).toBe("2026-10-25T07:00:00.000Z")
  })

  it("moves a wall time that never happens (clocks going forward) to just after the jump", () => {
    // 02:30 does not exist in Madrid on 2026-03-29: the clock goes from 02:00 to 03:00.
    const instant = instantOfWallTime(wall(2026, 3, 29, 2, 30), "Europe/Madrid")
    expect(wallTimeIn(instant, "Europe/Madrid")).toEqual(wall(2026, 3, 29, 3, 30))
  })

  it("takes the first of a wall time that happens twice (clocks going back)", () => {
    // 02:30 happens twice in Madrid on 2026-10-25: 00:30Z (still summer time) and 01:30Z.
    expect(instantOfWallTime(wall(2026, 10, 25, 2, 30), "Europe/Madrid").toISOString()).toBe("2026-10-25T00:30:00.000Z")
  })

  it("handles the American change dates too", () => {
    expect(instantOfWallTime(wall(2026, 3, 8, 8, 0), "America/New_York").toISOString()).toBe("2026-03-08T12:00:00.000Z")
    expect(instantOfWallTime(wall(2026, 3, 7, 8, 0), "America/New_York").toISOString()).toBe("2026-03-07T13:00:00.000Z")
  })
})

describe("calendar helpers", () => {
  it("adds days across month and year ends", () => {
    expect(addDays({ year: 2026, month: 12, day: 31 }, 1)).toEqual({ year: 2027, month: 1, day: 1 })
    expect(addDays({ year: 2026, month: 3, day: 1 }, -1)).toEqual({ year: 2026, month: 2, day: 28 })
    expect(addDays({ year: 2028, month: 2, day: 28 }, 1)).toEqual({ year: 2028, month: 2, day: 29 })
  })

  it("names the weekday and formats the date", () => {
    expect(weekdayIndex({ year: 2026, month: 9, day: 21 })).toBe(1) // Monday
    expect(dateKey({ year: 2026, month: 9, day: 1 })).toBe("2026-09-01")
  })

  it("recognizes IANA zones only", () => {
    expect(isValidTimeZone("Europe/Madrid")).toBe(true)
    expect(isValidTimeZone("Not/AZone")).toBe(false)
  })
})
