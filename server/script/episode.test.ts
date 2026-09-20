import { describe, expect, it, vi } from "vitest"
import { ScriptError } from "./errors.js"
import { generateEpisode } from "./episode.js"
import { enrichedStory, modelPlanOf, segment, words } from "./fixtures.js"
import type { PlannerModel } from "./planner.js"
import type { ReviewModel } from "./review.js"
import type { ScriptModel } from "./writer.js"

const stories = [
  { rank: 1, story: enrichedStory("a") },
  { rank: 2, story: enrichedStory("b") },
  { rank: 3, story: enrichedStory("c") },
]

const planAnswer = modelPlanOf(["b", "a"], { omitted: [{ storyId: "c", reason: "Thin material" }] })

const scriptAnswer = (extra = "") => ({
  title: "A Real Title",
  segments: [
    segment("hook", `${words(59)} hook`, ["b"]),
    segment("story", `${words(1100)} A. Speaker said “exact words about b”. ${extra}`, ["b", "a"]),
    segment("outro", `${words(39)} bye`),
  ],
})

/** A clock that advances 1s on every reading, so each stage has a distinct, predictable duration. */
function ticking() {
  let now = 0
  return () => (now += 1000)
}

function models(overrides: { plan?: PlannerModel; write?: ScriptModel; review?: ReviewModel } = {}) {
  return {
    planner: { model: overrides.plan ?? vi.fn<PlannerModel>(async () => JSON.stringify(planAnswer)), modelName: "planner-model" },
    writer: { model: overrides.write ?? vi.fn<ScriptModel>(async () => JSON.stringify(scriptAnswer())), modelName: "writer-model" },
    reviewer: { model: overrides.review ?? vi.fn<ReviewModel>(async () => JSON.stringify({ issues: [] })), modelName: "review-model" },
  }
}

const input = { interests: ["AI"], language: "en" as const, durationMinutes: 10, tone: "conversational" as const, stories }

describe("generateEpisode", () => {
  it("plans, writes and validates, returning the script with its plan and validation", async () => {
    const result = await generateEpisode(input, { ...models(), log: () => {}, clock: ticking() })

    expect(result.title).toBe("A Real Title")
    expect(result.plan.stories.map((s) => s.storyId)).toEqual(["b", "a"])
    expect(result.plan.openingStoryId).toBe("b")
    expect(result.validation.passed).toBe(true)
    expect(result.validation.stats).toMatchObject({ storiesPlanned: 2, storiesCovered: 2, quotesUsed: 1, aiReview: "passed" })
    expect(result.segments).toHaveLength(3)
    expect(result.script).toContain("A. Speaker said")
  })

  it("keeps the existing response contract: articleIds are story ids, omitted comes from the plan, stats keep their meaning", async () => {
    const result = await generateEpisode(input, { ...models(), log: () => {}, clock: ticking() })

    expect(result.segments[1].articleIds).toEqual(["b", "a"])
    expect(result.omitted).toEqual([{ articleId: "c", reason: "Thin material" }])
    expect(result.stats).toMatchObject({
      storiesProvided: 3,
      storiesCovered: 2,
      storiesOmitted: 1,
      targetWords: 1500,
      targetMinutes: 10,
      model: "writer-model",
    })
    expect(result.stats.wordCount).toBe(result.validation.stats.wordCount)
  })

  it("reports each stage's model and time", async () => {
    const result = await generateEpisode(input, { ...models(), log: () => {}, clock: ticking() })
    expect(result.stages.planner).toEqual({ model: "planner-model", durationMs: 1000 })
    expect(result.stages.writer).toEqual({ model: "writer-model", durationMs: 1000 })
    expect(result.stages.validator).toEqual({ model: "review-model", durationMs: 1000 })
    expect(result.stages.totalMs).toBeGreaterThanOrEqual(3000)
  })

  it("feeds the plan to the writer and the plan plus the script to the reviewer, in that order", async () => {
    const calls: string[] = []
    const plan = vi.fn<PlannerModel>(async () => {
      calls.push("plan")
      return JSON.stringify(planAnswer)
    })
    const write = vi.fn<ScriptModel>(async () => {
      calls.push("write")
      return JSON.stringify(scriptAnswer())
    })
    const review = vi.fn<ReviewModel>(async () => {
      calls.push("review")
      return JSON.stringify({ issues: [] })
    })
    await generateEpisode(input, { ...models({ plan, write, review }), log: () => {}, clock: ticking() })

    expect(calls).toEqual(["plan", "write", "review"])
    expect(write.mock.calls[0][0].user).toContain('"angle": "An angle"')
    expect(write.mock.calls[0][0].user).not.toContain("Headline c")
    expect(review.mock.calls[0][0].user).toContain("A. Speaker said")
    expect(review.mock.calls[0][0].user).toContain('"selected": true')
  })

  it("returns a failed validation instead of throwing when the script breaks a rule (too long, invented quote)", async () => {
    const long = { title: "T", segments: [segment("hook", words(100), ["b"]), segment("story", `${words(2500)} They said "we will absolutely win everything this year".`, ["b", "a"]), segment("outro", words(100))] }
    const result = await generateEpisode(input, { ...models({ write: async () => JSON.stringify(long) }), log: () => {}, clock: ticking() })

    expect(result.validation.passed).toBe(false)
    expect(result.validation.issues.map((i) => i.type)).toEqual(expect.arrayContaining(["word-count-exceeded", "quote-unverified"]))
    expect(result.validation.stats.wordCount).toBeGreaterThan(1725)
    // The script is still returned so the failure can be inspected.
    expect(result.script).toContain("win everything")
  })

  it("passes despite AI style warnings, and fails on an AI evidence error", async () => {
    const warn = models({ review: async () => JSON.stringify({ issues: [{ type: "tone", severity: "error", message: "Stiff.", segmentIndex: null, excerpt: null, evidenceIds: [] }] }) })
    expect((await generateEpisode(input, { ...warn, log: () => {}, clock: ticking() })).validation.passed).toBe(true)

    const bad = models({
      review: async () =>
        JSON.stringify({ issues: [{ type: "invented-fact", severity: "error", message: "Made up.", segmentIndex: 2, excerpt: "A. Speaker said", evidenceIds: [] }] }),
    })
    expect((await generateEpisode(input, { ...bad, log: () => {}, clock: ticking() })).validation.passed).toBe(false)
  })

  it("does not fail the episode when the AI review is unavailable", async () => {
    const review: ReviewModel = async () => {
      throw new ScriptError("upstream", "OpenAI rejected the review request (HTTP 500)")
    }
    const result = await generateEpisode(input, { ...models({ review }), log: () => {}, clock: ticking() })
    expect(result.validation.stats.aiReview).toBe("unavailable")
    expect(result.validation.passed).toBe(true)
  })

  describe("a second writing attempt (retry)", () => {
    const issues = [
      { source: "ai" as const, type: "unsupported-connection", severity: "error" as const, message: "The outro ties the stories together.", segmentIndex: 3, excerpt: "the same basic rule applies" },
    ]

    it("skips the planner, writes on the given plan and validates the result like a first attempt", async () => {
      const first = await generateEpisode(input, { ...models(), log: () => {}, clock: ticking() })
      const plan = vi.fn<PlannerModel>(async () => JSON.stringify(planAnswer))
      const write = vi.fn<ScriptModel>(async () => JSON.stringify(scriptAnswer("Second draft.")))
      const review = vi.fn<ReviewModel>(async () => JSON.stringify({ issues: [] }))

      const second = await generateEpisode(input, { ...models({ plan, write, review }), log: () => {}, clock: ticking() }, { plan: first.plan, issues })

      expect(plan).not.toHaveBeenCalled()
      expect(write).toHaveBeenCalledTimes(1)
      expect(review).toHaveBeenCalledTimes(1)
      expect(second.plan).toBe(first.plan)
      expect(second.script).toContain("Second draft.")
      expect(second.validation.passed).toBe(true)
      expect(second.stages.planner.durationMs).toBe(0)
    })

    it("tells the writer what was rejected, and only on the retry", async () => {
      const first = await generateEpisode(input, { ...models(), log: () => {}, clock: ticking() })
      const firstWrite = vi.fn<ScriptModel>(async () => JSON.stringify(scriptAnswer()))
      await generateEpisode(input, { ...models({ write: firstWrite }), log: () => {}, clock: ticking() })
      const retryWrite = vi.fn<ScriptModel>(async () => JSON.stringify(scriptAnswer()))
      await generateEpisode(input, { ...models({ write: retryWrite }), log: () => {}, clock: ticking() }, { plan: first.plan, issues })

      expect(firstWrite.mock.calls[0][0].user).not.toContain("REVISION REQUIRED")
      const { user, system } = retryWrite.mock.calls[0][0]
      expect(user).toContain("REVISION REQUIRED")
      expect(user).toContain("unsupported-connection")
      expect(user).toContain("the same basic rule applies")
      // The plan and the evidence are the same, and the fixed instructions are untouched.
      expect(user).toContain('"angle": "An angle"')
      expect(system).toBe(firstWrite.mock.calls[0][0].system)
    })

    it("a retry that still breaks a rule is judged by the same validator", async () => {
      const first = await generateEpisode(input, { ...models(), log: () => {}, clock: ticking() })
      const long = { title: "T", segments: [segment("hook", words(100), ["b"]), segment("story", `${words(2500)} They said "we will absolutely win everything this year".`, ["b", "a"]), segment("outro", words(100))] }

      const second = await generateEpisode(input, { ...models({ write: async () => JSON.stringify(long) }), log: () => {}, clock: ticking() }, { plan: first.plan, issues })

      expect(second.validation.passed).toBe(false)
      expect(second.validation.issues.map((i) => i.type)).toEqual(expect.arrayContaining(["word-count-exceeded", "quote-unverified"]))
    })
  })

  it("fails the request when the planner or the writer fails, without calling the later stages", async () => {
    const write = vi.fn<ScriptModel>(async () => JSON.stringify(scriptAnswer()))
    const review = vi.fn<ReviewModel>(async () => JSON.stringify({ issues: [] }))

    const badPlan = models({ plan: async () => JSON.stringify({ ...planAnswer, omitted: [] }), write, review })
    await expect(generateEpisode(input, { ...badPlan, log: () => {}, clock: ticking() })).rejects.toMatchObject({ kind: "invalid-output", message: expect.stringContaining("planner") })
    expect(write).not.toHaveBeenCalled()

    const badWrite = models({ write: async () => "not json", review })
    await expect(generateEpisode(input, { ...badWrite, log: () => {}, clock: ticking() })).rejects.toMatchObject({ kind: "invalid-output" })
    expect(review).not.toHaveBeenCalled()
  })
})
