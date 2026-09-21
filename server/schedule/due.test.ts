import { describe, expect, it } from "vitest"
import { dueSlot, GRACE_MS, isRunnable, LEAD_MS, MAX_SCHEDULED_ATTEMPTS, nextDelivery } from "./due.js"
import { at, config, runOf } from "./fixtures.js"

// 2026-09-21 is a Monday. In Madrid (UTC+2) the daily 08:00 slot is 06:00Z and generation starts at 05:45Z.
const START = "2026-09-21T05:45:00Z"

describe("the constants", () => {
  it("start 15 minutes early, wait up to 6 hours for a missed slot and make at most 2 attempts", () => {
    expect(LEAD_MS).toBe(15 * 60_000)
    expect(GRACE_MS).toBe(6 * 60 * 60_000)
    expect(MAX_SCHEDULED_ATTEMPTS).toBe(2)
  })
})

describe("daily", () => {
  it("is not due before generation starts, and is due from 15 minutes before the delivery time", () => {
    expect(dueSlot(config(), null, at("2026-09-21T05:44:59Z"))).toBeUndefined()
    const slot = dueSlot(config(), null, at(START))
    expect(slot?.key).toBe("2026-09-21T08:00")
    expect(slot?.date).toBe("2026-09-21")
    expect(slot?.deliveryAt.toISOString()).toBe("2026-09-21T06:00:00.000Z")
    expect(slot?.startAt.toISOString()).toBe("2026-09-21T05:45:00.000Z")
  })

  it("is identified by the delivery slot, not by when generation starts", () => {
    expect(dueSlot(config(), null, at("2026-09-21T05:50:00Z"))?.key).toBe("2026-09-21T08:00")
  })

  it("is due on every day", () => {
    for (const day of ["21", "22", "23", "24", "25", "26", "27"]) {
      expect(dueSlot(config(), null, at(`2026-09-${day}T05:50:00Z`))?.date).toBe(`2026-09-${day}`)
    }
  })

  it("does nothing when the schedule is off or has nothing to talk about", () => {
    expect(dueSlot(config({ enabled: false }), null, at(START))).toBeUndefined()
    expect(dueSlot(config({ interests: [] }), null, at(START))).toBeUndefined()
    expect(isRunnable(config({ enabled: false }))).toBe(false)
    expect(isRunnable(config({ interests: [] }))).toBe(false)
    expect(isRunnable(config())).toBe(true)
  })
})

describe("weekly", () => {
  it("is due only on the chosen weekday", () => {
    const monday = config({ frequency: "weekly", weekday: "mon" })
    expect(dueSlot(monday, null, at("2026-09-21T05:50:00Z"))?.key).toBe("2026-09-21T08:00")
    expect(dueSlot(monday, null, at("2026-09-22T05:50:00Z"))).toBeUndefined()
    expect(dueSlot(monday, null, at("2026-09-27T05:50:00Z"))).toBeUndefined()
    expect(dueSlot(monday, null, at("2026-09-28T05:50:00Z"))?.key).toBe("2026-09-28T08:00")
  })

  it("supports every day of the week, Monday to Sunday", () => {
    const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const
    days.forEach((weekday, index) => {
      const weekly = config({ frequency: "weekly", weekday })
      const day = 21 + index
      expect(dueSlot(weekly, null, at(`2026-09-${day}T05:50:00Z`))?.date).toBe(`2026-09-${day}`)
      expect(dueSlot(weekly, null, at(`2026-09-${day + 1}T05:50:00Z`))).toBeUndefined()
    })
  })
})

describe("monthly", () => {
  it.each(Array.from({ length: 28 }, (_, index) => index + 1))("is due on day %i and on no other", (day) => {
    const monthly = config({ frequency: "monthly", dayOfMonth: day, timeZone: "UTC" })
    const pad = (value: number) => String(value).padStart(2, "0")
    // February 2027 has exactly 28 days: every allowed day exists, which is why 29-31 are not offered.
    expect(dueSlot(monthly, null, at(`2027-02-${pad(day)}T07:50:00Z`))?.date).toBe(`2027-02-${pad(day)}`)
    const other = day === 28 ? "2027-03-01" : `2027-02-${pad(day + 1)}`
    expect(dueSlot(monthly, null, at(`${other}T07:50:00Z`))).toBeUndefined()
  })

  it("comes round again the next month", () => {
    const monthly = config({ frequency: "monthly", dayOfMonth: 15 })
    expect(dueSlot(monthly, null, at("2026-10-15T05:50:00Z"))?.key).toBe("2026-10-15T08:00")
    expect(dueSlot(monthly, null, at("2026-10-16T05:50:00Z"))).toBeUndefined()
  })
})

describe("timezone", () => {
  it("reads the delivery time on the stored zone's wall clock", () => {
    // 08:00 in Tokyo (UTC+9) is 23:00Z the day before; in New York (UTC-4 in September) it is 12:00Z.
    const tokyo = config({ timeZone: "Asia/Tokyo" })
    expect(dueSlot(tokyo, null, at("2026-09-20T22:50:00Z"))?.key).toBe("2026-09-21T08:00")
    expect(dueSlot(tokyo, null, at("2026-09-20T22:40:00Z"))).toBeUndefined()
    const newYork = config({ timeZone: "America/New_York" })
    expect(dueSlot(newYork, null, at("2026-09-21T11:50:00Z"))?.key).toBe("2026-09-21T08:00")
    expect(dueSlot(newYork, null, at("2026-09-21T05:50:00Z"))).toBeUndefined()
  })

  it("uses the zone's date for the weekday: a Tokyo Monday morning is still Sunday in UTC", () => {
    const tokyoMonday = config({ timeZone: "Asia/Tokyo", frequency: "weekly", weekday: "mon" })
    expect(dueSlot(tokyoMonday, null, at("2026-09-20T22:50:00Z"))?.date).toBe("2026-09-21")
  })

  it("keeps the local delivery time across a daylight-saving change", () => {
    // Madrid moves to summer time on Sunday 2026-03-29: 08:00 local is 07:00Z the day before, 06:00Z the day of.
    const march = config({ armedAt: "2026-03-01T00:00:00.000Z" })
    expect(dueSlot(march, null, at("2026-03-28T06:45:00Z"))?.deliveryAt.toISOString()).toBe("2026-03-28T07:00:00.000Z")
    expect(dueSlot(march, null, at("2026-03-28T06:44:00Z"))).toBeUndefined()
    const after = dueSlot(march, null, at("2026-03-29T05:45:00Z"))
    expect(after?.deliveryAt.toISOString()).toBe("2026-03-29T06:00:00.000Z")
    expect(after?.key).toBe("2026-03-29T08:00")
    // ...and back on 2026-10-25.
    const october = config({ armedAt: "2026-10-01T00:00:00.000Z" })
    expect(dueSlot(october, null, at("2026-10-25T06:45:00Z"))?.deliveryAt.toISOString()).toBe("2026-10-25T07:00:00.000Z")
  })

  it("gives one slot per day across the 23-hour day", () => {
    const daily = config({ armedAt: "2026-03-01T00:00:00.000Z" })
    const claimed = runOf({ slotDate: "2026-03-29", deliveryAt: "2026-03-29T06:00:00.000Z", slot: "2026-03-29T08:00" })
    expect(dueSlot(daily, claimed, at("2026-03-29T06:30:00Z"))).toBeUndefined()
    expect(dueSlot(daily, claimed, at("2026-03-30T05:45:00Z"))?.key).toBe("2026-03-30T08:00")
  })

  it("starts a slot just after midnight while it is still the evening before", () => {
    const early = config({ deliveryTime: "00:10" })
    // 23:55 in Madrid on the 20th is 21:55Z; the 00:10 slot of the 21st begins at 23:55.
    expect(dueSlot(early, null, at("2026-09-20T21:55:00Z"))?.key).toBe("2026-09-21T00:10")
  })
})

describe("a slot the server missed", () => {
  it("is caught up once within 6 hours of the delivery time", () => {
    // The server comes back at 10:30 Madrid for a 08:00 slot.
    expect(dueSlot(config(), null, at("2026-09-21T08:30:00Z"))?.key).toBe("2026-09-21T08:00")
    // Exactly 6 hours late is still inside the window.
    expect(dueSlot(config(), null, at("2026-09-21T12:00:00Z"))?.key).toBe("2026-09-21T08:00")
  })

  it("is skipped after that", () => {
    expect(dueSlot(config(), null, at("2026-09-21T12:00:01Z"))).toBeUndefined()
    expect(dueSlot(config(), null, at("2026-09-21T18:00:00Z"))).toBeUndefined()
  })

  it("never becomes a backlog: three days away means one episode at most, and only for the newest slot", () => {
    const armed = config({ armedAt: "2026-09-18T00:00:00.000Z" })
    const back = at("2026-09-21T06:30:00Z") // Monday, 08:30 in Madrid: three daily slots were missed (18th, 19th, 20th).
    const slot = dueSlot(armed, null, back)
    expect(slot?.key).toBe("2026-09-21T08:00")
    // With today's slot claimed, none of the older ones comes back.
    const claimed = runOf({ slotDate: "2026-09-21", deliveryAt: slot?.deliveryAt.toISOString() })
    expect(dueSlot(armed, claimed, back)).toBeUndefined()
    expect(dueSlot(armed, claimed, at("2026-09-21T07:00:00Z"))).toBeUndefined()
  })

  it("does not revive an old slot when the current one has not begun", () => {
    // Monday 05:00Z: the 20th's slot (06:00Z on the 20th) is 23 hours old, today's has not begun.
    expect(dueSlot(config({ armedAt: "2026-09-18T00:00:00.000Z" }), null, at("2026-09-21T05:00:00Z"))).toBeUndefined()
  })

  it("applies to weekly slots too", () => {
    const weekly = config({ frequency: "weekly", weekday: "mon" })
    expect(dueSlot(weekly, null, at("2026-09-21T09:00:00Z"))?.key).toBe("2026-09-21T08:00")
    expect(dueSlot(weekly, null, at("2026-09-22T09:00:00Z"))).toBeUndefined()
  })

  it("is not invented for a slot that had already passed when the schedule was switched on", () => {
    // Switched on at 12:00 Madrid (10:00Z): this morning's 08:00 slot is not run, tomorrow's is.
    const armedLate = config({ armedAt: "2026-09-21T10:00:00.000Z" })
    expect(dueSlot(armedLate, null, at("2026-09-21T10:05:00Z"))).toBeUndefined()
    expect(dueSlot(armedLate, null, at("2026-09-22T05:50:00Z"))?.key).toBe("2026-09-22T08:00")
    // Switched on at 07:50 for a 08:00 slot: it runs at once.
    const armedInLead = config({ armedAt: "2026-09-21T05:50:00.000Z" })
    expect(dueSlot(armedInLead, null, at("2026-09-21T05:51:00Z"))?.key).toBe("2026-09-21T08:00")
  })
})

describe("one slot per day", () => {
  it("is not due again once the slot is claimed, whatever became of the run", () => {
    for (const status of ["running", "completed", "failed"] as const) {
      expect(dueSlot(config(), runOf({ status }), at("2026-09-21T05:50:00Z"))).toBeUndefined()
    }
  })

  it("does not start a second episode the same day when the delivery time is changed after a run", () => {
    const claimed = runOf()
    // Moved from 08:00 to 09:00 after this morning's episode: the new slot is on the same day.
    expect(dueSlot(config({ deliveryTime: "09:00" }), claimed, at("2026-09-21T06:50:00Z"))).toBeUndefined()
    // Moved earlier, to 05:00 (03:00Z): already past and the day is claimed.
    expect(dueSlot(config({ deliveryTime: "05:00" }), claimed, at("2026-09-21T02:50:00Z"))).toBeUndefined()
  })

  it("does not fire for a slot that is no later than the claimed one, even on another local date", () => {
    // The user travelled: the zone changed, so the local date of the same instant differs.
    const claimed = runOf({ slotDate: "2026-09-21", deliveryAt: "2026-09-21T06:00:00.000Z" })
    expect(dueSlot(config({ timeZone: "Asia/Tokyo", deliveryTime: "15:00" }), claimed, at("2026-09-21T05:50:00Z"))).toBeUndefined()
  })

  it("takes the next day's slot as usual", () => {
    expect(dueSlot(config(), runOf(), at("2026-09-22T05:50:00Z"))?.key).toBe("2026-09-22T08:00")
  })
})

describe("nextDelivery", () => {
  it("is today's slot before it, and tomorrow's after it", () => {
    expect(nextDelivery(config(), null, at("2026-09-21T03:00:00Z"))?.deliveryAt.toISOString()).toBe("2026-09-21T06:00:00.000Z")
    expect(nextDelivery(config(), null, at("2026-09-21T06:00:01Z"))?.deliveryAt.toISOString()).toBe("2026-09-22T06:00:00.000Z")
  })

  it("is still today's slot while its generation is starting up, and skips it once claimed", () => {
    expect(nextDelivery(config(), null, at("2026-09-21T05:50:00Z"))?.key).toBe("2026-09-21T08:00")
    expect(nextDelivery(config(), runOf({ status: "running" }), at("2026-09-21T05:50:00Z"))?.key).toBe("2026-09-22T08:00")
  })

  it("finds the next chosen weekday", () => {
    expect(nextDelivery(config({ frequency: "weekly", weekday: "fri" }), null, at("2026-09-21T03:00:00Z"))?.key).toBe("2026-09-25T08:00")
    expect(nextDelivery(config({ frequency: "weekly", weekday: "mon" }), null, at("2026-09-21T07:00:00Z"))?.key).toBe("2026-09-28T08:00")
  })

  it("finds the next day of the month, rolling into the next month or year", () => {
    expect(nextDelivery(config({ frequency: "monthly", dayOfMonth: 28 }), null, at("2026-09-21T03:00:00Z"))?.key).toBe("2026-09-28T08:00")
    expect(nextDelivery(config({ frequency: "monthly", dayOfMonth: 15 }), null, at("2026-09-21T03:00:00Z"))?.key).toBe("2026-10-15T08:00")
    expect(nextDelivery(config({ frequency: "monthly", dayOfMonth: 1, armedAt: "2026-12-01T00:00:00.000Z" }), null, at("2026-12-20T03:00:00Z"))?.key).toBe("2027-01-01T08:00")
  })

  it("is undefined when the schedule is off", () => {
    expect(nextDelivery(config({ enabled: false }), null, at("2026-09-21T03:00:00Z"))).toBeUndefined()
    expect(nextDelivery(config({ interests: [] }), null, at("2026-09-21T03:00:00Z"))).toBeUndefined()
  })

  it("does not offer a slot before the schedule was switched on", () => {
    const armed = config({ armedAt: "2026-09-21T10:00:00.000Z" })
    expect(nextDelivery(armed, null, at("2026-09-21T10:05:00Z"))?.key).toBe("2026-09-22T08:00")
  })
})
