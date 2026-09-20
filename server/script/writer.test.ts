import { describe, expect, it, vi } from "vitest"
import { ScriptError } from "./errors.js"
import { enrichedStory, plannedStory, planOf, segment } from "./fixtures.js"
import { TONE_IDS } from "./options.js"
import { buildScriptSystemPrompt } from "./prompt.js"
import { TONE_GUIDANCE } from "./tones.js"
import { countWords, parseModelOutput, reconstructScript, writeScript } from "./writer.js"
import type { ScriptModel } from "./writer.js"

const stories = [
  { rank: 1, story: enrichedStory("a") },
  { rank: 2, story: enrichedStory("b") },
  { rank: 3, story: enrichedStory("c") },
]

interface Claim {
  id: string
  claim: string
  sourceIds: string[]
}

/** What the model is shown, parsed back out of the user message (everything before the closing notes). */
interface UserPayload {
  brief: { language: string; tone: string; durationMinutes: number; lengthTarget: string; listenerInterests: string[] }
  plan: { angle: string; workingTitle: string; hookTargetWords: number; outroTargetWords: number; connections: { from: string; to: string; basis: string; idea: string }[] }
  stories: {
    articleId: string
    order: number
    role: string
    targetWords: number
    planNote: string
    headline: string
    summary: string
    facts: Claim[]
    context: Claim[]
    analysis: Claim[]
    quotes: { id: string; text: string; speaker: string; sourceId: string }[]
    disagreements: { id: string; topic: string; positions: Claim[] }[]
    sources: { id: string; domain: string; type: string }[]
  }[]
}

const payloadOf = (user: string) => JSON.parse(user.slice(0, user.lastIndexOf("\n\nNotes:"))) as UserPayload

const plan = planOf(["b", "a"], { omitted: [{ storyId: "c", reason: "thin" }] })

const goodAnswer = {
  title: "When AI Starts Fighting Back",
  segments: [
    segment("hook", "What if the tool fought back?", ["b"]),
    segment("story", "First, the launch. It matters.", ["b", "a"]),
    segment("outro", "That's the story for today."),
  ],
}

const modelReturning = (answer: unknown): ScriptModel => vi.fn(async () => (typeof answer === "string" ? answer : JSON.stringify(answer)))

function write(model: ScriptModel, overrides: Partial<Parameters<typeof writeScript>[0]> = {}) {
  return writeScript(
    { interests: ["AI", "Formula 1"], language: "en", durationMinutes: 10, tone: "conversational", stories, plan, ...overrides },
    { model, log: () => {}, clock: () => 0 },
  )
}

describe("writeScript", () => {
  it("returns the title, structured segments, the reconstructed script, the word count and timing", async () => {
    const result = await write(modelReturning(goodAnswer))

    expect(result.title).toBe("When AI Starts Fighting Back")
    expect(result.segments).toHaveLength(3)
    expect(result.segments[1]).toEqual({ type: "story", text: "First, the launch. It matters.", articleIds: ["b", "a"] })
    expect(result.script).toBe("What if the tool fought back?\n\nFirst, the launch. It matters.\n\nThat's the story for today.")
    expect(result.wordCount).toBe(countWords(result.script, "en"))
    expect(result.durationMs).toBe(0)
  })

  it("keeps article ids on every segment, including repeats for callbacks", async () => {
    const result = await write(
      modelReturning({ ...goodAnswer, segments: [...goodAnswer.segments.slice(0, 2), segment("transition", "Back to it.", ["b"]), goodAnswer.segments[2]] }),
    )
    expect(result.segments.map((s) => s.articleIds)).toEqual([["b"], ["b", "a"], ["b"], []])
  })

  it("no longer accepts or needs an omitted list: omission belongs to the plan", async () => {
    const result = await write(modelReturning({ ...goodAnswer, omitted: [{ articleId: "x", reason: "ignored" }] }))
    expect(result).not.toHaveProperty("omitted")
  })

  it("leaves rule-breaking scripts to the validator: unknown ids, no hook, over-long text are returned, not thrown", async () => {
    const result = await write(modelReturning({ title: "T", segments: [segment("story", "Only a story.", ["made-up"])] }))
    expect(result.segments).toHaveLength(1)
  })

  it("rejects an answer that is not JSON", async () => {
    await expect(write(modelReturning("Here is your script!"))).rejects.toMatchObject({ kind: "invalid-output", message: expect.stringContaining("not valid JSON") })
  })

  it("rejects an answer with the wrong shape", () => {
    for (const answer of [
      {},
      { title: "T", segments: "x" },
      { title: "", segments: goodAnswer.segments },
      { title: "T", segments: [] },
      { title: "T", segments: [segment("hook", "  ", []), segment("outro", "x")] },
      { title: "T", segments: [{ type: "chorus", text: "x", articleIds: ["a"] }] },
      { title: "T", segments: [{ type: "hook", text: "x" }] },
    ]) {
      expect(() => parseModelOutput(JSON.stringify(answer))).toThrow(ScriptError)
    }
  })

  it("lets model failures propagate without swallowing them", async () => {
    const model: ScriptModel = async () => {
      throw new ScriptError("timeout", "timed out")
    }
    await expect(write(model)).rejects.toMatchObject({ kind: "timeout" })
  })

  describe("what the model is sent", () => {
    async function promptFor(overrides: Partial<Parameters<typeof writeScript>[0]> = {}) {
      const model = vi.fn<ScriptModel>(async () => JSON.stringify(goodAnswer))
      await write(model, overrides)
      return model.mock.calls[0][0]
    }

    it("sends the language, tone, length limits, the plan and the planned stories in the planned order", async () => {
      const prompt = await promptFor({ language: "es", tone: "journalistic", durationMinutes: 20, plan: planOf(["b", "a"], { angle: "Two launches" }) })
      expect(prompt.targetWords).toBe(3000)
      expect(prompt.system).toContain("Spanish")
      expect(prompt.system).toContain(TONE_GUIDANCE.journalistic.guidance)

      const payload = payloadOf(prompt.user)
      expect(payload.brief).toMatchObject({ durationMinutes: 20, language: "Spanish", listenerInterests: ["AI", "Formula 1"] })
      expect(payload.plan).toMatchObject({ angle: "Two launches", hookTargetWords: 60, outroTargetWords: 40 })
      // The plan's order, not the request's; story c was omitted by the plan and is not sent at all.
      expect(payload.stories.map((s) => [s.articleId, s.order, s.role, s.targetWords])).toEqual([
        ["b", 1, "main", 400],
        ["a", 2, "main", 400],
      ])
      expect(prompt.user).not.toContain("Headline c")
    })

    it("sends ONLY the selected evidence, with ids, plus story-level orientation", async () => {
      const selective = planOf(["a"], {
        omitted: [{ storyId: "b", reason: "x" }, { storyId: "c", reason: "x" }],
        stories: [plannedStory("a", { selectedFactIds: ["f2"], selectedContextIds: [], selectedQuoteIds: [], selectedAnalysisIds: ["a1"] })],
      })
      const [first] = payloadOf((await promptFor({ plan: selective })).user).stories

      expect(first.facts).toEqual([{ id: "f2", claim: "Fact two about a", sourceIds: ["s1", "s2"] }])
      expect(first.context).toEqual([])
      expect(first.quotes).toEqual([])
      expect(first.analysis).toEqual([{ id: "a1", claim: "Interpretation of a", sourceIds: ["s1"] }])
      // Orientation, so the writer can write naturally; never a source of claims.
      expect(first).toMatchObject({ headline: "Headline a", summary: "Summary of a", planNote: "Why a" })
      // Unselected evidence is not in the prompt at all.
      const { user } = await promptFor({ plan: selective })
      expect(user).not.toContain("Fact one about a")
      expect(user).not.toContain("Background on a")
      expect(user).not.toContain("Exact words about a")
    })

    it("sends selected quotes and disagreements with ids, and only the sources they cite", async () => {
      const disagreements = [{ topic: "when it launched", positions: [{ claim: "In May", sourceIds: ["s1"] }, { claim: "In June", sourceIds: ["s2"] }] }]
      const rich = [{ rank: 1, story: enrichedStory("a", { disagreements }) }]
      const withQuote = planOf(["a"], { stories: [plannedStory("a", { selectedFactIds: ["f1"], selectedContextIds: [], selectedQuoteIds: ["q1"], selectedDisagreementIds: ["d1"] })] })
      const [first] = payloadOf((await promptFor({ stories: rich, plan: withQuote })).user).stories
      expect(first.quotes).toEqual([{ id: "q1", text: "Exact words about a", speaker: "A. Speaker", sourceId: "s2" }])
      expect(first.disagreements).toEqual([{ id: "d1", ...disagreements[0] }])
      expect(first.sources.map((s) => s.id)).toEqual(["s1", "s2"])

      const onlyFact = planOf(["a"], { stories: [plannedStory("a", { selectedFactIds: ["f1"], selectedContextIds: [], selectedQuoteIds: [] })] })
      const [lean] = payloadOf((await promptFor({ plan: onlyFact })).user).stories
      // f1 cites only s1, so s2 (the primary source) is not listed.
      expect(lean.sources).toEqual([{ id: "s1", domain: "news.example.com", type: "reporting" }])
    })

    it("tells the writer that an outro may not relate stories the plan does not connect", async () => {
      const { system } = await promptFor()
      expect(system).toContain("If the Episode Plan contains no connection, the outro must not compare, unify, contrast, or relate the stories to each other.")
      for (const phrase of ["the same basic rule", "the common thread", "what connects these stories", "across these stories", "the bigger picture"]) {
        expect(system).toContain(`"${phrase}"`)
      }
    })

    it("sends the plan's connections with their basis, as direction", async () => {
      const connected = planOf(["b", "a"], { connections: [{ fromStoryId: "b", toStoryId: "a", basisType: "shared-actor", basis: "Nvidia", idea: "Same supplier", fromEvidenceIds: ["f1"], toEvidenceIds: ["f1"] }] })
      const payload = payloadOf((await promptFor({ plan: connected })).user)
      expect(payload.plan.connections).toEqual([{ from: "b", to: "a", basis: "Nvidia", idea: "Same supplier" }])
    })

    it("sends nothing that is not evidence or plan: no links, trace, article fields or ranker rationale", async () => {
      const trace = { queries: [], candidates: [], extractions: [], synthesisRuns: 1, notes: ["internal research note"] }
      const { user } = await promptFor({ stories: [{ rank: 1, story: enrichedStory("a", { trace }) }], plan: planOf(["a"]) })

      expect(user).not.toContain("https://")
      expect(user).not.toContain("Reporting on a")
      expect(user).not.toContain("internal research note")
      for (const field of ["url", "trace", "status", "description", "publishedAt", "editorialNote", "material"]) {
        expect(user).not.toContain(`"${field}"`)
      }
    })

    it("frames the length as a target with a ceiling and no floor", async () => {
      const { lengthTarget } = payloadOf((await promptFor({ durationMinutes: 10 })).user).brief
      expect(lengthTarget).toContain("about 1500 words")
      expect(lengthTarget).toContain("Never more than 1725 words")
      expect(lengthTarget).not.toMatch(/roughly|at least|minimum/i)
    })

    it("tells the model how to read each part", async () => {
      const { user } = await promptFor()
      expect(user).toContain('Only "facts", "context" and "quotes" support factual claims')
      expect(user).toContain('"analysis" is interpretation')
      expect(user).toContain('"headline" is a label and "summary" is orientation')
      expect(user).toContain("planning direction, not evidence")
    })
  })

  describe("the system prompt", () => {
    const system = buildScriptSystemPrompt("conversational", "en")

    it("has the writer execute the plan instead of making editorial decisions", () => {
      expect(system).toContain("EXECUTE THE EPISODE PLAN")
      expect(system).toContain("You do NOT choose stories, reorder them, add stories")
      expect(system).toContain("Do not override the plan without a very strong reason")
      expect(system).toContain("Do not cover any story that is not in the plan")
      expect(system).not.toContain("THINK LIKE AN EDITOR")
      expect(system).not.toContain("STORY SELECTION")
    })

    it("makes the selected evidence authoritative and forbids claims from anything else", () => {
      expect(system).toContain("The selected evidence is authoritative for factual content")
      expect(system).toContain("never add a factual claim that the selected evidence does not support")
      expect(system).toContain("Do NOT use your own knowledge of the world to fill a gap")
      expect(system).toContain("Never solve a lack of material by making something up")
      expect(system).toContain("It is NOT evidence")
      expect(system).toContain('Never mention "the research", "the plan"')
    })

    it("restricts quotation marks to supplied quotes and keeps facts unquotable", () => {
      expect(system).toContain("use quotation marks ONLY for direct speech, and that text MUST come from a supplied quote")
      expect(system).toContain("not text from a fact")
      expect(system).toContain("A fact is paraphrase; it is NOT quotable text")
      expect(system).toContain("They are the ONLY direct quotes you may use")
      expect(system).toContain("Never place a translated quote inside quotation marks")
    })

    it("keeps analysis apart from fact and has disagreements reported fairly", () => {
      expect(system).toContain("It is NOT established fact")
      expect(system).toContain("Do not turn analysis into reporting")
      expect(system).toContain("Never pick a side and never blend the versions")
    })

    it("allows relative time only when a fact supports it, and framed analogies but not invented examples", () => {
      expect(system).toContain("unless a fact states or plainly implies that timing")
      expect(system).toContain('"right now"')
      expect(system).toContain("explanatory analogy or metaphor is welcome")
      expect(system).toContain("Do not invent examples, scenarios or hypotheticals with factual content")
    })

    it("keeps the podcast craft rules: no roadmap hook, no invisible-personalization leaks, no recap outro", () => {
      expect(system).toContain("No roadmap")
      expect(system).toContain('"if you follow Formula 1..."')
      expect(system).toContain("Do not recap the stories")
      expect(system).toContain("Never repeat \"the article says\"")
    })

    it("keeps the hook on the opening story: a concrete moment, question or fact, never a preview of the episode", () => {
      expect(system).toContain("the hook belongs to the FIRST planned story only")
      expect(system).toContain("a concrete moment from it, a meaningful question about it, a surprising fact it supports, or immediate narrative tension")
      expect(system).toContain("It must NOT preview the episode, mention or hint at any later story")
      expect(system).toContain('say "today we\'ll look at..."')
    })

    it("draws only the planned connections, never a shared theme or thesis, and needs no throughline", () => {
      expect(system).toContain("The plan lists the ONLY connections between stories")
      expect(system).toContain("Do NOT create any other link between stories")
      expect(system).toContain("no thesis that covers the episode")
      expect(system).toContain("An episode that is simply a strong sequence of stories is a good episode")
      expect(system).toContain("do not introduce a thesis or a \"what it all adds up to\"")
      expect(system).toContain("Do not force a clever title")
    })

    it("uses at most one supplied quote per story, and only where it adds something", () => {
      expect(system).toContain("at most one quote per story, and often none")
    })

    it("sizes segments to the plan, treats length as a limit and never pads", () => {
      expect(system).toContain("roughly its \"targetWords\"")
      expect(system).toContain("Never go over the word limit in the brief")
      expect(system).toContain("Never pad")
    })

    it("asks for exact numbers when translating", () => {
      expect(buildScriptSystemPrompt("conversational", "es")).toContain("Translate numbers exactly")
    })
  })

  it("gives each tone its own direction in the system prompt", () => {
    const prompts = TONE_IDS.map((tone) => buildScriptSystemPrompt(tone, "en"))
    expect(new Set(prompts).size).toBe(TONE_IDS.length)
    for (const [index, tone] of TONE_IDS.entries()) {
      expect(prompts[index]).toContain(TONE_GUIDANCE[tone].guidance)
      for (const other of TONE_IDS.filter((id) => id !== tone)) {
        expect(prompts[index]).not.toContain(TONE_GUIDANCE[other].guidance)
      }
    }
  })
})

describe("reconstructScript", () => {
  it("joins the segments in order into one continuous script", () => {
    expect(reconstructScript([{ text: " One. " }, { text: "Two." }, { text: "Three." }])).toBe("One.\n\nTwo.\n\nThree.")
  })

  it("is empty for no segments", () => {
    expect(reconstructScript([])).toBe("")
  })
})
