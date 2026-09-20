import { describe, expect, it } from "vitest"
import { CandidatePool, domainOf } from "./candidates.js"
import type { RawCandidate } from "./candidates.js"

const HEADLINE = "California lawmakers pass AI kill switch bill"

const raw = (overrides: Partial<RawCandidate> = {}): RawCandidate => ({
  url: "https://news.example.com/california-ai-kill-switch",
  title: "California passes AI kill switch bill",
  snippet: "Lawmakers in California approved a bill requiring an AI kill switch for large models.",
  score: 0.9,
  origin: "search",
  ...overrides,
})

function reasonsFor(candidates: RawCandidate[], headline = HEADLINE) {
  const pool = new CandidatePool(headline)
  pool.add(candidates)
  return pool.trace().map((entry) => (entry.outcome === "filtered" ? entry.reason : "kept"))
}

describe("CandidatePool filtering", () => {
  it("keeps a good result", () => {
    expect(reasonsFor([raw()])).toEqual(["kept"])
  })

  it("filters social media posts, including subdomains", () => {
    expect(
      reasonsFor([
        raw({ url: "https://x.com/user/status/1", title: "California kill switch bill thread" }),
        raw({ url: "https://www.reddit.com/r/tech/comments/abc", title: "California kill switch bill discussion" }),
        raw({ url: "https://old.reddit.com/r/tech/comments/def", title: "California kill switch bill again" }),
        raw({ url: "https://www.youtube.com/watch?v=1", title: "California kill switch bill video" }),
      ]),
    ).toEqual(["social media", "social media", "social media", "social media"])
  })

  it("filters malformed and non-http URLs", () => {
    expect(reasonsFor([raw({ url: "not a url" }), raw({ url: "ftp://example.com/file" })])).toEqual(["malformed URL", "malformed URL"])
  })

  it("filters results with no meaningful content", () => {
    expect(reasonsFor([raw({ snippet: "  " }), raw({ url: "https://b.example.com/x", snippet: "short" })])).toEqual([
      "no meaningful content",
      "no meaningful content",
    ])
  })

  it("filters results unrelated to the story", () => {
    expect(
      reasonsFor([raw({ url: "https://c.example.com/x", title: "Best pasta recipes", snippet: "Boil water and add plenty of salt to the pot." })]),
    ).toEqual(["unrelated to the story"])
  })

  it("filters duplicate URLs, including tracking-parameter variants", () => {
    expect(
      reasonsFor([
        raw(),
        raw({ url: "https://www.news.example.com/california-ai-kill-switch/?utm_source=x", title: "Different title entirely about kill switch" }),
      ]),
    ).toEqual(["kept", "duplicate URL"])
  })

  it("filters the same headline republished on another domain", () => {
    expect(
      reasonsFor([
        raw(),
        raw({ url: "https://syndicator.example.org/copy", title: "California passes AI kill switch bill" }),
      ]),
    ).toEqual(["kept", "duplicate of an already-found article"])
  })

  it("does not apply content or relevance filters to the original article, only well-formedness", () => {
    const pool = new CandidatePool(HEADLINE)
    pool.add([raw({ origin: "original", snippet: "", title: "Totally different wording here", url: "https://orig.example.com/a" })])
    expect(pool.trace()[0]).toMatchObject({ outcome: "not-selected", origin: "original" })
    expect(pool.available()).toHaveLength(1)
  })

  it("drops a search result that duplicates the original article's URL, keeping the original", () => {
    const pool = new CandidatePool(HEADLINE)
    pool.add([raw({ origin: "original" })])
    pool.add([raw({ origin: "search" })])
    expect(pool.trace().map((entry) => [entry.origin, entry.outcome])).toEqual([
      ["original", "not-selected"],
      ["search", "filtered"],
    ])
  })
})

describe("CandidatePool state", () => {
  it("assigns stable ids and tracks selection and rejection reasons", () => {
    const pool = new CandidatePool(HEADLINE)
    pool.add([raw(), raw({ url: "https://two.example.com/a", title: "Kill switch bill in California explained" })])

    expect(pool.available().map((candidate) => candidate.id)).toEqual(["c1", "c2"])

    pool.select("c1", "reporting", "Solid coverage", "s1")
    pool.reject("c2", "Thin explainer")

    expect(pool.available().map((candidate) => candidate.id)).toEqual(["c2"])
    expect(pool.trace().map(({ outcome, reason, sourceId, sourceType }) => ({ outcome, reason, sourceId, sourceType }))).toEqual([
      { outcome: "selected", reason: "Solid coverage", sourceId: "s1", sourceType: "reporting" },
      { outcome: "not-selected", reason: "Thin explainer", sourceId: undefined, sourceType: undefined },
    ])
  })

  it("domainOf strips www and tolerates garbage", () => {
    expect(domainOf("https://www.Example.com/a")).toBe("example.com")
    expect(domainOf("nope")).toBe("")
  })
})
