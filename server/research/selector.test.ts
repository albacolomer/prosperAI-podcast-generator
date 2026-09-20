import { describe, expect, it } from "vitest"
import type { ResearchError } from "./errors.js"
import { parseSelection } from "./selector.js"

const ids = new Set(["c1", "c2", "c3"])

const answer = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    selected: [{ candidateId: "c1", type: "primary", reason: "  The company statement " }],
    rejected: [{ candidateId: "c2", reason: "Rewrite of c1" }],
    followUp: null,
    ...overrides,
  })

function invalid(raw: string, max = 3): ResearchError {
  try {
    parseSelection(raw, ids, max)
  } catch (error) {
    return error as ResearchError
  }
  throw new Error("expected parseSelection to throw")
}

describe("parseSelection", () => {
  it("returns the selection with trimmed reasons", () => {
    expect(parseSelection(answer(), ids, 3)).toEqual({
      selected: [{ candidateId: "c1", type: "primary", reason: "The company statement" }],
      rejected: [{ candidateId: "c2", reason: "Rewrite of c1" }],
      followUp: null,
    })
  })

  it("accepts an empty selection and a follow-up search", () => {
    const followUp = { query: "Gemini incident statement", topic: "general" }
    expect(parseSelection(answer({ selected: [], followUp }), ids, 3)).toMatchObject({ selected: [], followUp })
  })

  it("rejects text that is not JSON", () => {
    const error = invalid("here are my picks")
    expect(error.kind).toBe("invalid-output")
    expect(error.message).toContain("not valid JSON")
  })

  it("rejects an answer with the wrong shape or an unknown source type", () => {
    expect(invalid(JSON.stringify({ selected: "c1" })).message).toContain("expected shape")
    expect(invalid(answer({ selected: [{ candidateId: "c1", type: "blog", reason: "x" }] })).message).toContain("expected shape")
  })

  it("rejects a candidate id that was not in the list", () => {
    const error = invalid(answer({ selected: [{ candidateId: "c9", type: "reporting", reason: "x" }] }))
    expect(error.message).toContain("not in the list")
  })

  it("rejects the same candidate listed twice, or both selected and rejected", () => {
    const twice = { candidateId: "c1", type: "reporting", reason: "x" }
    expect(invalid(answer({ selected: [twice, twice] })).message).toContain("more than once")
    expect(invalid(answer({ rejected: [{ candidateId: "c1", reason: "no" }] })).message).toContain("more than once")
  })

  it("rejects selecting more sources than the budget allows", () => {
    const selected = ["c1", "c2", "c3"].map((candidateId) => ({ candidateId, type: "reporting", reason: "x" }))
    expect(invalid(answer({ selected, rejected: [] }), 2).message).toContain("at most 2")
  })
})
