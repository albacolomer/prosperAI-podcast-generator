import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { ScheduleRunStatus } from "@/types"
import { ScheduledRunBanner } from "./ScheduledRunBanner"

const NOW = Date.parse("2026-09-21T09:00:00.000Z")

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

const render = (value: ScheduleRunStatus | null | undefined, configProblem: { message: string; since: string } | null = null) =>
  renderToStaticMarkup(<ScheduledRunBanner run={value} configProblem={configProblem} now={NOW} />)

const problem = { message: "ELEVENLABS_VOICE_ID is not set on the server.", since: "2026-09-21T09:45:08.000Z" }

describe("ScheduledRunBanner", () => {
  it("shows nothing without a run, or for an episode that arrived on time", () => {
    expect(render(null)).toBe("")
    expect(render(undefined)).toBe("")
    expect(render(run())).toBe("")
  })

  it("tells the user a scheduled episode is being generated", () => {
    const html = render(run({ status: "running", finishedAt: undefined }))

    expect(html).toContain('data-kind="running"')
    expect(html).toContain("Generating your scheduled episode")
    expect(html).toContain("8:00 AM")
  })

  it("says it is trying again on the second attempt", () => {
    expect(render(run({ status: "running", attempts: 2, finishedAt: undefined }))).toContain("Trying again")
  })

  it("shows a failure as an alert, with the safe message", () => {
    const html = render(run({ status: "failed", attempts: 2, message: "We couldn't research enough stories to generate this episode.", finishedAt: "2026-09-21T06:05:00.000Z" }))

    expect(html).toContain('data-kind="failed"')
    expect(html).toContain("We couldn&#x27;t generate your scheduled episode")
    expect(html).toContain("We couldn&#x27;t research enough stories to generate this episode. We tried twice.")
  })

  it("shows a late episode", () => {
    const html = render(run({ late: true, finishedAt: "2026-09-21T06:12:00.000Z" }))

    expect(html).toContain('data-kind="late"')
    expect(html).toContain("arrived late")
    expect(html).toContain("8:12 AM")
  })

  it("tells the user a server setting is holding the episode back, naming it, and that it will start by itself", () => {
    const html = render(null, problem)

    expect(html).toContain('data-kind="config"')
    expect(html).toContain("waiting on a server setting")
    expect(html).toContain("ELEVENLABS_VOICE_ID is not set on the server.")
    expect(html).toContain("start automatically once this is fixed")
  })

  it("shows the setting problem next to a run that is going or failed, when both apply", () => {
    const html = render(run({ status: "failed", attempts: 2, message: "x", finishedAt: "2026-09-21T06:05:00.000Z" }), problem)

    expect(html).toContain('data-kind="config"')
    expect(html).toContain('data-kind="failed"')
  })

  it("shows nothing about a setting when there is no problem", () => {
    expect(render(run({ status: "running", finishedAt: undefined }), null)).not.toContain('data-kind="config"')
  })

  it("stops mentioning an old failure", () => {
    expect(render(run({ status: "failed", message: "x", finishedAt: "2026-09-18T06:05:00.000Z", startedAt: "2026-09-18T05:45:00.000Z" }))).toBe("")
  })
})
