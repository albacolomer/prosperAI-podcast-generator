import { describe, expect, it, vi } from "vitest"
import { ScriptError } from "./errors.js"
import { indexStory } from "./evidence.js"
import { connection, enrichedStory, modelPlanOf, nvidiaStory } from "./fixtures.js"
import { parsePlan, planEpisode } from "./planner.js"
import type { PlannerModel } from "./planner.js"

// Stories a and b both name Nvidia in their first fact and first context item (f1, c1); story c does not.
const stories = ["a", "b", "c"].map((id) => ({ rank: Number(id.charCodeAt(0) - 96), story: id === "c" ? enrichedStory(id) : nvidiaStory(id) }))
const indexed = stories.map(({ story }) => indexStory(story))

const parse = (answer: unknown, durationMinutes = 10) => parsePlan(typeof answer === "string" ? answer : JSON.stringify(answer), indexed, durationMinutes)

function invalid(answer: unknown, message: string, durationMinutes?: number) {
  let error: unknown
  try {
    parse(answer, durationMinutes)
  } catch (caught) {
    error = caught
  }
  expect(error).toBeInstanceOf(ScriptError)
  expect((error as ScriptError).kind).toBe("invalid-output")
  expect((error as ScriptError).message).toContain(message)
}

/** A model plan telling a and b, omitting c. */
const good = () => modelPlanOf(["a", "b"], { omitted: [{ storyId: "c", reason: "thin" }] })

describe("parsePlan", () => {
  it("accepts a valid plan and derives the opening, ending and total", () => {
    const plan = parse(good())
    expect(plan.stories.map((s) => s.storyId)).toEqual(["a", "b"])
    expect(plan.openingStoryId).toBe("a")
    expect(plan.endingStoryId).toBe("b")
    expect(plan.omitted).toEqual([{ storyId: "c", reason: "thin" }])
    expect(plan.totalTargetWords).toBe(60 + 40 + 400 + 400)
  })

  it("accepts a connection whose named basis appears in the cited, selected evidence of both stories", () => {
    const plan = parse({ ...good(), connections: [connection("a", "b", { fromEvidenceIds: ["f1"], toEvidenceIds: ["f2", "c1"] })] })
    expect(plan.connections).toEqual([expect.objectContaining({ basisType: "shared-actor", basis: "Nvidia" })])
  })

  it("matches the basis ignoring case and spacing", () => {
    expect(parse({ ...good(), connections: [connection("a", "b", { basis: "  NVIDIA " })] }).connections).toHaveLength(1)
  })

  it("rejects answers that are not JSON or have the wrong shape", () => {
    invalid("nope", "not valid JSON")
    invalid({}, "expected shape")
    invalid({ ...good(), stories: [] }, "expected shape")
    invalid({ ...good(), hookTargetWords: 0 }, "expected shape")
  })

  it("rejects a story or an omission that is not in the input", () => {
    invalid({ ...good(), stories: [{ ...good().stories[0], storyId: "zzz" }, good().stories[1]] }, "not in the provided stories")
    invalid({ ...good(), omitted: [{ storyId: "zzz", reason: "x" }] }, "not in the provided stories")
  })

  it("rejects duplicates and stories both planned and omitted", () => {
    invalid({ ...good(), stories: [good().stories[0], good().stories[0]] }, "more than once")
    invalid({ ...good(), omitted: [{ storyId: "a", reason: "x" }, { storyId: "c", reason: "x" }] }, "both planned and omitted")
    invalid({ ...good(), omitted: [{ storyId: "c", reason: "x" }, { storyId: "c", reason: "y" }] }, "omitted the same story more than once")
  })

  it("rejects a plan that silently drops a story", () => {
    invalid({ ...good(), omitted: [] }, "neither planned nor omitted")
  })

  it("rejects evidence ids that do not resolve, or that are in the wrong list", () => {
    const [first, second] = good().stories
    invalid({ ...good(), stories: [{ ...first, selectedFactIds: ["f1", "f9"] }, second] }, "does not exist")
    invalid({ ...good(), stories: [{ ...first, selectedQuoteIds: ["f1"] }, second] }, "does not exist")
    invalid({ ...good(), stories: [{ ...first, selectedContextIds: ["c7"] }, second] }, "does not exist")
    invalid({ ...good(), stories: [{ ...first, selectedFactIds: ["f1", "f1"] }, second] }, "twice")
  })

  it("rejects a story without any selected fact", () => {
    const [first, second] = good().stories
    invalid({ ...good(), stories: [{ ...first, selectedFactIds: [] }, second] }, "without selecting any fact")
  })

  it("rejects a forced connection: unknown story, itself, no evidence, or unselected evidence", () => {
    invalid({ ...good(), connections: [connection("a", "c")] }, "not in the episode")
    invalid({ ...good(), connections: [connection("a", "a")] }, "to itself")
    invalid({ ...good(), connections: [connection("a", "b", { toEvidenceIds: [] })] }, "not grounded")
    // a1 exists in the story but the plan did not select it.
    invalid({ ...good(), connections: [connection("a", "b", { fromEvidenceIds: ["a1"] })] }, "not selected")
  })

  it("rejects a conceptual connection: the basis must be named in the cited evidence of BOTH stories", () => {
    // Story b's cited evidence never mentions Google.
    const googleInA = stories.map(({ rank, story }) => ({ rank, story: story.storyId === "a" ? { ...story, facts: [{ claim: "Google announced it", sourceIds: ["s1"] }, ...story.facts.slice(1)] } : story }))
    const indexedWithGoogle = googleInA.map(({ story }) => indexStory(story))
    expect(() =>
      parsePlan(JSON.stringify({ ...good(), connections: [connection("a", "b", { basis: "Google" })] }), indexedWithGoogle, 10),
    ).toThrow(/not stated in the cited evidence of both stories/)
    // Right basis, but cited on the wrong evidence items: f2 of b does not name Nvidia.
    invalid({ ...good(), connections: [connection("a", "b", { toEvidenceIds: ["f2"] })] }, "not stated in the cited evidence of both stories")
  })

  it("rejects a general topic as the basis: it must be a named actor, place, event or fact", () => {
    for (const basis of ["electricity prices", "ai compute", "energy demand"]) {
      invalid({ ...good(), connections: [connection("a", "b", { basis })] }, "general topic")
    }
  })

  it("rejects a connection without a valid basis type or basis", () => {
    invalid({ ...good(), connections: [connection("a", "b", { basisType: "same-theme" })] }, "expected shape")
    invalid({ ...good(), connections: [connection("a", "b", { basis: "" })] }, "expected shape")
  })

  it("does not require any connection or any throughline", () => {
    const plan = parse({ ...good(), connections: [], angle: "No single throughline: a sequence of stories." })
    expect(plan.connections).toEqual([])
    expect(plan.angle).toContain("No single throughline")
  })

  it("keeps at most one quote per story, and records the adjustment instead of failing or staying silent", () => {
    const [first, second] = good().stories
    const richStory = { ...first, selectedQuoteIds: ["q1", "q2"] }
    const withTwoQuotes = stories.map(({ story }) => indexStory(story.storyId === "a" ? { ...story, quotes: [...story.quotes, { text: "More words", speaker: "B. Speaker", sourceId: "s1" }] } : story))
    const plan = parsePlan(JSON.stringify({ ...good(), stories: [richStory, second] }), withTwoQuotes, 10)
    expect(plan.stories[0].selectedQuoteIds).toEqual(["q1"])
    expect(plan.adjustments).toHaveLength(1)
    expect(plan.adjustments[0]).toContain('story "a"')
    expect(parse(good()).adjustments).toEqual([])
    // Zero quotes is fine.
    expect(parse({ ...good(), stories: [{ ...first, selectedQuoteIds: [] }, second] }).stories[0].selectedQuoteIds).toEqual([])
  })

  it("counts a connection's evidence against the quote that survives the cap", () => {
    // q1 is kept, so a connection may cite it; citing a dropped quote is not grounded.
    const withTwoQuotes = stories.map(({ story }) => indexStory(story.storyId === "a" ? { ...story, quotes: [...story.quotes, { text: "Nvidia words", speaker: "B. Speaker", sourceId: "s1" }] } : story))
    const [first, second] = good().stories
    const plan = { ...good(), stories: [{ ...first, selectedQuoteIds: ["q1", "q2"] }, second] }
    expect(() => parsePlan(JSON.stringify({ ...plan, connections: [connection("a", "b", { fromEvidenceIds: ["q2"] })] }), withTwoQuotes, 10)).toThrow(/not selected/)
  })

  it("rejects a word budget over the ceiling but accepts one at or under it", () => {
    const [first, second] = good().stories
    const budget = (words: number) => ({ ...good(), stories: [{ ...first, targetWords: words }, second] })
    // 10 minutes: ceiling 1725; the rest of the plan is 60 + 40 + 400.
    invalid(budget(1300), "over the 1725-word ceiling")
    expect(parse(budget(1225)).totalTargetWords).toBe(1725)
    // A plan far under the target is fine: duration is a target, not a minimum.
    expect(parse(budget(50)).totalTargetWords).toBe(550)
  })
})

describe("planEpisode", () => {
  const input = { interests: ["AI", "Formula 1"], language: "es" as const, durationMinutes: 10, stories }

  it("returns the validated plan with timing", async () => {
    const model = vi.fn<PlannerModel>(async () => JSON.stringify(good()))
    const result = await planEpisode(input, { model, modelName: "planner-model", log: () => {}, clock: () => 0 })
    expect(result.plan.stories).toHaveLength(2)
    expect(result.model).toBe("planner-model")
    expect(result.durationMs).toBe(0)
  })

  it("shows the model every story with evidence ids, the budget and the interests, and nothing that is not research", async () => {
    const model = vi.fn<PlannerModel>(async () => JSON.stringify(good()))
    await planEpisode(input, { model, modelName: "m", log: () => {}, clock: () => 0 })
    const { system, user } = model.mock.calls[0][0]

    const payload = JSON.parse(user.slice(0, user.lastIndexOf("\n\nNotes:"))) as {
      brief: { episodeLanguage: string; wordBudget: string; listenerInterests: string[] }
      stories: { storyId: string; facts: { id: string; claim: string }[]; quotes: { id: string }[]; context: { id: string }[] }[]
    }
    expect(payload.brief.episodeLanguage).toBe("Spanish")
    expect(payload.brief.listenerInterests).toEqual(["AI", "Formula 1"])
    expect(payload.brief.wordBudget).toContain("about 1500 words")
    expect(payload.brief.wordBudget).toContain("1725")
    expect(payload.stories.map((s) => s.storyId)).toEqual(["a", "b", "c"])
    expect(payload.stories[0].facts.map((f) => f.id)).toEqual(["f1", "f2", "f3"])
    expect(payload.stories[0].quotes.map((q) => q.id)).toEqual(["q1"])
    expect(payload.stories[0].context.map((c) => c.id)).toEqual(["c1", "c2"])
    expect(user).not.toContain("https://")
    expect(user).not.toContain('"url"')

    expect(system).toContain("You do NOT write prose")
    expect(system).toContain("The default is NO connection")
    expect(system).toContain("ONLY when it rests on something the selected evidence explicitly states about BOTH stories")
    expect(system).toContain("Two stories being conceptually related is NOT a basis")
    expect(system).toContain("Do not force a global thesis or throughline")
    expect(system).toContain("No single throughline")
    expect(system).toContain("MINIMUM evidence")
    expect(system).toContain("AT MOST ONE quote, and zero is completely normal")
    expect(system).toContain("never omit a story just because it does not fit a theme")
    expect(system).toContain("omit freely")
    expect(system).toContain("not a quota and not a minimum")
    expect(system).toContain("Do not decide the number of stories from the duration")
    expect(system).not.toMatch(/tone/i)
  })

  it("lets an invalid plan surface as an invalid-output error", async () => {
    const model: PlannerModel = async () => JSON.stringify({ ...good(), omitted: [] })
    await expect(planEpisode(input, { model, modelName: "m", log: () => {}, clock: () => 0 })).rejects.toMatchObject({ kind: "invalid-output" })
  })

  it("lets model failures propagate", async () => {
    const model: PlannerModel = async () => {
      throw new ScriptError("timeout", "timed out")
    }
    await expect(planEpisode(input, { model, modelName: "m", log: () => {}, clock: () => 0 })).rejects.toMatchObject({ kind: "timeout" })
  })
})
