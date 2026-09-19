import { describe, expect, it, vi } from "vitest"
import type { Article } from "../../src/types/article.js"
import { RankingError } from "./errors.js"
import { rankStories } from "./ranker.js"
import type { RankModel } from "./ranker.js"

const article = (id: string, interest = "AI"): Article => ({
  id,
  title: `Title ${id}`,
  description: `Description of ${id}`,
  url: `https://example.com/${id}`,
  source: "Example",
  publishedAt: "2026-09-18T10:00:00.000Z",
  interests: [interest],
})

const articles = [article("a"), article("b"), article("c"), article("d", "Formula 1")]

const modelReturning = (answer: unknown): RankModel => vi.fn(async () => (typeof answer === "string" ? answer : JSON.stringify(answer)))

function rank(model: RankModel, maxStories = 3, input = articles) {
  return rankStories(
    { interests: ["AI", "Formula 1"], articles: input, maxStories },
    { model, modelName: "test-model", log: () => {}, clock: () => 0 },
  )
}

async function failureOf(promise: Promise<unknown>): Promise<RankingError> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  )
  expect(error).toBeInstanceOf(RankingError)
  return error as RankingError
}

describe("rankStories", () => {
  it("returns the selected stories in rank order with stats", async () => {
    const result = await rank(
      modelReturning({
        selected: [
          { articleId: "d", rank: 2, reason: "F1 news" },
          { articleId: "a", rank: 1, reason: "  Big AI launch " },
        ],
      }),
    )

    expect(result.selected).toEqual([
      { articleId: "a", rank: 1, reason: "Big AI launch" },
      { articleId: "d", rank: 2, reason: "F1 news" },
    ])
    expect(result.stats).toEqual({ candidates: 4, selected: 2, model: "test-model", durationMs: 0 })
  })

  it("renumbers ranks to 1..n even if the model skips numbers", async () => {
    const result = await rank(
      modelReturning({
        selected: [
          { articleId: "a", rank: 5, reason: "x" },
          { articleId: "b", rank: 9, reason: "y" },
        ],
      }),
    )
    expect(result.selected.map((story) => story.rank)).toEqual([1, 2])
  })

  it("accepts an empty selection", async () => {
    const result = await rank(modelReturning({ selected: [] }))
    expect(result.selected).toEqual([])
  })

  it("sends the interests, budget and candidate ids to the model, without image urls or links", async () => {
    const model = vi.fn<RankModel>(async () => JSON.stringify({ selected: [] }))
    await rank(model, 3)

    const prompt = model.mock.calls[0][0]
    expect(prompt.system).toContain("editorial curator")
    const payload = JSON.parse(prompt.user) as { interests: string[]; maxStories: number; candidates: { articleId: string }[] }
    expect(payload.interests).toEqual(["AI", "Formula 1"])
    expect(payload.maxStories).toBe(3)
    expect(payload.candidates.map((candidate) => candidate.articleId)).toEqual(["a", "b", "c", "d"])
    expect(prompt.user).not.toContain("https://example.com")
  })

  it("rejects an answer that is not JSON", async () => {
    const error = await failureOf(rank(modelReturning("Here are my picks: a, b")))
    expect(error.kind).toBe("invalid-output")
  })

  it("rejects an answer with the wrong shape", async () => {
    for (const answer of [{}, { selected: "a" }, { selected: [{ articleId: "a" }] }, { selected: [{ articleId: 1, rank: 1, reason: "x" }] }]) {
      expect((await failureOf(rank(modelReturning(answer)))).kind).toBe("invalid-output")
    }
  })

  it("rejects an article id that was not in the input", async () => {
    const error = await failureOf(
      rank(modelReturning({ selected: [{ articleId: "made-up", rank: 1, reason: "x" }] })),
    )
    expect(error.kind).toBe("invalid-output")
    expect(error.message).toContain("not in the candidate list")
  })

  it("rejects duplicate selected article ids", async () => {
    const error = await failureOf(
      rank(
        modelReturning({
          selected: [
            { articleId: "a", rank: 1, reason: "x" },
            { articleId: "a", rank: 2, reason: "y" },
          ],
        }),
      ),
    )
    expect(error.message).toContain("more than once")
  })

  it("rejects more selected stories than maxStories", async () => {
    const error = await failureOf(
      rank(
        modelReturning({
          selected: ["a", "b", "c"].map((articleId, index) => ({ articleId, rank: index + 1, reason: "x" })),
        }),
        2,
      ),
    )
    expect(error.message).toContain("at most 2")
  })

  it("lets model failures propagate without swallowing them", async () => {
    const model: RankModel = async () => {
      throw new RankingError("timeout", "timed out")
    }
    expect((await failureOf(rank(model))).kind).toBe("timeout")
  })
})
