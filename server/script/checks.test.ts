import { describe, expect, it } from "vitest"
import type { ScriptSegment } from "../../src/types/script.js"
import { runChecks } from "./checks.js"
import type { CheckInput } from "./checks.js"
import { indexStory } from "./evidence.js"
import { enrichedStory, plannedStory, planOf, segment, words } from "./fixtures.js"

const stories = [enrichedStory("a"), enrichedStory("b"), enrichedStory("c")].map(indexStory)

/** A structurally valid 3-segment episode telling a and b, well inside the length limits. */
const goodSegments = (): ScriptSegment[] => [
  segment("hook", "What if the tool fought back?", ["a"]),
  segment("story", "First the launch, then the race.", ["a", "b"]),
  segment("outro", "That's where things stand.", []),
]

function check(segments: ScriptSegment[], overrides: Partial<CheckInput> = {}) {
  return runChecks({ segments, language: "en", durationMinutes: 10, plan: planOf(["a", "b"], { omitted: [{ storyId: "c", reason: "thin" }] }), stories, ...overrides })
}

const typesOf = (result: ReturnType<typeof check>, severity?: "error" | "warning") =>
  result.issues.filter((issue) => !severity || issue.severity === severity).map((issue) => issue.type)

describe("runChecks: length", () => {
  it("passes a script inside the limits (target 1500, maximum 1725)", () => {
    const result = check([segment("hook", words(60), ["a"]), segment("story", words(1200), ["a", "b"]), segment("outro", words(40))])
    expect(result.wordCount).toBe(1300)
    expect(typesOf(result, "error")).toEqual([])
  })

  it("fails a script over the maximum, such as a 2,752-word episode for a 10-minute target", () => {
    const result = check([segment("hook", words(100), ["a"]), segment("story", words(2552), ["a", "b"]), segment("outro", words(100))])
    expect(result.wordCount).toBe(2752)
    const issue = result.issues.find((entry) => entry.type === "word-count-exceeded")
    expect(issue?.severity).toBe("error")
    expect(issue?.message).toContain("1725")
  })

  it("allows exactly the maximum but not one word more", () => {
    const at = (story: number) => check([segment("hook", words(60), ["a"]), segment("story", words(story), ["a", "b"]), segment("outro", words(40))])
    expect(typesOf(at(1625))).not.toContain("word-count-exceeded")
    expect(typesOf(at(1626))).toContain("word-count-exceeded")
  })

  it("only warns when the script is under 75% of the target", () => {
    const result = check(goodSegments())
    expect(typesOf(result, "error")).toEqual([])
    expect(result.issues.find((entry) => entry.type === "word-count-low")?.severity).toBe("warning")
    expect(typesOf(check([segment("hook", words(60), ["a"]), segment("story", words(1030), ["a", "b"]), segment("outro", words(40))]))).not.toContain(
      "word-count-low",
    )
  })

  it("scales the limits with the requested duration", () => {
    const result = check([segment("hook", words(60), ["a"]), segment("story", words(900), ["a", "b"]), segment("outro", words(40))], { durationMinutes: 5 })
    // 5 minutes: target 750, maximum 863 (the same script is fine at 10 minutes).
    expect(typesOf(result)).toContain("word-count-exceeded")
    expect(typesOf(check([segment("hook", words(60), ["a"]), segment("story", words(900), ["a", "b"]), segment("outro", words(40))]))).not.toContain("word-count-exceeded")
  })
})

describe("runChecks: structure and ids", () => {
  it("accepts a well-formed episode with no errors", () => {
    const result = check(goodSegments())
    expect(typesOf(result, "error")).toEqual([])
    expect(result.storiesCovered).toBe(2)
  })

  it("requires exactly one hook first and one outro last, and a story segment", () => {
    expect(typesOf(check(goodSegments().slice(1)), "error")).toContain("missing-hook")
    expect(typesOf(check(goodSegments().slice(0, -1)), "error")).toContain("missing-outro")
    expect(typesOf(check([...goodSegments(), segment("outro", "again")]), "error")).toContain("multiple-outros")
    expect(typesOf(check([goodSegments()[0], segment("hook", "again"), ...goodSegments().slice(1)]), "error")).toContain("multiple-hooks")
    expect(typesOf(check([segment("hook", "h", ["a", "b"]), segment("outro", "o")]), "error")).toContain("no-story-segment")
  })

  it("rejects a story segment without articles", () => {
    const result = check([goodSegments()[0], segment("story", "s", []), goodSegments()[2]])
    expect(result.issues.find((entry) => entry.type === "story-segment-without-article")).toMatchObject({ severity: "error", segmentIndex: 2 })
  })

  it("rejects unknown ids, duplicate ids in a segment, and stories the plan left out", () => {
    const result = check([
      segment("hook", "h", ["made-up"]),
      segment("story", "s", ["a", "a", "b", "c"]),
      segment("outro", "o"),
    ])
    const errors = typesOf(result, "error")
    expect(errors).toContain("unknown-story-id")
    expect(errors).toContain("duplicate-story-id")
    expect(errors).toContain("unplanned-story")
  })

  it("requires every planned story to be told", () => {
    const result = check([segment("hook", "h", ["a"]), segment("story", "s", ["a"]), segment("outro", "o")])
    expect(result.issues.find((entry) => entry.type === "planned-story-missing")?.message).toContain('"b"')
    expect(result.storiesCovered).toBe(1)
  })

  it("warns, not fails, when the stories appear in another order than the plan", () => {
    const result = check([segment("hook", "h"), segment("story", "s", ["b"]), segment("story", "t", ["a"]), segment("outro", "o")])
    expect(result.issues.find((entry) => entry.type === "story-order")?.severity).toBe("warning")
    expect(typesOf(result, "error")).toEqual([])
  })

  it("warns when a segment runs far over its planned airtime", () => {
    const result = check([segment("hook", words(400), ["a"]), segment("story", words(500), ["a"]), segment("story", "b", ["b"]), segment("outro", "o")])
    const over = result.issues.filter((entry) => entry.type === "segment-over-budget")
    expect(over.map((entry) => entry.segmentIndex)).toEqual([1])
    expect(over[0].severity).toBe("warning")
  })
})

describe("runChecks: quotes", () => {
  // The hook lists both planned stories, so every planned story is told and only the quote rules are under test.
  const withText = (text: string, articleIds = ["a"]) => [segment("hook", "h", ["a", "b"]), segment("story", text, articleIds), segment("outro", "o")]

  it("accepts a verbatim verified quote from a story the segment tells, ignoring typography and trailing punctuation", () => {
    const result = check(withText('A. Speaker put it plainly: “exact words about a,” and moved on.'))
    expect(typesOf(result, "error")).toEqual([])
    expect(result.quotesUsed).toBe(1)
    expect(typesOf(result)).not.toContain("quote-speaker-missing")
  })

  it("accepts a verbatim part of a verified quote", () => {
    const result = check(withText('A. Speaker said the words were "exact words".'))
    expect(typesOf(result, "error")).toEqual([])
    expect(result.quotesUsed).toBe(1)
  })

  it("fails an invented or altered quote", () => {
    const result = check(withText('A. Speaker said "we will absolutely win everything this year".'))
    const issue = result.issues.find((entry) => entry.type === "quote-unverified")
    expect(issue).toMatchObject({ severity: "error", segmentIndex: 2 })
    expect(issue?.excerpt).toContain("win everything")
    expect(result.quotesUsed).toBe(0)
  })

  it("fails quote-marked text that came from a fact, because facts are not quotable", () => {
    const result = check(withText('It said "Fact one about a" as if it were speech.'))
    expect(typesOf(result, "error")).toContain("quote-unverified")
  })

  it("only warns about a short unmatched phrase in quotation marks", () => {
    const result = check(withText('The so-called "smart glasses" arrived.'))
    expect(typesOf(result, "error")).toEqual([])
    expect(result.issues.find((entry) => entry.type === "quoted-phrase")?.severity).toBe("warning")
  })

  it("fails a verified quote used in a segment that does not tell its story", () => {
    const result = check(withText('A. Speaker said "exact words about b".', ["a"]))
    const issue = result.issues.find((entry) => entry.type === "quote-wrong-story")
    expect(issue).toMatchObject({ severity: "error", evidenceIds: ["b:q1"] })
  })

  it("warns about a verified quote the plan did not select, and about a missing attribution", () => {
    const plan = planOf(["a", "b"], { stories: [plannedStory("a", { selectedQuoteIds: [] }), plannedStory("b")], omitted: [{ storyId: "c", reason: "x" }] })
    const result = check(withText("Somebody else said “exact words about a” ."), { plan })
    expect(typesOf(result, "error")).toEqual([])
    expect(typesOf(result, "warning")).toEqual(expect.arrayContaining(["quote-not-in-plan", "quote-speaker-missing"]))
    expect(result.quotesUsed).toBe(1)
  })
})

describe("runChecks: single quotes, hook and evidence budget", () => {
  const withText = (text: string) => [segment("hook", "h", ["a", "b"]), segment("story", text, ["a"]), segment("outro", "o")]

  it("fails invented speech in single quotation marks when it is introduced as speech", () => {
    const result = check(withText("A. Speaker said, 'we will absolutely win everything this year'."))
    expect(result.issues.find((entry) => entry.type === "quote-unverified")?.severity).toBe("error")
  })

  it("only warns about single-quoted titles and names: they cannot be told from speech", () => {
    const result = check(withText("The panel is called 'The State of Ocean-Climate Action in a World of Change' and it is on Tuesday."))
    expect(typesOf(result, "error")).toEqual([])
    expect(result.issues.find((entry) => entry.type === "quoted-phrase")?.severity).toBe("warning")
  })

  it("accepts a verified quote written in single quotation marks", () => {
    const result = check(withText("A. Speaker said, 'exact words about a'."))
    expect(typesOf(result, "error")).toEqual([])
    expect(result.quotesUsed).toBe(1)
  })

  it("warns when the hook mentions a story other than the opening one, and not otherwise", () => {
    const previews = check([segment("hook", "h", ["a", "b"]), segment("story", "s", ["a", "b"]), segment("outro", "o")])
    expect(previews.issues.find((entry) => entry.type === "hook-previews-stories")).toMatchObject({ severity: "warning", segmentIndex: 1 })
    const focused = check([segment("hook", "h", ["a"]), segment("story", "s", ["a", "b"]), segment("outro", "o")])
    expect(typesOf(focused)).not.toContain("hook-previews-stories")
    // A hook that lists no story is fine too.
    expect(typesOf(check([segment("hook", "h"), segment("story", "s", ["a", "b"]), segment("outro", "o")]))).not.toContain("hook-previews-stories")
  })

  it("warns, but does not fail, when a story's selected evidence goes over the editorial budget", () => {
    const heavy = plannedStory("a", { selectedFactIds: ["f1", "f2"], selectedContextIds: ["c1"] })
    const many = enrichedStory("a", {
      facts: Array.from({ length: 6 }, (_, index) => ({ claim: `Fact ${index}`, sourceIds: ["s1"] })),
      context: Array.from({ length: 3 }, (_, index) => ({ claim: `Context ${index}`, sourceIds: ["s1"] })),
    })
    const plan = planOf(["a", "b"], {
      stories: [
        { ...heavy, selectedFactIds: ["f1", "f2", "f3", "f4", "f5", "f6"], selectedContextIds: ["c1", "c2", "c3"] },
        plannedStory("b"),
      ],
      omitted: [{ storyId: "c", reason: "x" }],
    })
    const result = check(goodSegments(), { plan, stories: [many, enrichedStory("b"), enrichedStory("c")].map(indexStory) })
    const issue = result.issues.find((entry) => entry.type === "plan-evidence-heavy")
    expect(issue?.severity).toBe("warning")
    expect(issue?.message).toContain("6 facts")
    expect(issue?.message).toContain("3 context items")
    expect(typesOf(result, "error")).toEqual([])
    // The default plan (2 facts, 1 context item per story) is within budget.
    expect(typesOf(check(goodSegments()))).not.toContain("plan-evidence-heavy")
  })
})

describe("runChecks: format, language and evidence contract", () => {
  it("rejects text the voice cannot read: URLs, bracketed notes, markdown, emoji", () => {
    for (const text of ["Read more at https://example.com/x", "Then [pause] we continue", "This is **important**", "# Heading\nText", "So good 🎉"]) {
      const result = check([segment("hook", "h", ["a"]), segment("story", text, ["a", "b"]), segment("outro", "o")])
      expect(typesOf(result, "error"), text).toContain("plain-text")
    }
  })

  it("does not flag ordinary punctuation as markup", () => {
    const result = check([segment("hook", "h", ["a"]), segment("story", "It's 5 - 3, (really) fine: yes; no?", ["a", "b"]), segment("outro", "o")])
    expect(typesOf(result)).not.toContain("plain-text")
  })

  it("fails a script written in the wrong writing system for a non-Latin language", () => {
    const english = check(goodSegments(), { language: "ja" })
    expect(typesOf(english, "error")).toContain("language-mismatch")
    const japanese = check([segment("hook", "これは日本語の文章です", ["a"]), segment("story", "これは物語です。とても面白いです。", ["a", "b"]), segment("outro", "おわり")], { language: "ja" })
    expect(typesOf(japanese)).not.toContain("language-mismatch")
  })

  it("leaves Latin-script languages to the AI review", () => {
    expect(typesOf(check(goodSegments(), { language: "es" }))).not.toContain("language-mismatch")
  })

  it("warns when selected facts carry direct speech (old research)", () => {
    const quoted = enrichedStory("a", { facts: [{ claim: 'The CEO said "this is a step change" for the sector', sourceIds: ["s1"] }, { claim: "Fact two", sourceIds: ["s1"] }] })
    const result = check(goodSegments(), { stories: [quoted, enrichedStory("b"), enrichedStory("c")].map(indexStory) })
    const issue = result.issues.find((entry) => entry.type === "evidence-contract")
    expect(issue).toMatchObject({ severity: "warning", evidenceIds: ["a:f1"] })
  })
})
