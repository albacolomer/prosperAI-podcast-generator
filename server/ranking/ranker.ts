import { z } from "zod"
import type { Article } from "../../src/types/article.js"
import type { RankedStory, RankingResponse } from "../../src/types/ranking.js"
import type { NewsLogger } from "../news/log.js"
import { RankingError } from "./errors.js"
import { rankingLog } from "./log.js"
import { buildRankingUserPrompt, RANKING_SYSTEM_PROMPT } from "./prompt.js"

export interface RankPrompt {
  system: string
  user: string
}

/** Sends the prompt to the LLM and returns its raw structured (JSON) answer. */
export type RankModel = (prompt: RankPrompt) => Promise<string>

export interface RankStoriesInput {
  interests: string[]
  articles: Article[]
  maxStories: number
}

interface RankerConfig {
  model: RankModel
  modelName: string
  log?: NewsLogger
  clock?: () => number
}

const modelOutputSchema = z.object({
  selected: z.array(
    z.object({
      articleId: z.string(),
      rank: z.number().int(),
      reason: z.string(),
    }),
  ),
})

function invalidOutput(message: string): RankingError {
  return new RankingError("invalid-output", `The ranking model returned an invalid answer: ${message}`)
}

/**
 * Turns the model's raw answer into a trusted selection. The model is never trusted:
 * ids must exist in the input, appear once, and stay within the story budget.
 */
export function parseModelOutput(raw: string, articleIds: ReadonlySet<string>, maxStories: number): RankedStory[] {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    throw invalidOutput("it was not valid JSON")
  }

  const parsed = modelOutputSchema.safeParse(json)
  if (!parsed.success) throw invalidOutput("it did not match the expected shape")

  const { selected } = parsed.data
  if (selected.length > maxStories) {
    throw invalidOutput(`it selected ${selected.length} stories but at most ${maxStories} were allowed`)
  }

  const seen = new Set<string>()
  for (const { articleId } of selected) {
    if (!articleIds.has(articleId)) throw invalidOutput("it referenced an article that was not in the candidate list")
    if (seen.has(articleId)) throw invalidOutput("it selected the same article more than once")
    seen.add(articleId)
  }

  // The model's rank decides the order; ranks are then renumbered so they are always 1..n.
  return [...selected]
    .sort((a, b) => a.rank - b.rank)
    .map(({ articleId, reason }, index) => ({ articleId, rank: index + 1, reason: reason.trim() }))
}

/**
 * candidate articles -> LLM -> selected stories. Only decides what is worth including;
 * it knows nothing about scripts or audio, so those stages can be built independently.
 */
export async function rankStories(
  { interests, articles, maxStories }: RankStoriesInput,
  { model, modelName, log = rankingLog, clock = () => performance.now() }: RankerConfig,
): Promise<RankingResponse> {
  log(`Interests: ${interests.join(", ")}`)
  log(`Candidate articles: ${articles.length}`)
  log(`Requested stories: ${maxStories}`)

  const startedAt = clock()
  const raw = await model({
    system: RANKING_SYSTEM_PROMPT,
    user: buildRankingUserPrompt(interests, articles, maxStories),
  })
  const durationMs = clock() - startedAt

  const selected = parseModelOutput(raw, new Set(articles.map((article) => article.id)), maxStories)

  log(`Selected stories: ${selected.length}`)
  log(`Duration: ${(durationMs / 1000).toFixed(1)}s`)

  return {
    selected,
    stats: { candidates: articles.length, selected: selected.length, model: modelName, durationMs },
  }
}
