import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { LANGUAGE_NAMES, MAX_DURATION_MINUTES, MIN_DURATION_MINUTES, maxWordsFor, minWordsFor, targetWordsFor, TONE_IDS } from "./options.js"
import { TONE_GUIDANCE } from "./tones.js"

// The server keeps its own copy of the podcast options (it cannot use the client's `@/` alias, and the
// API should not depend on client code at runtime). These tests read the client files as text and fail
// if the two lists drift apart.
const clientFile = (path: string) => readFileSync(new URL(`../../src/${path}`, import.meta.url), "utf8")

function matches(source: string, pattern: RegExp): string[][] {
  return [...source.matchAll(pattern)].map((match) => match.slice(1))
}

describe("server options match the client", () => {
  const clientTones = matches(clientFile("data/tones.ts"), /id: "(\w+)",\s*label: "([^"]+)"/g)
  const clientLanguages = matches(clientFile("data/mockLanguages.ts"), /code: "(\w+)", label: "([^"]+)"/g)

  it("supports exactly the tones the UI offers", () => {
    expect(clientTones).toHaveLength(6)
    expect(clientTones.map(([id]) => id).sort()).toEqual([...TONE_IDS].sort())
  })

  it("has editorial guidance and the same label for every tone", () => {
    for (const [id, label] of clientTones) {
      const tone = TONE_GUIDANCE[id as keyof typeof TONE_GUIDANCE]
      expect(tone.label).toBe(label)
      expect(tone.guidance.length).toBeGreaterThan(200)
    }
  })

  it("supports exactly the languages the UI offers, with the same names", () => {
    expect(clientLanguages.length).toBeGreaterThan(0)
    expect(Object.fromEntries(clientLanguages)).toEqual(LANGUAGE_NAMES)
  })

  it("uses the same duration range as the UI", () => {
    const settings = clientFile("types/settings.ts")
    expect(settings).toContain(`MIN_DURATION_MINUTES = ${MIN_DURATION_MINUTES}`)
    expect(settings).toContain(`MAX_DURATION_MINUTES = ${MAX_DURATION_MINUTES}`)
  })
})

describe("episode length limits", () => {
  it("derives the target, the hard maximum and the soft minimum from the duration, without floating-point drift", () => {
    expect([10, 5, 20, 60].map((minutes) => [targetWordsFor(minutes), maxWordsFor(minutes), minWordsFor(minutes)])).toEqual([
      [1500, 1725, 1125],
      [750, 863, 563],
      [3000, 3450, 2250],
      [9000, 10350, 6750],
    ])
  })
})
