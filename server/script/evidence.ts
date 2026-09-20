import type {
  EnrichedStory,
  ResearchDisagreement,
  ResearchQuote,
  ResearchSource,
  SourcedClaim,
} from "../../src/types/research.js"

/**
 * Research items have no ids of their own, so the script layer gives each one a story-local id from its position:
 * facts f1.., context c1.., analysis a1.., quotes q1.., disagreements d1... The same EnrichedStory always yields
 * the same ids, which is what lets the plan, the writer and the validator point at the same evidence.
 */
export type WithId<T> = T & { id: string }

export interface IndexedStory {
  story: EnrichedStory
  facts: WithId<SourcedClaim>[]
  context: WithId<SourcedClaim>[]
  analysis: WithId<SourcedClaim>[]
  quotes: WithId<ResearchQuote>[]
  disagreements: WithId<ResearchDisagreement>[]
}

function indexed<T>(prefix: string, items: readonly T[]): WithId<T>[] {
  return items.map((item, index) => ({ id: `${prefix}${index + 1}`, ...item }))
}

export function indexStory(story: EnrichedStory): IndexedStory {
  return {
    story,
    facts: indexed("f", story.facts),
    context: indexed("c", story.context),
    analysis: indexed("a", story.analysis),
    quotes: indexed("q", story.quotes),
    disagreements: indexed("d", story.disagreements),
  }
}

/** Every evidence id a story has, whatever its kind. */
export function evidenceIdsOf(indexedStory: IndexedStory): Set<string> {
  const ids = new Set<string>()
  for (const list of [indexedStory.facts, indexedStory.context, indexedStory.analysis, indexedStory.quotes, indexedStory.disagreements]) {
    for (const { id } of list) ids.add(id)
  }
  return ids
}

/** The words of one evidence item (a claim, a quote and its speaker, or a disagreement's topic and positions), or "" for an unknown id. */
export function evidenceTextOf(indexedStory: IndexedStory, itemId: string): string {
  const claim = [...indexedStory.facts, ...indexedStory.context, ...indexedStory.analysis].find(({ id }) => id === itemId)
  if (claim) return claim.claim
  const quote = indexedStory.quotes.find(({ id }) => id === itemId)
  if (quote) return `${quote.text} ${quote.speaker}`
  const disagreement = indexedStory.disagreements.find(({ id }) => id === itemId)
  return disagreement ? [disagreement.topic, ...disagreement.positions.map(({ claim: text }) => text)].join(" ") : ""
}

/** "<storyId>:<itemId>", the form issues use to point at one Research item. */
export function qualifiedId(storyId: string, itemId: string): string {
  return `${storyId}:${itemId}`
}

export function splitQualifiedId(value: string): { storyId: string; itemId: string } | null {
  const at = value.lastIndexOf(":")
  return at > 0 && at < value.length - 1 ? { storyId: value.slice(0, at), itemId: value.slice(at + 1) } : null
}

/** The sources a set of evidence items actually cites, in the story's own order. */
export function sourcesCitedBy(story: EnrichedStory, sourceIds: Iterable<string>): ResearchSource[] {
  const wanted = new Set(sourceIds)
  return story.sources.filter((source) => wanted.has(source.id))
}
