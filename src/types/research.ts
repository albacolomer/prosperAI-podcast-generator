export type ResearchStatus = "enriched" | "insufficient" | "failed"

/** primary: the originating organisation/document itself. reporting: news coverage. context: background. */
export type ResearchSourceType = "primary" | "reporting" | "context"

export interface ResearchSource {
  /** Local id ("s1", "s2", ...) assigned by the server; claims refer to sources by it. */
  id: string
  title: string
  url: string
  domain: string
  type: ResearchSourceType
}

/** A statement together with the sources that directly support it. */
export interface SourcedClaim {
  claim: string
  sourceIds: string[]
}

export interface ResearchQuote {
  /** Verbatim text found in the source's extracted content. */
  text: string
  speaker: string
  sourceId: string
}

/** Sources that disagree about something and could not be reconciled. */
export interface ResearchDisagreement {
  topic: string
  positions: SourcedClaim[]
}

export type ResearchQueryPurpose = "initial" | "follow-up" | "conflict-resolution"

export interface ResearchQueryTrace {
  query: string
  purpose: ResearchQueryPurpose
  topic: "news" | "general"
  /** Results Tavily returned, before any filtering. */
  results: number
  error?: string
}

export interface CandidateTrace {
  url: string
  title: string
  domain: string
  score: number | null
  /** "original" is the article the news pipeline supplied; it is not treated as independent reporting. */
  origin: "original" | "search"
  outcome: "filtered" | "selected" | "not-selected"
  reason: string
  sourceType?: ResearchSourceType
  sourceId?: string
}

export interface ExtractionTrace {
  sourceId: string
  url: string
  domain: string
  extracted: boolean
  chars: number
  usable: boolean
  /** Content-quality problems found (empty when the content is usable). */
  issues: string[]
  preview: string
  error?: string
}

/** Everything the researcher did for one story. Only returned for debug requests. */
export interface ResearchTrace {
  queries: ResearchQueryTrace[]
  candidates: CandidateTrace[]
  extractions: ExtractionTrace[]
  synthesisRuns: number
  /** Notable decisions: dropped quotes, rejected resolutions, research that stopped early, ... */
  notes: string[]
}

/** Source-backed material about one story: the factual layer a script can safely draw on. */
export interface EnrichedStory {
  /** The id of the article this story was researched from. */
  storyId: string
  headline: string
  /** A neutral one-to-two sentence restatement of the facts below. Not podcast prose. */
  summary: string
  /**
   * Claims directly supported by the sources, paraphrased. Never direct speech in quotation marks: a fact is not
   * quotable source text. Anything that should be quoted belongs in `quotes`.
   */
  facts: SourcedClaim[]
  /** Source-backed background that helps explain the story. Paraphrased, like facts. */
  context: SourcedClaim[]
  /** Interpretation that goes beyond what the sources state. Never to be presented as fact. */
  analysis: SourcedClaim[]
  /** The ONLY direct speech a script may put in quotation marks: verified verbatim, with a known speaker. */
  quotes: ResearchQuote[]
  /** Disagreements between sources that research could not resolve. */
  disagreements: ResearchDisagreement[]
  /** Only the sources the material above actually relies on. Empty unless status is "enriched". */
  sources: ResearchSource[]
  status: ResearchStatus
  /** Why the story is insufficient or failed. */
  statusReason?: string
  trace?: ResearchTrace
}

export interface ResearchStats {
  requested: number
  enriched: number
  insufficient: number
  failed: number
  model: string
  tavilySearches: number
  tavilyExtractions: number
  /** Wall-clock time for the whole request, in milliseconds. */
  durationMs: number
}

export interface ResearchResponse {
  stories: EnrichedStory[]
  stats: ResearchStats
}
