import { describe, expect, it } from "vitest"
import { validateContent } from "./validate.js"

const HEADLINE = "Google confirms Gemini security incident"

const paragraph =
  "Google confirmed on Thursday that an attacker exploited a weakness in the Gemini assistant, and the company said it had already fixed the problem for all users worldwide."

const goodArticle = Array.from({ length: 6 }, () => paragraph).join("\n\n")

describe("validateContent", () => {
  it("accepts a full article", () => {
    expect(validateContent(goodArticle, HEADLINE)).toEqual({ usable: true, issues: [] })
  })

  it("flags very short content", () => {
    const result = validateContent("Gemini incident. Read more soon.", HEADLINE)
    expect(result.usable).toBe(false)
    expect(result.issues[0]).toContain("too short")
  })

  it("flags empty content", () => {
    expect(validateContent("   ", HEADLINE).usable).toBe(false)
  })

  it("flags paywall text on a short page", () => {
    const teaser = `${paragraph}\n\n${paragraph}\n\nSubscribe to continue reading this article.`
    const result = validateContent(teaser, HEADLINE)
    expect(result.usable).toBe(false)
    expect(result.issues).toContain("looks paywalled")
  })

  it("does not condemn a long article for a subscribe banner in its footer", () => {
    const long = `${Array.from({ length: 30 }, () => paragraph).join("\n\n")}\n\nSubscribe to continue reading our newsletter.`
    expect(validateContent(long, HEADLINE).issues).not.toContain("looks paywalled")
  })

  it("flags truncation markers", () => {
    for (const ending of ["and then the company said that…", "and then the company said that ...", "the story goes on [+2413 chars]", "Read more"]) {
      const result = validateContent(`${goodArticle}\n\n${ending}`, HEADLINE)
      expect(result.issues, ending).toContain("looks truncated")
    }
  })

  it("does not treat a trailing ellipsis on a full page as truncation, but still flags an explicit cut-off marker", () => {
    const body = Array.from({ length: 30 }, () => paragraph).join("\n\n")
    expect(validateContent(`${body}\n\nPlease login or signup to comment\nPlease wait...`, HEADLINE)).toEqual({ usable: true, issues: [] })
    expect(validateContent(`${body}\n\nthe story goes on [+2413 chars]`, HEADLINE).issues).toContain("looks truncated")
  })

  it("accepts an article inside a page with a large navigation menu", () => {
    const menu = Array.from({ length: 250 }, (_, index) => `Menu item ${index}`).join("\n")
    const page = `${menu}\n${Array.from({ length: 6 }, () => paragraph).join("\n")}`
    expect(validateContent(page, HEADLINE)).toEqual({ usable: true, issues: [] })
  })

  it("does not mistake a related-stories widget at the end of a full page for truncation", () => {
    const body = Array.from({ length: 30 }, () => paragraph).join("\n\n")
    const fullPage = `${body}\n\nRelated: another story headline\nRead more`
    expect(validateContent(fullPage, HEADLINE)).toEqual({ usable: true, issues: [] })
  })

  it("flags pages that are mostly navigation", () => {
    const nav = Array.from({ length: 80 }, (_, index) => `Menu item ${index}`).join("\n")
    const result = validateContent(`${nav}\n${paragraph}`, HEADLINE)
    expect(result.usable).toBe(false)
    expect(result.issues).toContain("mostly navigation or page chrome")
  })

  it("flags a page that is not about the story", () => {
    const offTopic = Array.from({ length: 12 }, () => "Preheat the oven and whisk the eggs together with sugar until the mixture is pale and fluffy.").join("\n\n")
    const result = validateContent(offTopic, HEADLINE)
    expect(result.usable).toBe(false)
    expect(result.issues).toContain("does not appear to be about this story")
  })
})
