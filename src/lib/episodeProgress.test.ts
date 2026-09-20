import { describe, expect, it } from "vitest"
import { applyProgress, GENERATION_STEPS, NO_PROGRESS, stepStatuses } from "./episodeProgress"
import type { StageProgress } from "./episodeProgress"

const statuses = (progress: StageProgress) => stepStatuses(progress).map(({ status }) => status)

describe("stepStatuses", () => {
  it("shows every step as pending before the server reports anything", () => {
    expect(statuses(NO_PROGRESS)).toEqual(Array(GENERATION_STEPS.length).fill("pending"))
  })

  it("marks a step done only after the server said its stages are done", () => {
    let progress = applyProgress(NO_PROGRESS, { stage: "news", status: "started" })
    expect(statuses(progress)[0]).toBe("active")
    progress = applyProgress(progress, { stage: "news", status: "done" })
    // Finding stories is news and ranking: news alone does not complete it.
    expect(statuses(progress)[0]).toBe("active")
    progress = applyProgress(applyProgress(progress, { stage: "ranking", status: "started" }), { stage: "ranking", status: "done" })
    expect(statuses(progress)[0]).toBe("done")
    expect(statuses(progress)[1]).toBe("pending")
  })

  it("follows the pipeline through to audio", () => {
    let progress = NO_PROGRESS
    for (const stage of ["news", "ranking", "research", "planning", "writing", "checking"] as const) {
      progress = applyProgress(applyProgress(progress, { stage, status: "started" }), { stage, status: "done" })
    }
    progress = applyProgress(progress, { stage: "audio", status: "started" })
    expect(statuses(progress)).toEqual(["done", "done", "done", "done", "done", "active"])
  })

  it("ignores a repeated event", () => {
    const once = applyProgress(NO_PROGRESS, { stage: "news", status: "started" })
    expect(applyProgress(once, { stage: "news", status: "started" })).toBe(once)
  })
})
