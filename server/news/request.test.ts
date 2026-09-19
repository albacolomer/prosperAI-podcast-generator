import { describe, expect, it } from "vitest"
import { parseNewsQuery } from "./request.js"

const parse = (search: string) => parseNewsQuery(new URL(`http://localhost/api/news${search}`))

describe("parseNewsQuery", () => {
  it("splits, trims and dedupes interests and applies defaults", () => {
    expect(parse("?interests=Artificial%20Intelligence, Startups,startups,,Climate")).toEqual({
      ok: true,
      options: {
        interests: ["Artificial Intelligence", "Startups", "Climate"],
        language: "en",
        days: 3,
        includeRemoved: false,
      },
    })
  })

  it("turns debug=1 into includeRemoved", () => {
    const result = parse("?interests=AI&debug=1")
    expect(result.ok && result.options.includeRemoved).toBe(true)
    expect(parse("?interests=AI&debug=maybe").ok).toBe(false)
  })

  it("rejects a missing or empty interests list", () => {
    expect(parse("").ok).toBe(false)
    expect(parse("?interests=,,").ok).toBe(false)
  })

  it("rejects too many interests and invalid language/days", () => {
    expect(parse(`?interests=${Array.from({ length: 11 }, (_, i) => `topic${i}`).join(",")}`).ok).toBe(false)
    expect(parse("?interests=AI&language=english").ok).toBe(false)
    expect(parse("?interests=AI&days=99").ok).toBe(false)
  })
})
