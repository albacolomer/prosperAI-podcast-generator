import { describe, expect, it, vi } from "vitest"
import { ScriptError } from "./errors.js"
import { indexStory } from "./evidence.js"
import { enrichedStory, planOf, segment } from "./fixtures.js"
import { parseReview, reviewScript } from "./review.js"
import type { ReviewModel } from "./review.js"
import { buildReviewSystemPrompt, buildReviewUserPrompt, ERROR_TYPES } from "./reviewPrompt.js"

const stories = [enrichedStory("a"), enrichedStory("b")].map(indexStory)
const texts = ["Hook about a.", "Google said it will invest 40 billion dollars, which is huge.", "Bye."]

const issue = (overrides: Record<string, unknown> = {}) => ({
  type: "unsupported-claim",
  severity: "error",
  message: "Not in the evidence.",
  segmentIndex: 2,
  excerpt: "invest 40 billion dollars",
  evidenceIds: [],
  ...overrides,
})

const parse = (issues: unknown[]) => parseReview(JSON.stringify({ issues }), texts, stories)

describe("parseReview", () => {
  it("keeps an evidence error that quotes real script text", () => {
    const [result] = parse([issue({ evidenceIds: ["a:f1", "a:q1"] })])
    expect(result).toEqual({
      source: "ai",
      type: "unsupported-claim",
      severity: "error",
      message: "Not in the evidence.",
      segmentIndex: 2,
      excerpt: "invest 40 billion dollars",
      evidenceIds: ["a:f1", "a:q1"],
    })
  })

  it("returns no issues for a clean script", () => {
    expect(parse([])).toEqual([])
  })

  it("never lets a subjective category block: style, repetition, tone and the like are forced to warnings", () => {
    for (const type of ["style", "repetition", "weak-transition", "tone", "hook-roadmap", "personalization-leak", "structure", "language", "unsupported-time-reference", "off-plan-evidence"]) {
      const [result] = parse([issue({ type, severity: "error" })])
      expect(result.severity, type).toBe("warning")
      expect(result.message).toContain("not an evidence problem")
    }
  })

  it("lets every evidence category be an error", () => {
    for (const type of ERROR_TYPES) {
      expect(parse([issue({ type })])[0].severity, type).toBe("error")
    }
  })

  it("keeps an evidence error as a warning when its excerpt cannot be found in the script", () => {
    for (const excerpt of ["words the script never says", "", null]) {
      const [result] = parse([issue({ excerpt })])
      expect(result.severity).toBe("warning")
      expect(result.message).toContain("could be verified")
    }
  })

  it("checks the excerpt against the segment the issue names", () => {
    // The words exist, but in segment 2, not segment 3.
    expect(parse([issue({ segmentIndex: 3 })])[0].severity).toBe("warning")
    // With no segment, anywhere in the script counts.
    expect(parse([issue({ segmentIndex: null })])[0].severity).toBe("error")
  })

  it("matches the excerpt ignoring typography and case", () => {
    expect(parse([issue({ excerpt: "INVEST 40  Billion dollars" })])[0].severity).toBe("error")
  })

  it("drops evidence ids that do not exist and segment indexes outside the script", () => {
    const [result] = parse([issue({ evidenceIds: ["a:f1", "a:f99", "zzz:f1", "garbage"], segmentIndex: 9 })])
    expect(result.evidenceIds).toEqual(["a:f1"])
    expect(result.segmentIndex).toBeUndefined()
  })

  it("rejects an answer that is not JSON, has the wrong shape or an unknown category", () => {
    for (const raw of ["nope", "{}", JSON.stringify({ issues: [issue({ type: "made-up" })] }), JSON.stringify({ issues: [issue({ severity: "fatal" })] })]) {
      expect(() => parseReview(raw, texts, stories)).toThrow(ScriptError)
    }
  })
})

describe("reviewScript", () => {
  const segments = [segment("hook", texts[0], ["a"]), segment("story", texts[1], ["a", "b"]), segment("outro", texts[2])]
  const plan = planOf(["a", "b"])
  const input = { segments, plan, stories, language: "en" as const, tone: "conversational" as const, durationMinutes: 10 }

  it("sends the numbered script, the plan, and the FULL research of each planned story marked selected or not", async () => {
    const model = vi.fn<ReviewModel>(async () => JSON.stringify({ issues: [] }))
    await reviewScript({ ...input, plan: planOf(["a", "b"], { stories: [{ ...plan.stories[0], selectedFactIds: ["f1"] }, plan.stories[1]] }) }, model)

    const { system, user } = model.mock.calls[0][0]
    const payload = JSON.parse(user) as {
      brief: { language: string; targetWords: number; maxWords: number }
      segments: { index: number; text: string }[]
      evidence: { storyId: string; facts: { id: string; selected: boolean }[] }[]
    }
    expect(payload.brief).toMatchObject({ language: "English", targetWords: 1500, maxWords: 1725 })
    expect(payload.segments.map((s) => s.index)).toEqual([1, 2, 3])
    expect(payload.evidence[0].facts).toEqual([
      expect.objectContaining({ id: "f1", selected: true }),
      expect.objectContaining({ id: "f2", selected: false }),
    ])
    expect(system).toBe(buildReviewSystemPrompt())
    expect(user).toBe(buildReviewUserPrompt({ ...input, plan: planOf(["a", "b"], { stories: [{ ...plan.stories[0], selectedFactIds: ["f1"] }, plan.stories[1]] }) }))
  })

  it("has the reviewer check every linking claim against the evidence and the plan's connections", async () => {
    const system = buildReviewSystemPrompt()
    expect(system).toContain('"unsupported-connection"')
    expect(system).toContain("claim a shared theme, trend, cause, consequence or \"bigger picture\" across them")
    expect(system).toContain("A plain change of subject")
    expect(system).toContain("mentions a story other than the first")

    const model = vi.fn<ReviewModel>(async () => JSON.stringify({ issues: [] }))
    const connected = planOf(["a", "b"], {
      connections: [{ fromStoryId: "a", toStoryId: "b", basisType: "shared-actor", basis: "Nvidia", idea: "Same supplier", fromEvidenceIds: ["f1"], toEvidenceIds: ["f2"] }],
    })
    await reviewScript({ ...input, plan: connected }, model)
    const payload = JSON.parse(model.mock.calls[0][0].user) as { plan: { connections: unknown[] } }
    expect(payload.plan.connections).toEqual([
      { from: "a", to: "b", basisType: "shared-actor", basis: "Nvidia", idea: "Same supplier", fromEvidenceIds: ["f1"], toEvidenceIds: ["f2"] },
    ])
  })

  it("tells the reviewer to report, not rewrite, to quote its evidence, and to keep judgement calls as warnings", () => {
    const system = buildReviewSystemPrompt()
    expect(system).toContain("You do NOT rewrite")
    expect(system).toContain("An issue you cannot quote is not reported")
    expect(system).toContain("Never use \"error\" for style, tone, repetition or any judgement call")
    expect(system).toContain("only by an item the plan did not select")
  })

  it("returns the parsed issues", async () => {
    const model: ReviewModel = async () => JSON.stringify({ issues: [issue()] })
    expect(await reviewScript(input, model)).toHaveLength(1)
  })
})
