import { addDays, dateKey, instantOfWallTime, parseTime, wallTimeIn, weekdayIndex } from "./time.js"
import type { CalendarDate } from "./time.js"
import type { RunRecord, ScheduleConfig } from "./types.js"
import { WEEKDAYS } from "./types.js"

/** The delivery time is when the episode should be ready, so generation starts this long before it (a run takes about 5 minutes). */
export const LEAD_MS = 15 * 60 * 1000
/** A slot the server missed is still run, once, if it is no older than this. Older slots are skipped. */
export const GRACE_MS = 6 * 60 * 60 * 1000
/** Full pipeline attempts per slot. A second attempt is the same slot again, never a second episode. */
export const MAX_SCHEDULED_ATTEMPTS = 2

/** The longest gap between two slots: a monthly schedule, plus slack for the 28th to the 1st. */
const LOOKAHEAD_DAYS = 62

export interface Slot {
  /** `2026-09-21T08:00` in the schedule's timezone. */
  key: string
  /** The local calendar day, `2026-09-21`. */
  date: string
  /** When the episode is due. */
  deliveryAt: Date
  /** When generation should begin: LEAD_MS earlier. */
  startAt: Date
}

/** A schedule that can produce an episode: on, and with something to talk about. */
export function isRunnable(config: ScheduleConfig): boolean {
  return config.enabled && config.interests.length > 0
}

function matches(config: ScheduleConfig, date: CalendarDate): boolean {
  switch (config.frequency) {
    case "daily":
      return true
    case "weekly":
      // getUTCDay counts from Sunday; the schedule's weekdays from Monday.
      return WEEKDAYS[(weekdayIndex(date) + 6) % 7] === config.weekday
    case "monthly":
      return date.day === config.dayOfMonth
  }
}

function slotOn(config: ScheduleConfig, date: CalendarDate): Slot {
  const { hour, minute } = parseTime(config.deliveryTime)
  const deliveryAt = instantOfWallTime({ ...date, hour, minute }, config.timeZone)
  return {
    key: `${dateKey(date)}T${config.deliveryTime}`,
    date: dateKey(date),
    deliveryAt,
    startAt: new Date(deliveryAt.getTime() - LEAD_MS),
  }
}

/** A slot the saved run already covers: the same local day, or no later than the delivery it had. */
function isClaimed(run: RunRecord | null, slot: Slot): boolean {
  if (!run) return false
  return run.slotDate === slot.date || slot.deliveryAt.getTime() <= Date.parse(run.deliveryAt)
}

/** The schedule's slots on the local days from `fromOffset` to `toOffset` around `now`, earliest first. */
function slotsAround(config: ScheduleConfig, now: Date, fromOffset: number, toOffset: number): Slot[] {
  const today = wallTimeIn(now, config.timeZone)
  const slots: Slot[] = []
  for (let offset = fromOffset; offset <= toOffset; offset++) {
    const date = addDays(today, offset)
    if (matches(config, date)) slots.push(slotOn(config, date))
  }
  return slots
}

/**
 * The slot to generate right now, if any. It is the newest slot that:
 *  - has begun (its start, LEAD_MS before delivery, has passed) and is no more than GRACE_MS overdue;
 *  - falls after the schedule was armed, so switching a schedule on at 10:00 does not run this morning's 08:00 slot;
 *  - is not already claimed by the saved run.
 * Only the newest is returned, so a server that was away for days produces one episode, never a backlog.
 */
export function dueSlot(config: ScheduleConfig, run: RunRecord | null, now: Date): Slot | undefined {
  if (!isRunnable(config)) return undefined
  const armedAt = Date.parse(config.armedAt)
  // Yesterday (an overdue slot), today, and tomorrow (a slot just after midnight whose lead has begun).
  const eligible = slotsAround(config, now, -1, 1).filter(
    (slot) =>
      slot.startAt <= now &&
      now.getTime() <= slot.deliveryAt.getTime() + GRACE_MS &&
      slot.deliveryAt.getTime() > armedAt &&
      !isClaimed(run, slot),
  )
  return eligible.at(-1)
}

/** The next delivery the user should expect: the earliest unclaimed slot not yet due, or undefined when nothing is scheduled. */
export function nextDelivery(config: ScheduleConfig, run: RunRecord | null, now: Date): Slot | undefined {
  if (!isRunnable(config)) return undefined
  const armedAt = Date.parse(config.armedAt)
  return slotsAround(config, now, 0, LOOKAHEAD_DAYS).find(
    (slot) => slot.deliveryAt > now && slot.deliveryAt.getTime() > armedAt && !isClaimed(run, slot),
  )
}
