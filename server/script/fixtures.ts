import type { EpisodePlan, PlannedStory } from "../../src/types/plan.js"
import type { EnrichedStory } from "../../src/types/research.js"
import type { ScriptSegment } from "../../src/types/script.js"

/**
 * Test fixture: a small but complete enriched story. Typed as EnrichedStory, so it stops compiling if
 * Research's type changes in a way the script tests should notice.
 * Evidence ids by position: facts f1, f2; context c1; analysis a1; quote q1.
 */
export function enrichedStory(id: string, overrides: Partial<EnrichedStory> = {}): EnrichedStory {
  return {
    storyId: id,
    headline: `Headline ${id}`,
    summary: `Summary of ${id}`,
    facts: [
      { claim: `Fact one about ${id}`, sourceIds: ["s1"] },
      { claim: `Fact two about ${id}`, sourceIds: ["s1", "s2"] },
    ],
    context: [{ claim: `Background on ${id}`, sourceIds: ["s2"] }],
    analysis: [{ claim: `Interpretation of ${id}`, sourceIds: ["s1"] }],
    quotes: [{ text: `Exact words about ${id}`, speaker: "A. Speaker", sourceId: "s2" }],
    disagreements: [],
    sources: [
      { id: "s1", title: `Reporting on ${id}`, url: `https://news.example.com/${id}`, domain: "news.example.com", type: "reporting" },
      { id: "s2", title: `Statement on ${id}`, url: `https://primary.example.org/${id}`, domain: "primary.example.org", type: "primary" },
    ],
    status: "enriched",
    ...overrides,
  }
}

/** A story whose first fact and first context item name Nvidia, so a connection based on "Nvidia" is grounded in it. */
export function nvidiaStory(id: string): EnrichedStory {
  const story = enrichedStory(id)
  return {
    ...story,
    facts: [{ claim: `Nvidia supplies the chips behind story ${id}`, sourceIds: ["s1"] }, ...story.facts],
    context: [{ claim: `Nvidia is also named in the background of ${id}`, sourceIds: ["s2"] }, ...story.context],
  }
}

export function plannedStory(storyId: string, overrides: Partial<PlannedStory> = {}): PlannedStory {
  return {
    storyId,
    role: "main",
    targetWords: 400,
    selectedFactIds: ["f1", "f2"],
    selectedContextIds: ["c1"],
    selectedAnalysisIds: [],
    selectedQuoteIds: ["q1"],
    selectedDisagreementIds: [],
    reason: `Why ${storyId}`,
    ...overrides,
  }
}

/** A valid trusted plan (what parsePlan returns) telling the given stories in order. */
export function planOf(storyIds: string[], overrides: Partial<EpisodePlan> = {}): EpisodePlan {
  const stories = storyIds.map((id) => plannedStory(id))
  return {
    title: "Plan title",
    angle: "An angle",
    openingStoryId: storyIds[0],
    endingStoryId: storyIds[storyIds.length - 1],
    stories,
    omitted: [],
    connections: [],
    hookTargetWords: 60,
    outroTargetWords: 40,
    totalTargetWords: 100 + stories.reduce((sum, story) => sum + story.targetWords, 0),
    adjustments: [],
    ...overrides,
  }
}

/** A connection as the planner answers it: its basis ("Nvidia") appears in the cited evidence on both sides. */
export function connection(fromStoryId: string, toStoryId: string, overrides: Record<string, unknown> = {}) {
  return {
    fromStoryId,
    toStoryId,
    basisType: "shared-actor",
    basis: "Nvidia",
    idea: "Both stories involve Nvidia hardware",
    fromEvidenceIds: ["f1"],
    toEvidenceIds: ["f1"],
    ...overrides,
  }
}

/** The plan as the planner model answers it: no derived fields. */
export function modelPlanOf(storyIds: string[], overrides: Record<string, unknown> = {}) {
  const { openingStoryId: _opening, endingStoryId: _ending, totalTargetWords: _total, adjustments: _adjustments, ...plan } = planOf(storyIds)
  return { ...plan, ...overrides }
}

export const segment = (type: ScriptSegment["type"], text: string, articleIds: string[] = []): ScriptSegment => ({ type, text, articleIds })

/** `count` words of filler, for length tests. */
export const words = (count: number) => Array.from({ length: count }, () => "word").join(" ")
