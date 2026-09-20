import { describe, expect, it } from "vitest"
import { enrichedStory } from "./fixtures.js"
import { MAX_SCRIPT_STORIES, parseScriptRequest } from "./request.js"

const story = (id: string, rank = 1) => ({ rank, story: enrichedStory(id) })

const valid = {
  interests: ["AI"],
  language: "en",
  durationMinutes: 10,
  tone: "conversational",
  stories: [story("a", 1), story("b", 2)],
}

/** A request whose single story is `enrichedStory("a")` with `changes` applied. */
const withStory = (changes: Record<string, unknown>) => ({
  ...valid,
  stories: [{ rank: 1, story: { ...enrichedStory("a"), ...changes } }],
})

function messageOf(body: unknown): string {
  const result = parseScriptRequest(body)
  expect(result.ok).toBe(false)
  return result.ok ? "" : result.message
}

describe("parseScriptRequest", () => {
  it("accepts a well-formed request", () => {
    const result = parseScriptRequest(valid)
    expect(result.ok && result.request.durationMinutes).toBe(10)
    expect(result.ok && result.request.stories).toHaveLength(2)
    expect(result.ok && result.request.stories[0].story.facts).toHaveLength(2)
  })

  it("accepts the duration bounds", () => {
    expect(parseScriptRequest({ ...valid, durationMinutes: 5 }).ok).toBe(true)
    expect(parseScriptRequest({ ...valid, durationMinutes: 60 }).ok).toBe(true)
  })

  it("rejects a body that is not an object", () => {
    expect(parseScriptRequest(null).ok).toBe(false)
    expect(parseScriptRequest("nope").ok).toBe(false)
  })

  it("rejects missing or empty interests", () => {
    expect(parseScriptRequest({ ...valid, interests: [] }).ok).toBe(false)
    expect(parseScriptRequest({ ...valid, interests: undefined }).ok).toBe(false)
    expect(parseScriptRequest({ ...valid, interests: ["  "] }).ok).toBe(false)
  })

  it("rejects a duration below 5 or above 60 minutes", () => {
    for (const durationMinutes of [0, 4, 4.9, 61, 120, -5]) {
      expect(messageOf({ ...valid, durationMinutes })).toContain("durationMinutes")
    }
  })

  it("rejects a duration that is not a whole number", () => {
    for (const durationMinutes of [7.5, "10", null, undefined]) {
      expect(parseScriptRequest({ ...valid, durationMinutes }).ok).toBe(false)
    }
  })

  it("rejects an unknown or missing tone", () => {
    for (const tone of ["sarcastic", "", "Conversational", 3, undefined]) {
      expect(messageOf({ ...valid, tone })).toContain("tone")
    }
  })

  it("rejects an unsupported or malformed language", () => {
    for (const language of ["english", "xx", "EN", "", 1, undefined]) {
      expect(messageOf({ ...valid, language })).toContain("language")
    }
  })

  it("rejects missing, empty or oversized story lists", () => {
    expect(parseScriptRequest({ ...valid, stories: [] }).ok).toBe(false)
    expect(parseScriptRequest({ ...valid, stories: undefined }).ok).toBe(false)
    const tooMany = Array.from({ length: MAX_SCRIPT_STORIES + 1 }, (_, i) => story(`id${i}`, i + 1))
    expect(parseScriptRequest({ ...valid, stories: tooMany }).ok).toBe(false)
    const atLimit = Array.from({ length: MAX_SCRIPT_STORIES }, (_, i) => story(`id${i}`, i + 1))
    expect(parseScriptRequest({ ...valid, stories: atLimit }).ok).toBe(true)
  })

  it("rejects malformed stories", () => {
    for (const malformed of [
      { rank: 1 },
      { rank: 1, story: "a story" },
      { rank: 1, story: { ...enrichedStory("a"), facts: undefined } },
      { rank: 1, story: { ...enrichedStory("a"), storyId: "" } },
      { rank: 1, story: { ...enrichedStory("a"), headline: "  " } },
      { rank: 1, story: { ...enrichedStory("a"), sources: undefined } },
    ]) {
      expect(parseScriptRequest({ ...valid, stories: [malformed] }).ok).toBe(false)
    }
  })

  it("rejects an invalid rank", () => {
    for (const rank of [0, -1, 1.5, "1", undefined]) {
      expect(parseScriptRequest({ ...valid, stories: [{ rank, story: enrichedStory("a") }] }).ok).toBe(false)
    }
  })

  it("keeps ranks as given, so stories dropped before scripting leave gaps", () => {
    const result = parseScriptRequest({ ...valid, stories: [story("a", 1), story("c", 3), story("f", 6)] })
    expect(result.ok && result.request.stories.map((s) => s.rank)).toEqual([1, 3, 6])
  })

  it("rejects oversized fields", () => {
    expect(parseScriptRequest(withStory({ facts: [{ claim: "x".repeat(2001), sourceIds: ["s1"] }] })).ok).toBe(false)
    expect(parseScriptRequest(withStory({ headline: "x".repeat(501) })).ok).toBe(false)
    expect(parseScriptRequest({ ...valid, interests: Array.from({ length: 11 }, (_, i) => `i${i}`) }).ok).toBe(false)
  })

  it("rejects duplicate story ids", () => {
    const message = messageOf({ ...valid, stories: [story("a", 1), story("a", 2)] })
    expect(message).toContain("duplicate story id")
    expect(message).toContain("stories.1.story.storyId")
  })

  describe("only researched (enriched) stories", () => {
    it("rejects stories Research marked insufficient or failed, naming the story", () => {
      for (const status of ["insufficient", "failed"]) {
        const body = { ...valid, stories: [story("a", 1), { rank: 2, story: enrichedStory("b", { status: status as "failed" }) }] }
        const message = messageOf(body)
        expect(message).toContain("stories.1.story.status")
        expect(message).toContain("enriched")
      }
    })

    it("rejects the pre-research shape: a raw article and the ranker's reason", () => {
      const article = {
        id: "a",
        title: "Title",
        description: "A description",
        url: "https://example.com/a",
        source: "Example",
        publishedAt: "2026-09-18T10:00:00.000Z",
        interests: ["AI"],
      }
      expect(parseScriptRequest({ ...valid, stories: [{ article, rank: 1, reason: "Big news" }] }).ok).toBe(false)
    })

    it("rejects a story with no facts, since it could not support anything", () => {
      expect(parseScriptRequest(withStory({ facts: [] })).ok).toBe(false)
    })

    it("accepts a story that has facts but no context, analysis, quotes or disagreements", () => {
      expect(parseScriptRequest(withStory({ context: [], analysis: [], quotes: [], disagreements: [] })).ok).toBe(true)
    })
  })

  describe("source references", () => {
    it("rejects a claim that cites no source", () => {
      for (const key of ["facts", "context", "analysis"]) {
        expect(parseScriptRequest(withStory({ [key]: [{ claim: "Unsupported", sourceIds: [] }] })).ok).toBe(false)
      }
    })

    it("rejects a source id that is not among the story's sources, wherever it appears", () => {
      const cases: [Record<string, unknown>, string][] = [
        [{ facts: [{ claim: "x", sourceIds: ["s9"] }] }, "stories.0.story.facts.0.sourceIds"],
        [{ context: [{ claim: "x", sourceIds: ["s1", "s9"] }] }, "stories.0.story.context.0.sourceIds"],
        [{ analysis: [{ claim: "x", sourceIds: ["s9"] }] }, "stories.0.story.analysis.0.sourceIds"],
        [{ quotes: [{ text: "x", speaker: "Y", sourceId: "s9" }] }, "stories.0.story.quotes.0.sourceId"],
        [
          { disagreements: [{ topic: "t", positions: [{ claim: "x", sourceIds: ["s1"] }, { claim: "y", sourceIds: ["s9"] }] }] },
          "stories.0.story.disagreements.0.positions.1.sourceIds",
        ],
      ]
      for (const [changes, path] of cases) {
        const message = messageOf(withStory(changes))
        expect(message).toContain(path)
        expect(message).toContain('unknown source id "s9"')
      }
    })

    it("accepts sourced disagreements", () => {
      const disagreements = [{ topic: "the date", positions: [{ claim: "May", sourceIds: ["s1"] }, { claim: "June", sourceIds: ["s2"] }] }]
      expect(parseScriptRequest(withStory({ disagreements })).ok).toBe(true)
    })
  })

  describe("what the request carries", () => {
    it("drops Research's debug trace and any other undeclared field", () => {
      const trace = { queries: [], candidates: [], extractions: [], synthesisRuns: 1, notes: ["internal"] }
      const body = { ...valid, stories: [{ rank: 1, reason: "Big news", story: { ...enrichedStory("a"), trace, extra: "x" } }] }
      const result = parseScriptRequest(body)
      expect(result.ok).toBe(true)
      if (!result.ok) return

      const [parsed] = result.request.stories
      expect(parsed.story).not.toHaveProperty("trace")
      expect(parsed.story).not.toHaveProperty("extra")
      expect(parsed).not.toHaveProperty("reason")
      expect(JSON.stringify(result.request)).not.toContain("internal")
    })

    it("keeps the researched material intact", () => {
      const result = parseScriptRequest({ ...valid, stories: [story("a", 2)] })
      expect(result.ok && result.request.stories[0]).toEqual({ rank: 2, story: enrichedStory("a") })
    })
  })
})
