import { z } from "zod"
import type { ResearchDisagreement, ResearchQuote, SourcedClaim } from "../../src/types/research.js"
import { isDirectSpeech, normalizeForQuoteMatch, quotedPassages } from "../shared/text.js"
import { ResearchError } from "./errors.js"
import type { PriorDisagreement } from "./prompt.js"
import { searchRequestSchema } from "./selector.js"
import type { SearchRequest } from "./selector.js"

const MAX_QUOTES = 5
const MAX_QUOTE_CHARS = 400

const claimSchema = z.object({ claim: z.string(), sourceIds: z.array(z.string()) })

const synthesisSchema = z.object({
  assessment: z.enum(["sufficient", "insufficient"]),
  assessmentReason: z.string(),
  summary: z.string(),
  facts: z.array(claimSchema),
  context: z.array(claimSchema),
  analysis: z.array(claimSchema),
  quotes: z.array(z.object({ text: z.string(), speaker: z.string(), sourceId: z.string() })),
  disagreements: z.array(z.object({ priorId: z.string().nullable(), topic: z.string(), positions: z.array(claimSchema) })),
  resolutions: z.array(z.object({ disagreementId: z.string(), resolution: z.string(), sourceIds: z.array(z.string()) })),
  resolutionQuery: searchRequestSchema.nullable(),
})

export interface SynthesisContext {
  /** The exact text the model was shown for each usable source, by id. Quotes are checked against it. */
  sourceTexts: ReadonlyMap<string, string>
  /** Domains of the news-outlet sources, so a quote cannot be "spoken" by the outlet that published it. */
  sourceDomains?: ReadonlyMap<string, string>
  priorDisagreements: PriorDisagreement[]
  /** Sources added to try to settle the prior disagreements. */
  newSourceIds: ReadonlySet<string>
}

export interface Synthesis {
  assessment: "sufficient" | "insufficient"
  assessmentReason: string
  summary: string
  facts: SourcedClaim[]
  context: SourcedClaim[]
  analysis: SourcedClaim[]
  quotes: ResearchQuote[]
  disagreements: ResearchDisagreement[]
  resolutionQuery: SearchRequest | null
  /** Things the validation dropped, rejected or kept on purpose, for the debug trace. */
  notes: string[]
}

function invalidOutput(message: string): ResearchError {
  return new ResearchError("invalid-output", `The research model returned an invalid answer: ${message}`)
}

export { normalizeForQuoteMatch }

const GENERIC_DOMAIN_LABELS = new Set(["www", "com", "org", "net", "news", "co", "uk", "in", "io"])

/** True when the "speaker" is just the publishing outlet (e.g. "Reuters" for reuters.com): that is reporting, not a quote. */
function isOutlet(speaker: string, domain: string): boolean {
  const name = speaker.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")
  return domain.split(".").some((label) => label.length >= 3 && !GENERIC_DOMAIN_LABELS.has(label) && label === name)
}

function stripOuterQuotes(text: string): string {
  return text.trim().replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/g, "").trim()
}

/**
 * Turns the model's raw answer into a trusted evidence file. The model is never trusted:
 * - a claim that cites an unknown source makes the whole answer invalid;
 * - a claim citing no source is dropped, since unsupported claims must not be included;
 * - a fact, context or analysis item containing direct speech in quotation marks is dropped: direct speech belongs
 *   only in `quotes`, and an unverified quotation must never reach the writer as if it were quotable. Words that
 *   check out verbatim against the cited source are kept as a quote instead, when the speaker is not in doubt;
 * - a quote that is not verbatim in its source is dropped;
 * - a disagreement can only disappear through a resolution backed by a newly added source.
 */
export function parseSynthesis(
  raw: string,
  { sourceTexts, sourceDomains = new Map(), priorDisagreements, newSourceIds }: SynthesisContext,
): Synthesis {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    throw invalidOutput("it was not valid JSON")
  }

  const parsed = synthesisSchema.safeParse(json)
  if (!parsed.success) throw invalidOutput("it did not match the expected shape")
  const data = parsed.data

  const notes: string[] = []
  const priorIds = new Set(priorDisagreements.map((prior) => prior.id))

  function checkIds(ids: string[]): string[] {
    for (const id of ids) {
      if (!sourceTexts.has(id)) throw invalidOutput("it cited a source that was not provided")
    }
    return [...new Set(ids)]
  }

  const droppedSpeech: SourcedClaim[] = []

  function claims(list: z.infer<typeof claimSchema>[], label: string, allowDirectSpeech = true): SourcedClaim[] {
    const kept: SourcedClaim[] = []
    for (const { claim, sourceIds } of list) {
      const text = claim.trim()
      const ids = checkIds(sourceIds)
      if (!text) continue
      if (ids.length === 0) {
        notes.push(`Dropped a ${label} that cited no source: "${text.slice(0, 80)}"`)
        continue
      }
      if (!allowDirectSpeech && quotedPassages(text).some(isDirectSpeech)) {
        notes.push(`Dropped a ${label} containing direct speech in quotation marks (only quotes may): "${text.slice(0, 80)}"`)
        droppedSpeech.push({ claim: text, sourceIds: ids })
        continue
      }
      kept.push({ claim: text, sourceIds: ids })
    }
    return kept
  }

  // Disagreement positions below keep the default: dropping one could make a real disagreement disappear.
  const facts = claims(data.facts, "fact", false)
  const context = claims(data.context, "context item", false)
  const analysis = claims(data.analysis, "analysis item", false)

  const quotes: ResearchQuote[] = []
  for (const quote of data.quotes) {
    checkIds([quote.sourceId])
    const text = stripOuterQuotes(quote.text)
    const speaker = quote.speaker.trim()
    if (!text || !speaker) {
      notes.push("Dropped a quote with no text or no speaker")
    } else if (isOutlet(speaker, sourceDomains.get(quote.sourceId) ?? "")) {
      notes.push(`Dropped a quote "spoken" by the outlet itself (${speaker}), which is reporting rather than a quote`)
    } else if (text.length > MAX_QUOTE_CHARS) {
      notes.push(`Dropped a quote longer than ${MAX_QUOTE_CHARS} characters`)
    } else if (!normalizeForQuoteMatch(sourceTexts.get(quote.sourceId) ?? "").includes(normalizeForQuoteMatch(text))) {
      notes.push(`Dropped a quote that is not verbatim in ${quote.sourceId}: "${text.slice(0, 80)}"`)
    } else if (quotes.length < MAX_QUOTES) {
      quotes.push({ text, speaker, sourceId: quote.sourceId })
    }
  }

  // Speech that a fact carried is still real words from a source. It becomes a quote only by the rules of any other
  // quote (verbatim in a cited source, within the limits), and only when the speaker is a name the model already
  // gave for a verified quote from that same source and the fact mentions it. The speaker is never guessed.
  for (const { claim: text, sourceIds } of droppedSpeech) {
    for (const passage of quotedPassages(text).filter(isDirectSpeech)) {
      const words = normalizeForQuoteMatch(passage.text)
      const sourceId = sourceIds.find((id) => normalizeForQuoteMatch(sourceTexts.get(id) ?? "").includes(words))
      if (!sourceId || passage.text.length > MAX_QUOTE_CHARS || quotes.some((quote) => normalizeForQuoteMatch(quote.text) === words)) continue
      const speakers = [...new Set(quotes.filter((quote) => quote.sourceId === sourceId).map((quote) => quote.speaker))].filter((speaker) =>
        normalizeForQuoteMatch(text).includes(normalizeForQuoteMatch(speaker)),
      )
      if (speakers.length !== 1 || quotes.length >= MAX_QUOTES) continue
      quotes.push({ text: passage.text, speaker: speakers[0], sourceId })
      notes.push(`Kept the direct speech from a dropped fact as a quote by ${speakers[0]}: "${passage.text.slice(0, 80)}"`)
    }
  }

  const disagreements: (ResearchDisagreement & { priorId: string | null })[] = []
  for (const { priorId, topic, positions } of data.disagreements) {
    if (priorId !== null && !priorIds.has(priorId)) throw invalidOutput("it referred to a disagreement that does not exist")
    const kept = claims(positions, "disagreement position")
    if (kept.length < 2 || !topic.trim()) {
      notes.push(`Dropped a disagreement with fewer than two sourced positions: "${topic.slice(0, 80)}"`)
      continue
    }
    disagreements.push({ priorId, topic: topic.trim(), positions: kept })
  }

  const stillListed = new Set(disagreements.flatMap((entry) => (entry.priorId ? [entry.priorId] : [])))
  const resolved = new Set<string>()
  for (const { disagreementId, resolution, sourceIds } of data.resolutions) {
    if (!priorIds.has(disagreementId)) throw invalidOutput("it resolved a disagreement that does not exist")
    const ids = checkIds(sourceIds)
    const topic = priorDisagreements.find((prior) => prior.id === disagreementId)?.disagreement.topic ?? disagreementId
    if (stillListed.has(disagreementId)) {
      notes.push(`Rejected resolution of "${topic}": the disagreement was also kept as unresolved`)
    } else if (!resolution.trim() || !ids.some((id) => newSourceIds.has(id))) {
      notes.push(`Rejected resolution of "${topic}": it did not rest on any newly added source`)
    } else {
      resolved.add(disagreementId)
      notes.push(`Resolved "${topic}": ${resolution.trim().slice(0, 200)}`)
    }
  }

  // A disagreement is never allowed to vanish silently.
  const final: ResearchDisagreement[] = disagreements.map(({ topic, positions }) => ({ topic, positions }))
  for (const { id, disagreement } of priorDisagreements) {
    if (resolved.has(id) || stillListed.has(id)) continue
    notes.push(`Kept unresolved disagreement "${disagreement.topic}": the model dropped it without a valid resolution`)
    final.push(disagreement)
  }

  return {
    assessment: data.assessment,
    assessmentReason: data.assessmentReason.trim(),
    summary: data.summary.trim(),
    facts,
    context,
    analysis,
    quotes,
    disagreements: final,
    resolutionQuery: data.resolutionQuery,
    notes,
  }
}
