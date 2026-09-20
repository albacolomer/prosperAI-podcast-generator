import type { Article } from "../../src/types/article.js"
import type {
  EnrichedStory,
  ExtractionTrace,
  ResearchQueryPurpose,
  ResearchResponse,
  ResearchSource,
  ResearchStatus,
  ResearchTrace,
} from "../../src/types/research.js"
import type { NewsLogger } from "../news/log.js"
import { canonicalizeUrl } from "../news/normalize.js"
import { CandidatePool, domainOf } from "./candidates.js"
import type { RawCandidate } from "./candidates.js"
import { ResearchError } from "./errors.js"
import { researchLog } from "./log.js"
import {
  buildSelectionUserPrompt,
  buildSynthesisUserPrompt,
  SELECTION_SYSTEM_PROMPT,
  SYNTHESIS_SYSTEM_PROMPT,
} from "./prompt.js"
import type { PriorDisagreement } from "./prompt.js"
import { parseSelection } from "./selector.js"
import type { SearchRequest } from "./selector.js"
import { parseSynthesis } from "./synthesizer.js"
import type { Synthesis } from "./synthesizer.js"
import type { TavilyClient } from "./tavily.js"
import { validateContent } from "./validate.js"

export interface ResearchPrompt {
  system: string
  user: string
}

/** The two LLM steps of research. Each returns the model's raw structured (JSON) answer. */
export interface ResearchModel {
  select(prompt: ResearchPrompt): Promise<string>
  synthesize(prompt: ResearchPrompt): Promise<string>
}

/** Safety and cost ceilings per story. They are limits, not targets: research stops as soon as it has enough. */
export interface ResearchBudget {
  maxSearches: number
  /** Extraction attempts, whether or not they turn out usable. */
  maxExtractions: number
}

export const DEFAULT_BUDGET: ResearchBudget = { maxSearches: 3, maxExtractions: 5 }

/** "Smallest useful set": one selection round never reads more than this many pages. */
const MAX_SELECTIONS_PER_ROUND = 3
/** Pages tried from any one site per story. A retry can rescue a bad extraction; more is usually sidebar links. */
const MAX_ATTEMPTS_PER_DOMAIN = 2
/** Fewer source-backed facts than this is not enough to discuss a story meaningfully. */
const MIN_FACTS = 2
/** Text kept per source. Validation, the model and the quote check all see exactly this text. */
const MAX_SOURCE_CHARS = 12_000
const PREVIEW_CHARS = 500
const STORY_CONCURRENCY = 3

interface ResearcherConfig {
  tavily: TavilyClient
  model: ResearchModel
  modelName: string
  budget?: Partial<ResearchBudget>
  log?: NewsLogger
  clock?: () => number
}

interface UsableSource extends ResearchSource {
  text: string
}

interface StoryOutcome {
  story: EnrichedStory
  searches: number
  extractions: number
}

/**
 * The evidence rule for "enriched": at least one usable primary source, or at least two usable sources from
 * different domains that count as independent. The original article's own outlet is not independent of the
 * story it reported, so it only counts when it is itself the primary source.
 */
export function meetsEvidenceMinimum(sources: readonly ResearchSource[], originalDomain: string): boolean {
  if (sources.some((source) => source.type === "primary")) return true
  const independentDomains = new Set(
    sources.filter((source) => source.domain !== originalDomain).map((source) => source.domain),
  )
  return independentDomains.size >= 2
}

function emptyStory(article: Article, status: ResearchStatus, statusReason: string): EnrichedStory {
  return {
    storyId: article.id,
    headline: article.title,
    summary: "",
    facts: [],
    context: [],
    analysis: [],
    quotes: [],
    disagreements: [],
    sources: [],
    status,
    statusReason,
  }
}

/** Researches one story: search, filter, select, extract, validate, synthesize, and (if sources disagree) try to resolve. */
async function researchStory(article: Article, config: ResearcherConfig, debug: boolean): Promise<StoryOutcome> {
  const { tavily, model, log = researchLog } = config
  const budget = { ...DEFAULT_BUDGET, ...config.budget }
  const headline = article.title
  const originalDomain = domainOf(article.url)

  const pool = new CandidatePool(headline)
  const trace: ResearchTrace = { queries: [], candidates: [], extractions: [], synthesisRuns: 0, notes: [] }
  const usable: UsableSource[] = []
  const typeBySource = new Map<string, ResearchSource["type"]>()
  const attemptsByDomain = new Map<string, number>()
  let searches = 0
  let extractions = 0
  let sourceCount = 0

  const originalUrl = canonicalizeUrl(article.url)
  const original: RawCandidate[] = originalUrl
    ? [{ url: article.url, title: article.title, snippet: article.description, score: null, publishedDate: article.publishedAt, origin: "original" }]
    : []

  async function search({ query, topic }: SearchRequest, purpose: ResearchQueryPurpose): Promise<void> {
    searches += 1
    log(`Search ${searches}/${budget.maxSearches} (${purpose}, ${topic}): ${query}`)
    let results
    try {
      results = await tavily.search({ query, topic })
    } catch (error) {
      trace.queries.push({ query, purpose, topic, results: 0, error: error instanceof ResearchError ? error.message : "search failed" })
      throw error
    }
    trace.queries.push({ query, purpose, topic, results: results.length })
    pool.add(
      results.map((result): RawCandidate => ({
        url: result.url,
        title: result.title,
        snippet: result.content,
        score: result.score,
        publishedDate: result.publishedDate,
        origin: "search",
      })),
    )
  }

  /** Extracts the chosen candidates, validates what came back, and adds the good ones to `usable`. */
  async function extract(chosen: { candidateId: string; sourceId: string }[]): Promise<void> {
    const candidates = chosen.flatMap(({ candidateId, sourceId }) => {
      const candidate = pool.get(candidateId)
      return candidate ? [{ candidate, sourceId }] : []
    })
    extractions += candidates.length
    log(`Extracting ${candidates.length} page(s) (${extractions}/${budget.maxExtractions} attempts used)`)
    const outcome = await tavily.extract(candidates.map(({ candidate }) => candidate.url))

    const byUrl = new Map<string, string>()
    for (const { url, content } of outcome.extracted) byUrl.set(canonicalizeUrl(url) ?? url, content)
    const failures = new Map<string, string>()
    for (const { url, error } of outcome.failed) failures.set(canonicalizeUrl(url) ?? url, error)

    for (const { candidate, sourceId } of candidates) {
      const key = canonicalizeUrl(candidate.url) ?? candidate.url
      const base = { sourceId, url: candidate.url, domain: candidate.domain }
      const content = byUrl.get(key)

      if (content === undefined) {
        trace.extractions.push({ ...base, extracted: false, chars: 0, usable: false, issues: [], preview: "", error: failures.get(key) ?? "no content returned" })
        continue
      }

      const validation = validateContent(content, headline)
      const text = content.trim().slice(0, MAX_SOURCE_CHARS)
      const entry: ExtractionTrace = {
        ...base,
        extracted: true,
        chars: content.trim().length,
        usable: validation.usable,
        issues: validation.issues,
        preview: text.slice(0, PREVIEW_CHARS),
      }
      trace.extractions.push(entry)
      if (!validation.usable) continue

      usable.push({
        id: sourceId,
        title: candidate.title || candidate.domain,
        url: candidate.url,
        domain: candidate.domain,
        type: typeBySource.get(sourceId) ?? "reporting",
        text,
      })
    }
  }

  /**
   * Repeats select -> extract until `isDone`, the budget runs out, or nothing useful is left. Used for the first
   * pass and again, with a focus, to try to settle a disagreement.
   */
  async function collect(first: { request: SearchRequest; purpose: ResearchQueryPurpose } | null, focus: string | undefined, isDone: () => boolean): Promise<void> {
    let pending = first
    for (;;) {
      if (pending) {
        if (searches >= budget.maxSearches) break
        await search(pending.request, pending.purpose)
        pending = null
      }

      for (const candidate of pool.available()) {
        if ((attemptsByDomain.get(candidate.domain) ?? 0) >= MAX_ATTEMPTS_PER_DOMAIN) {
          pool.exclude(candidate.id, `Already tried ${MAX_ATTEMPTS_PER_DOMAIN} pages from ${candidate.domain}`)
        }
      }
      const available = pool.available()
      const maxSelect = Math.min(MAX_SELECTIONS_PER_ROUND, budget.maxExtractions - extractions)
      if (available.length === 0 || maxSelect <= 0) break

      const selectStartedAt = performance.now()
      const raw = await model.select({
        system: SELECTION_SYSTEM_PROMPT,
        user: buildSelectionUserPrompt({
          headline,
          outlet: article.source,
          publishedAt: article.publishedAt,
          candidates: available,
          alreadyRead: usable.map(({ title, domain, type }) => ({ title, domain, type })),
          maxSelect,
          searchesRemaining: budget.maxSearches - searches,
          focus,
        }),
      })
      log(`Selection took ${((performance.now() - selectStartedAt) / 1000).toFixed(1)}s`)
      const selection = parseSelection(raw, new Set(available.map((candidate) => candidate.id)), maxSelect)
      for (const { candidateId, reason } of selection.rejected) pool.reject(candidateId, reason)

      // A site that keeps being picked is usually one story plus sidebar links to others: cap attempts per site.
      const picks: typeof selection.selected = []
      const planned = new Map(attemptsByDomain)
      for (const pick of selection.selected) {
        const domain = pool.get(pick.candidateId)?.domain ?? ""
        if ((planned.get(domain) ?? 0) >= MAX_ATTEMPTS_PER_DOMAIN) {
          pool.exclude(pick.candidateId, `Already tried ${MAX_ATTEMPTS_PER_DOMAIN} pages from ${domain}`)
          continue
        }
        planned.set(domain, (planned.get(domain) ?? 0) + 1)
        picks.push(pick)
      }

      const followUp = selection.followUp && searches < budget.maxSearches ? selection.followUp : null
      if (picks.length === 0) {
        if (!followUp) break
        pending = { request: followUp, purpose: "follow-up" }
        continue
      }

      const chosen = picks.map(({ candidateId, type, reason }) => {
        const domain = pool.get(candidateId)?.domain ?? ""
        attemptsByDomain.set(domain, (attemptsByDomain.get(domain) ?? 0) + 1)
        sourceCount += 1
        const sourceId = `s${sourceCount}`
        pool.select(candidateId, type, reason, sourceId)
        typeBySource.set(sourceId, type)
        return { candidateId, sourceId }
      })
      await extract(chosen)

      if (isDone()) break
      if (followUp) pending = { request: followUp, purpose: "follow-up" }
    }
  }

  /** Runs a gather step; a failure only ends research early if nothing usable has been found yet. */
  async function gather(...args: Parameters<typeof collect>): Promise<void> {
    try {
      await collect(...args)
    } catch (error) {
      if (!(error instanceof ResearchError) || usable.length === 0) throw error
      trace.notes.push(`Research stopped early: ${error.message}`)
    }
  }

  /** Attaches the trace (debug requests only) and the usage the caller adds up. */
  const finish = (story: EnrichedStory): StoryOutcome => ({
    story: debug ? { ...story, trace: { ...trace, candidates: pool.trace() } } : story,
    searches,
    extractions,
  })

  async function run(): Promise<StoryOutcome> {
    pool.add(original)
    await gather(
      { request: { query: headline, topic: "news" }, purpose: "initial" },
      undefined,
      () => meetsEvidenceMinimum(usable, originalDomain),
    )

    if (!meetsEvidenceMinimum(usable, originalDomain)) {
      const reason =
        usable.length === 0
          ? "No usable source could be read for this story"
          : "Too few independent, usable sources to support this story"
      return finish(emptyStory(article, "insufficient", reason))
    }

    let synthesis: Synthesis | undefined
    let prior: PriorDisagreement[] = []
    let newSourceIds: string[] = []
    for (;;) {
      let parsed: Synthesis
      const synthStartedAt = performance.now()
      try {
        const raw = await model.synthesize({
          system: SYNTHESIS_SYSTEM_PROMPT,
          user: buildSynthesisUserPrompt({
            headline,
            sources: usable.map(({ id, type, title, domain, text }) => ({ id, type, title, domain, text })),
            priorDisagreements: prior,
            newSourceIds,
          }),
        })
        trace.synthesisRuns += 1
        log(`Synthesis ${trace.synthesisRuns} took ${((performance.now() - synthStartedAt) / 1000).toFixed(1)}s`)
        parsed = parseSynthesis(raw, {
          sourceTexts: new Map(usable.map((source) => [source.id, source.text])),
          // Only news outlets: on a primary source the site's owner really is the speaker (Google on blog.google).
          sourceDomains: new Map(usable.filter((source) => source.type !== "primary").map((source) => [source.id, source.domain])),
          priorDisagreements: prior,
          newSourceIds: new Set(newSourceIds),
        })
      } catch (error) {
        // A failed re-read after conflict research must not throw away a valid first synthesis.
        if (!synthesis || !(error instanceof ResearchError)) throw error
        trace.notes.push(`Conflict re-synthesis failed, keeping the earlier result: ${error.message}`)
        break
      }
      trace.notes.push(...parsed.notes)
      synthesis = parsed

      const canResearchMore = searches < budget.maxSearches && extractions < budget.maxExtractions
      if (parsed.disagreements.length === 0 || !canResearchMore || parsed.assessment === "insufficient") break

      // Sources disagree and there is budget left: look for evidence that settles it, then re-read everything.
      const topics = parsed.disagreements.map((entry) => entry.topic).join("; ")
      const request: SearchRequest = parsed.resolutionQuery ?? {
        query: `${headline} ${parsed.disagreements[0].topic}`.slice(0, 200),
        topic: "news",
      }
      const before = usable.length
      await gather({ request, purpose: "conflict-resolution" }, `Sources disagree. Find sources that can settle: ${topics}`, () => usable.length > before)
      if (usable.length === before) {
        trace.notes.push("Conflict research found no new usable source")
        break
      }
      newSourceIds = usable.slice(before).map((source) => source.id)
      prior = parsed.disagreements.map((disagreement, index) => ({ id: `d${index + 1}`, disagreement }))
    }

    const referenced = new Set<string>()
    for (const { sourceIds } of [...synthesis.facts, ...synthesis.context, ...synthesis.analysis]) {
      sourceIds.forEach((id) => referenced.add(id))
    }
    for (const { sourceId } of synthesis.quotes) referenced.add(sourceId)
    for (const { positions } of synthesis.disagreements) {
      for (const { sourceIds } of positions) sourceIds.forEach((id) => referenced.add(id))
    }
    const sources: ResearchSource[] = usable
      .filter((source) => referenced.has(source.id))
      .map(({ id, title, url, domain, type }) => ({ id, title, url, domain, type }))

    if (synthesis.assessment === "insufficient") {
      const reason = synthesis.assessmentReason || "The sources do not provide enough reliable evidence"
      return finish(emptyStory(article, "insufficient", reason))
    }
    if (synthesis.facts.length < MIN_FACTS) {
      return finish(emptyStory(article, "insufficient", `Only ${synthesis.facts.length} source-backed fact(s) could be established`))
    }
    if (!meetsEvidenceMinimum(sources, originalDomain)) {
      return finish(emptyStory(article, "insufficient", "The established material rests on too few independent sources"))
    }

    return finish({
      storyId: article.id,
      headline,
      summary: synthesis.summary,
      facts: synthesis.facts,
      context: synthesis.context,
      analysis: synthesis.analysis,
      quotes: synthesis.quotes,
      disagreements: synthesis.disagreements,
      sources,
      status: "enriched",
    })
  }

  try {
    return await run()
  } catch (error) {
    const message = error instanceof ResearchError ? error.message : "Unexpected error while researching this story"
    if (!(error instanceof ResearchError)) log(`Unexpected failure: ${error instanceof Error ? error.name : "unknown error"}`)
    trace.notes.push(`Research failed: ${message}`)
    return finish(emptyStory(article, "failed", message))
  }
}

async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await task(items[index])
    }
  })
  await Promise.all(workers)
  return results
}

/**
 * articles -> Tavily search/extract -> LLM source selection and synthesis -> enriched stories. Knows nothing about
 * scripts or audio. A story that cannot be researched becomes "insufficient" or "failed"; it never breaks the others.
 */
export async function researchStories(
  { articles, debug = false }: { articles: Article[]; debug?: boolean },
  config: ResearcherConfig,
): Promise<ResearchResponse> {
  const { modelName, log = researchLog, clock = () => performance.now() } = config
  log(`Stories to research: ${articles.length}`)
  const startedAt = clock()

  const outcomes = await mapWithConcurrency(articles, STORY_CONCURRENCY, async (article) => {
    const storyStartedAt = clock()
    const outcome = await researchStory(article, config, debug)
    log(`"${article.title.slice(0, 60)}": ${outcome.story.status} in ${((clock() - storyStartedAt) / 1000).toFixed(1)}s`)
    return outcome
  })

  const stories = outcomes.map(({ story }) => story)
  const count = (status: ResearchStatus) => stories.filter((story) => story.status === status).length
  const stats = {
    requested: articles.length,
    enriched: count("enriched"),
    insufficient: count("insufficient"),
    failed: count("failed"),
    model: modelName,
    tavilySearches: outcomes.reduce((sum, outcome) => sum + outcome.searches, 0),
    tavilyExtractions: outcomes.reduce((sum, outcome) => sum + outcome.extractions, 0),
    durationMs: clock() - startedAt,
  }
  log(`Enriched ${stats.enriched}, insufficient ${stats.insufficient}, failed ${stats.failed} in ${(stats.durationMs / 1000).toFixed(1)}s`)
  return { stories, stats }
}
