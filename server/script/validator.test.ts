import { describe, expect, it } from "vitest"
import type { ScriptSegment } from "../../src/types/script.js"
import { ScriptError } from "./errors.js"
import { indexStory } from "./evidence.js"
import { enrichedStory, planOf, segment, words } from "./fixtures.js"
import type { ReviewModel } from "./review.js"
import { validateScript } from "./validator.js"

const stories = [enrichedStory("a"), enrichedStory("b")].map(indexStory)
const plan = planOf(["a", "b"])

const okSegments = (): ScriptSegment[] => [
  segment("hook", words(60), ["a"]),
  segment("story", `${words(1100)} Google said it will invest 40 billion dollars.`, ["a", "b"]),
  segment("outro", words(40)),
]

const review = (issues: unknown[]): ReviewModel => async () => JSON.stringify({ issues })
const issue = (overrides: Record<string, unknown> = {}) => ({
  type: "unsupported-claim",
  severity: "error",
  message: "Nothing supports this.",
  segmentIndex: 2,
  excerpt: "invest 40 billion dollars",
  evidenceIds: [],
  ...overrides,
})

const validate = (segments: ScriptSegment[], reviewModel: ReviewModel) =>
  validateScript({ segments, language: "en", tone: "conversational", durationMinutes: 10, plan, stories }, { reviewModel, log: () => {}, clock: () => 0 })

describe("validateScript", () => {
  it("passes a clean script and reports the numbers that matter", async () => {
    const { validation } = await validate(okSegments(), review([]))
    expect(validation.passed).toBe(true)
    expect(validation.issues).toEqual([])
    expect(validation.stats).toMatchObject({
      wordCount: 1208,
      targetWords: 1500,
      maxWords: 1725,
      minWords: 1125,
      storiesPlanned: 2,
      storiesCovered: 2,
      quotesUsed: 0,
      errors: 0,
      warnings: 0,
      aiReview: "passed",
    })
  })

  it("fails a 2,752-word script for a 10-minute episode even when the AI review is clean", async () => {
    const long = [segment("hook", words(100), ["a"]), segment("story", words(2552), ["a", "b"]), segment("outro", words(100))]
    const { validation } = await validate(long, review([]))
    expect(validation.passed).toBe(false)
    expect(validation.stats.wordCount).toBe(2752)
    expect(validation.issues.map((entry) => entry.type)).toContain("word-count-exceeded")
  })

  it("fails on an AI evidence error, keeping the deterministic checks separate", async () => {
    const { validation } = await validate(okSegments(), review([issue()]))
    expect(validation.passed).toBe(false)
    expect(validation.issues).toEqual([expect.objectContaining({ source: "ai", type: "unsupported-claim", severity: "error" })])
    expect(validation.stats).toMatchObject({ errors: 1, warnings: 0, aiReview: "issues" })
  })

  it("does not fail on AI style criticism: it is a warning and the script still passes", async () => {
    const { validation } = await validate(
      okSegments(),
      review([issue({ type: "weak-transition", severity: "error", excerpt: "invest" }), issue({ type: "repetition", severity: "warning" })]),
    )
    expect(validation.passed).toBe(true)
    expect(validation.stats).toMatchObject({ errors: 0, warnings: 2, aiReview: "issues" })
  })

  it("keeps deterministic errors when the AI review is clean, and lists both kinds of issue", async () => {
    const segments = [...okSegments()]
    segments[1] = segment("story", `${words(1100)} They said "we will absolutely win everything this year".`, ["a", "b"])
    const { validation } = await validate(segments, review([issue({ type: "style", severity: "warning" })]))
    expect(validation.passed).toBe(false)
    expect(validation.issues.map((entry) => `${entry.source}:${entry.type}:${entry.severity}`)).toEqual(["deterministic:quote-unverified:error", "ai:style:warning"])
  })

  it("does not block when the AI review is unavailable, but says so", async () => {
    const failing: ReviewModel = async () => {
      throw new ScriptError("timeout", "The review request to OpenAI timed out")
    }
    const { validation } = await validate(okSegments(), failing)
    expect(validation.passed).toBe(true)
    expect(validation.stats.aiReview).toBe("unavailable")
    expect(validation.issues).toEqual([expect.objectContaining({ source: "ai", type: "review-unavailable", severity: "warning" })])
    expect(validation.issues[0].message).toContain("timed out")
  })

  it("treats a malformed AI answer as unavailable rather than passing or crashing", async () => {
    const { validation } = await validate(okSegments(), async () => "not json")
    expect(validation.stats.aiReview).toBe("unavailable")
    expect(validation.passed).toBe(true)
  })
})
