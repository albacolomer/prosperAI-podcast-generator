import { describe, expect, it } from "vitest"
import { countWords, hasDirectSpeech, normalizeForQuoteMatch, quotedSpans } from "./text.js"

describe("quotedSpans", () => {
  it("finds passages in straight, curly, guillemet and German quotation marks", () => {
    expect(quotedSpans('He said "we fixed it" quickly')).toEqual(["we fixed it"])
    expect(quotedSpans("She said “it is done” and «c'est fini» and „es ist getan“.").sort()).toEqual(["c'est fini", "es ist getan", "it is done"])
  })

  it("collects every span, whatever the mark", () => {
    const spans = quotedSpans('One "alpha beta" then “gamma delta” then «epsilon zeta».')
    expect(spans.sort()).toEqual(["alpha beta", "epsilon zeta", "gamma delta"])
  })

  it("finds British-style single-quoted speech, straight or curly, including apostrophes inside it", () => {
    expect(quotedSpans("Lewis warned bills 'really isn’t looking good' this winter")).toEqual(["really isn’t looking good"])
    expect(quotedSpans("Reuters reports the spokesperson said, 'All known issues on our end were remedied and resolved weeks ago.'")).toEqual([
      "All known issues on our end were remedied and resolved weeks ago.",
    ])
    expect(quotedSpans("It called the plan ‘a step change for the sector’.")).toEqual(["a step change for the sector"])
  })

  it("never mistakes apostrophes for quotation marks", () => {
    expect(quotedSpans("It's the company's plan, and the players' cars aren't Bob's or the drivers' choice. Rock 'n' roll, the '90s and '80s.")).toEqual(["n"])
    expect(quotedSpans("No quoted speech here, just one's own words.")).toEqual([])
  })

  it("returns nothing for text without quotation marks", () => {
    expect(quotedSpans("No quoted speech here.")).toEqual([])
  })
})

describe("hasDirectSpeech", () => {
  it("flags a quoted passage of three or more words", () => {
    expect(hasDirectSpeech('The CEO said "this is a step change" for the sector.')).toBe(true)
  })

  it("flags single-quoted speech, which reporting often uses instead of double quotes", () => {
    expect(hasDirectSpeech("The spokesperson said, 'All known issues on our end were remedied.'")).toBe(true)
  })

  it("recognises single-quoted speech introduced by a speech verb, however the sentence is built", () => {
    for (const claim of [
      "DW reports Heather Adkins, Google's vice president of security engineering, told AFP: 'In a standard evaluation, the model found public information online.'",
      "Oppenheimer analysts said, as quoted by the Globe and Mail, 'We see it as the only vertically integrated AI company'.",
      "Wolff wrote: ‘We will fix this before the next race’.",
      "Politico reported that Trump said his administration would not 'hinder or stifle' the 'incredible' AI industry and wrote 'We will cherish it, help it, and watch over it, as it grows!'",
      "Wolff said that ‘we will fix this before the next race’.",
    ]) {
      expect(hasDirectSpeech(claim), claim).toBe(true)
    }
  })

  it("keeps single-quoted titles, report names, event names and fragments: it cannot tell they are speech", () => {
    for (const claim of [
      "Braverman will speak on September 22 in Ocean Visions' 'The State of Ocean-Climate Action in a World of Accelerating Change'.",
      "The panel is called 'AI + Sustainability: Data Powering Climate Solutions.' and runs on Tuesday.",
      "Morgan Stanley analysts forecast SpaceX could be a 'generational compounder that converts energy into intelligence'.",
      "Wolff said Antonelli 'is causing us grey hair' and moved on.",
      "The report, 'Global Energy Outlook 2026 and beyond', was published last week.",
    ]) {
      expect(hasDirectSpeech(claim), claim).toBe(false)
    }
  })

  it("still treats a double-quoted passage of three or more words as speech", () => {
    expect(hasDirectSpeech('The panel is called "The State of Ocean-Climate Action" and runs on Tuesday.')).toBe(true)
  })

  it("lets short names and scare quotes through", () => {
    expect(hasDirectSpeech('The model, called "Gemini 3", launched.')).toBe(false)
    expect(hasDirectSpeech("The company reportedly said it would cut costs.")).toBe(false)
  })
})

describe("normalizeForQuoteMatch and countWords", () => {
  it("ignores typography and case", () => {
    expect(normalizeForQuoteMatch("“We  fixed—it”")).toBe('"we fixed-it"')
  })

  it("counts words in languages written without spaces", () => {
    expect(countWords("これは日本語の文章です", "ja")).toBeGreaterThan(2)
    expect(countWords("one two three", "en")).toBe(3)
  })
})
