import { describe, expect, it } from "vitest"
import type { ResearchError } from "./errors.js"
import type { PriorDisagreement } from "./prompt.js"
import { normalizeForQuoteMatch, parseSynthesis } from "./synthesizer.js"

const sourceTexts = new Map([
  ["s1", 'The company said: "We fixed the issue within hours." It added that no user data was accessed.'],
  ["s2", "Independent reporting says roughly 40 accounts were affected, according to two people familiar."],
  ["s3", "A later statement confirmed that 12 accounts were affected."],
  ["s4", "Trump said his administration would not “hinder or stifle” the “incredible” AI industry. He wrote, “We will cherish it, help it, and watch over it, as it grows!” The White House did not respond."],
])

const claim = (text: string, ...sourceIds: string[]) => ({ claim: text, sourceIds })

const base = {
  assessment: "sufficient",
  assessmentReason: "",
  summary: "  The company fixed an issue.  ",
  facts: [claim("The company says it fixed the issue within hours.", "s1")],
  context: [],
  analysis: [],
  quotes: [],
  disagreements: [],
  resolutions: [],
  resolutionQuery: null,
}

const answer = (overrides: Record<string, unknown> = {}) => JSON.stringify({ ...base, ...overrides })

function parse(raw: string, options: { priors?: PriorDisagreement[]; newSourceIds?: string[] } = {}) {
  return parseSynthesis(raw, {
    sourceTexts,
    priorDisagreements: options.priors ?? [],
    newSourceIds: new Set(options.newSourceIds ?? []),
  })
}

function invalid(raw: string, options?: Parameters<typeof parse>[1]): ResearchError {
  try {
    parse(raw, options)
  } catch (error) {
    return error as ResearchError
  }
  throw new Error("expected parseSynthesis to throw")
}

const prior: PriorDisagreement = {
  id: "d1",
  disagreement: {
    topic: "Accounts affected",
    positions: [claim("About 40 accounts", "s2"), claim("12 accounts", "s3")],
  },
}

describe("parseSynthesis", () => {
  it("returns a trimmed evidence file", () => {
    const result = parse(answer())
    expect(result.summary).toBe("The company fixed an issue.")
    expect(result.facts).toEqual([claim("The company says it fixed the issue within hours.", "s1")])
    expect(result.assessment).toBe("sufficient")
    expect(result.notes).toEqual([])
  })

  it("keeps facts, context and analysis separate", () => {
    const result = parse(
      answer({
        context: [claim("The company runs a chatbot.", "s1")],
        analysis: [claim("This suggests the fix was quick.", "s1", "s2")],
      }),
    )
    expect(result.facts).toHaveLength(1)
    expect(result.context).toEqual([claim("The company runs a chatbot.", "s1")])
    expect(result.analysis).toEqual([claim("This suggests the fix was quick.", "s1", "s2")])
  })

  it("rejects malformed model output", () => {
    expect(invalid("not json").message).toContain("not valid JSON")
    expect(invalid(JSON.stringify({ facts: [] })).message).toContain("expected shape")
    expect(invalid(answer({ assessment: "maybe" })).message).toContain("expected shape")
  })

  it("rejects a claim citing a source that was not provided", () => {
    for (const field of ["facts", "context", "analysis"] as const) {
      const error = invalid(answer({ [field]: [claim("Something.", "s99")] }))
      expect(error.kind).toBe("invalid-output")
      expect(error.message).toContain("not provided")
    }
    expect(invalid(answer({ quotes: [{ text: "We fixed the issue", speaker: "Co", sourceId: "s99" }] })).message).toContain("not provided")
    expect(invalid(answer({ disagreements: [{ priorId: null, topic: "t", positions: [claim("a", "s1"), claim("b", "s99")] }] })).message).toContain("not provided")
  })

  it("drops a claim that cites no source instead of keeping an unsupported claim", () => {
    const result = parse(answer({ facts: [claim("Supported.", "s1"), claim("Made up from memory.")] }))
    expect(result.facts).toEqual([claim("Supported.", "s1")])
    expect(result.notes[0]).toContain("cited no source")
  })

  describe("facts are not quotable: direct speech belongs only in quotes", () => {
    const speech = 'The company said "we fixed the issue within hours" on its blog.'

    it("drops a fact, context item or analysis item that carries direct speech in quotation marks", () => {
      const result = parse(
        answer({
          facts: [claim("Supported.", "s1"), claim(speech, "s1")],
          context: [claim(speech, "s1")],
          analysis: [claim("This reads like a “quick and total fix”, one might say.", "s1")],
        }),
      )
      expect(result.facts).toEqual([claim("Supported.", "s1")])
      expect(result.context).toEqual([])
      expect(result.analysis).toEqual([])
      expect(result.notes).toHaveLength(3)
      expect(result.notes[0]).toContain("direct speech")
    })

    it("also drops direct speech in single quotation marks, and keeps apostrophes", () => {
      const result = parse(
        answer({
          facts: [
            claim("Reuters reports the spokesperson said, 'All known issues on our end were remedied and resolved weeks ago.'", "s1"),
            claim("The company's spokesperson said it isn't aware of any further issues.", "s1"),
          ],
        }),
      )
      expect(result.facts).toEqual([claim("The company's spokesperson said it isn't aware of any further issues.", "s1")])
      expect(result.notes).toHaveLength(1)
    })

    describe("speech a fact carries after a bare speech verb (`... and wrote '...'`)", () => {
      const fact = "Politico reported that Trump said his administration would not 'hinder or stifle' the 'incredible' AI industry and wrote 'We will cherish it, help it, and watch over it, as it grows!'"
      const trump = { text: "incredible", speaker: "Trump", sourceId: "s4" }
      const cherish = { text: "We will cherish it, help it, and watch over it, as it grows!", speaker: "Trump", sourceId: "s4" }

      it("drops the fact and keeps the verbatim words as a quote by the speaker the model already named", () => {
        const result = parse(answer({ facts: [claim(fact, "s4")], quotes: [trump] }))
        expect(result.facts).toEqual([])
        expect(result.quotes).toEqual([trump, cherish])
        expect(result.notes.join(" ")).toContain("Kept the direct speech from a dropped fact as a quote by Trump")
      })

      it("does not add the quote twice when the model already listed it", () => {
        const result = parse(answer({ facts: [claim(fact, "s4")], quotes: [cherish] }))
        expect(result.quotes).toEqual([cherish])
      })

      it("only drops the fact when the speaker cannot be established, and never guesses one", () => {
        const result = parse(answer({ facts: [claim(fact, "s4")] }))
        expect(result.facts).toEqual([])
        expect(result.quotes).toEqual([])
        expect(result.notes).toHaveLength(1)
        expect(result.notes[0]).toContain("Dropped a fact containing direct speech")
      })

      it("does not turn words that are not verbatim in the cited source into a quote", () => {
        const invented = "Politico reported that Trump said he would help and wrote 'We will cherish it and help it grow forever!'"
        const result = parse(answer({ facts: [claim(invented, "s4")], quotes: [trump] }))
        expect(result.facts).toEqual([])
        expect(result.quotes).toEqual([trump])
      })

      it("does not add a quote beyond the quote limit", () => {
        const many = Array.from({ length: 5 }, () => ({ text: "incredible", speaker: "Trump", sourceId: "s4" }))
        const result = parse(answer({ facts: [claim(fact, "s4")], quotes: many }))
        expect(result.quotes).toHaveLength(5)
        expect(result.quotes).not.toContainEqual(cherish)
      })

      it("does not touch a fact whose quotation marks are only a fragment or name", () => {
        const fragment = "Trump said his administration would not 'hinder or stifle' the 'incredible' AI industry."
        expect(parse(answer({ facts: [claim(fragment, "s4")] })).facts).toEqual([claim(fragment, "s4")])
      })
    })

    it("keeps the same information as reported speech, and lets short names in quotation marks through", () => {
      const result = parse(
        answer({
          facts: [claim("The company said it fixed the issue within hours.", "s1"), claim('The product, called "Atlas 2", was affected.', "s1")],
        }),
      )
      expect(result.facts).toHaveLength(2)
      expect(result.notes).toEqual([])
    })

    it("does not touch verified quotes: they are where direct speech lives", () => {
      const result = parse(answer({ quotes: [{ text: "We fixed the issue within hours.", speaker: "The company", sourceId: "s1" }] }))
      expect(result.quotes).toHaveLength(1)
    })

    it("leaves disagreement positions alone, so a real disagreement is never lost to this rule", () => {
      const result = parse(
        answer({ disagreements: [{ priorId: null, topic: "Accounts", positions: [claim('One report said "about 40 accounts were hit".', "s2"), claim("12 accounts", "s3")] }] }),
      )
      expect(result.disagreements).toHaveLength(1)
    })
  })

  it("de-duplicates repeated source ids", () => {
    expect(parse(answer({ facts: [claim("X.", "s1", "s1")] })).facts[0].sourceIds).toEqual(["s1"])
  })

  describe("quotes", () => {
    const quote = (text: string, sourceId = "s1") => ({ text, speaker: "The company", sourceId })

    it("keeps a quote that appears verbatim, ignoring typography and case", () => {
      const result = parse(answer({ quotes: [quote("“we fixed the  issue within hours.”")] }))
      expect(result.quotes).toEqual([{ text: "we fixed the  issue within hours.", speaker: "The company", sourceId: "s1" }])
    })

    it("drops a paraphrased or reconstructed quote", () => {
      const result = parse(answer({ quotes: [quote("We resolved the problem quickly")] }))
      expect(result.quotes).toEqual([])
      expect(result.notes[0]).toContain("not verbatim")
    })

    it("drops a real quote attributed to the wrong source", () => {
      expect(parse(answer({ quotes: [quote("We fixed the issue within hours", "s2")] })).quotes).toEqual([])
    })

    it("drops a quote stitched together with an ellipsis", () => {
      expect(parse(answer({ quotes: [quote("We fixed the issue ... no user data was accessed")] })).quotes).toEqual([])
    })

    it("drops a quote whose speaker is just the outlet that published the source", () => {
      const result = parseSynthesis(answer({ quotes: [{ text: "We fixed the issue within hours", speaker: "Reuters", sourceId: "s1" }] }), {
        sourceTexts,
        sourceDomains: new Map([["s1", "reuters.com"]]),
        priorDisagreements: [],
        newSourceIds: new Set(),
      })
      expect(result.quotes).toEqual([])
      expect(result.notes[0]).toContain("outlet itself")
    })

    it("keeps a quote from a named person or organization that is not the outlet", () => {
      const result = parseSynthesis(answer({ quotes: [{ text: "We fixed the issue within hours", speaker: "Google spokesperson", sourceId: "s1" }] }), {
        sourceTexts,
        sourceDomains: new Map([["s1", "reuters.com"]]),
        priorDisagreements: [],
        newSourceIds: new Set(),
      })
      expect(result.quotes).toHaveLength(1)
    })

    it("drops quotes with no speaker", () => {
      const noSpeaker = { text: "We fixed the issue", speaker: " ", sourceId: "s1" }
      expect(parse(answer({ quotes: [noSpeaker] })).quotes).toEqual([])
    })

    it("drops quotes that are too long, even when verbatim", () => {
      const longText = "word ".repeat(100).trim()
      const texts = new Map([["s1", longText]])
      const result = parseSynthesis(answer({ quotes: [quote(longText)] }), {
        sourceTexts: texts,
        priorDisagreements: [],
        newSourceIds: new Set(),
      })
      expect(result.quotes).toEqual([])
      expect(result.notes[0]).toContain("longer than")
    })

    it("normalizes typography for comparison", () => {
      expect(normalizeForQuoteMatch("It’s “fine” — really")).toBe(normalizeForQuoteMatch("It's \"fine\" - really"))
    })
  })

  describe("disagreements", () => {
    it("keeps a new disagreement with its positions", () => {
      const result = parse(answer({ disagreements: [{ priorId: null, topic: "Accounts affected", positions: prior.disagreement.positions }] }))
      expect(result.disagreements).toEqual([prior.disagreement])
    })

    it("drops a disagreement with fewer than two sourced positions", () => {
      const result = parse(answer({ disagreements: [{ priorId: null, topic: "Vague", positions: [claim("Only one side", "s1")] }] }))
      expect(result.disagreements).toEqual([])
      expect(result.notes[0]).toContain("fewer than two")
    })

    it("accepts a resolution that rests on a newly added source", () => {
      const result = parse(
        answer({ resolutions: [{ disagreementId: "d1", resolution: "12 accounts, per the later statement", sourceIds: ["s3"] }] }),
        { priors: [prior], newSourceIds: ["s3"] },
      )
      expect(result.disagreements).toEqual([])
      expect(result.notes[0]).toContain("Resolved")
    })

    it("rejects a resolution that rests only on old sources, and keeps the disagreement", () => {
      const result = parse(
        answer({ resolutions: [{ disagreementId: "d1", resolution: "12 accounts, it sounds more plausible", sourceIds: ["s2"] }] }),
        { priors: [prior], newSourceIds: ["s3"] },
      )
      expect(result.disagreements).toEqual([prior.disagreement])
      expect(result.notes.join(" ")).toContain("did not rest on any newly added source")
    })

    it("rejects a resolution when the disagreement is also still listed", () => {
      const result = parse(
        answer({
          disagreements: [{ priorId: "d1", topic: "Accounts affected", positions: prior.disagreement.positions }],
          resolutions: [{ disagreementId: "d1", resolution: "12", sourceIds: ["s3"] }],
        }),
        { priors: [prior], newSourceIds: ["s3"] },
      )
      expect(result.disagreements).toEqual([prior.disagreement])
      expect(result.notes.join(" ")).toContain("also kept as unresolved")
    })

    it("never lets a prior disagreement vanish silently", () => {
      const result = parse(answer(), { priors: [prior], newSourceIds: ["s3"] })
      expect(result.disagreements).toEqual([prior.disagreement])
      expect(result.notes[0]).toContain("Kept unresolved")
    })

    it("rejects references to disagreements that do not exist", () => {
      expect(invalid(answer({ resolutions: [{ disagreementId: "d7", resolution: "x", sourceIds: ["s3"] }] }), { priors: [prior] }).message).toContain("does not exist")
      expect(invalid(answer({ disagreements: [{ priorId: "d7", topic: "t", positions: [claim("a", "s1"), claim("b", "s2")] }] }), { priors: [prior] }).message).toContain("does not exist")
    })
  })

  it("passes through an insufficient assessment and a resolution query", () => {
    const result = parse(
      answer({ assessment: "insufficient", assessmentReason: " Only one thin report ", resolutionQuery: { query: "follow up", topic: "news" } }),
    )
    expect(result.assessment).toBe("insufficient")
    expect(result.assessmentReason).toBe("Only one thin report")
    expect(result.resolutionQuery).toEqual({ query: "follow up", topic: "news" })
  })
})
