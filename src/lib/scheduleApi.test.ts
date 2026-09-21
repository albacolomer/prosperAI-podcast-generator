import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_PODCAST_SETTINGS } from "@/types"
import type { ScheduleStatus } from "@/types"
import { buildSchedulePayload, fetchSchedule, interestsToSync, saveSchedule, withInterests } from "./scheduleApi"

const settings = { ...DEFAULT_PODCAST_SETTINGS, scheduleEnabled: true, frequency: "weekly" as const, weekday: "fri" as const, dayOfMonth: 12, deliveryTime: "07:30", language: "es", tone: "humorous" as const }

describe("buildSchedulePayload", () => {
  it("sends the schedule, what an episode is made from and the timezone, and nothing else", () => {
    expect(buildSchedulePayload(settings, ["Space", "Cooking"], "Europe/Madrid")).toEqual({
      enabled: true,
      frequency: "weekly",
      deliveryTime: "07:30",
      weekday: "fri",
      dayOfMonth: 12,
      language: "es",
      tone: "humorous",
      interests: ["Space", "Cooking"],
      timeZone: "Europe/Madrid",
    })
  })

  it("carries the switch as it is: saving settings with the schedule off does not turn it on", () => {
    expect(buildSchedulePayload({ ...settings, scheduleEnabled: false }, ["AI"], "UTC").enabled).toBe(false)
  })

  it("uses the browser's timezone by default", () => {
    expect(buildSchedulePayload(settings, ["AI"]).timeZone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
  })
})

describe("withInterests", () => {
  it("changes only the interests of the schedule the server holds", () => {
    const status = {
      configured: true,
      enabled: true,
      frequency: "monthly",
      deliveryTime: "06:00",
      weekday: "tue",
      dayOfMonth: 9,
      language: "fr",
      tone: "informative",
      interests: ["Old"],
      timeZone: "Asia/Tokyo",
      nextDeliveryAt: null,
      run: null,
      paused: null,
    } satisfies ScheduleStatus

    expect(withInterests(status, ["New"], "Europe/Paris")).toEqual({
      enabled: true,
      frequency: "monthly",
      deliveryTime: "06:00",
      weekday: "tue",
      dayOfMonth: 9,
      language: "fr",
      tone: "informative",
      interests: ["New"],
      timeZone: "Europe/Paris",
    })
  })
})

describe("interestsToSync", () => {
  const held = (interests: string[], enabled = true): ScheduleStatus => ({
    configured: true,
    enabled,
    frequency: "daily",
    deliveryTime: "08:00",
    weekday: "mon",
    dayOfMonth: 1,
    language: "en",
    tone: "conversational",
    interests,
    timeZone: "Europe/Madrid",
    nextDeliveryAt: null,
    run: null,
    paused: null,
  })

  it("sends a change of interests", () => {
    expect(interestsToSync(held(["AI"]), ["AI", "Space"], undefined)).toEqual(["AI", "Space"])
  })

  it("sends an empty selection too: the server must never keep interests the user removed", () => {
    expect(interestsToSync(held(["AI", "Space"]), [], undefined)).toEqual([])
  })

  it("sends nothing when the server already holds exactly these interests, empty ones included", () => {
    expect(interestsToSync(held(["AI"]), ["AI"], undefined)).toBeNull()
    expect(interestsToSync(held([]), [], undefined)).toBeNull()
  })

  it("sends nothing when the server has no schedule yet, or has not answered (the first Save carries the interests)", () => {
    expect(interestsToSync({ configured: false, enabled: false, nextDeliveryAt: null, run: null }, ["AI"], undefined)).toBeNull()
    expect(interestsToSync(null, [], undefined)).toBeNull()
  })

  it("does not resend a set that was already tried, empty or not", () => {
    expect(interestsToSync(held(["AI"]), [], JSON.stringify([]))).toBeNull()
    expect(interestsToSync(held(["AI"]), ["Space"], JSON.stringify(["Space"]))).toBeNull()
  })

  it("resumes: adding an interest after an empty selection is sent", () => {
    expect(interestsToSync(held([]), ["AI"], JSON.stringify([]))).toEqual(["AI"])
  })

  it("keeps the schedule as it is: the payload for an empty selection does not switch it off", () => {
    const status = held(["AI"], true)
    if (!status.configured) throw new Error("fixture")
    expect(withInterests(status, [], "Europe/Madrid")).toMatchObject({ enabled: true, frequency: "daily", deliveryTime: "08:00", interests: [] })
  })
})

describe("the schedule requests", () => {
  const fetchMock = vi.fn<typeof fetch>()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  const status: ScheduleStatus = { configured: false, enabled: false, nextDeliveryAt: null, run: null }
  const payload = buildSchedulePayload(settings, ["AI"], "Europe/Madrid")

  it("reads the schedule from /api/schedule", async () => {
    fetchMock.mockResolvedValue(Response.json(status))

    expect(await fetchSchedule()).toEqual(status)
    expect(fetchMock.mock.calls[0][0]).toBe("/api/schedule")
  })

  it("rejects when the schedule cannot be read or the answer is not a schedule", async () => {
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 500 }))
    await expect(fetchSchedule()).rejects.toThrow("500")
    fetchMock.mockResolvedValueOnce(Response.json({ hello: "world" }))
    await expect(fetchSchedule()).rejects.toThrow()
  })

  it("PUTs the payload as JSON and resolves with what the server now holds", async () => {
    fetchMock.mockResolvedValue(Response.json({ ...status, configured: true }))

    const saved = await saveSchedule(payload)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/schedule")
    expect(init?.method).toBe("PUT")
    expect(JSON.parse(init?.body as string)).toEqual(payload)
    expect(saved.configured).toBe(true)
  })

  it("rejects with the server's message when it refuses the schedule", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "dayOfMonth: Too big" }, { status: 400 }))

    await expect(saveSchedule(payload)).rejects.toThrow("dayOfMonth: Too big")
  })
})
