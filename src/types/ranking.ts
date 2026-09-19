/** One article the ranker chose for the episode. Rank 1 is the strongest story. */
export interface RankedStory {
  articleId: string
  rank: number
  /** Short editorial rationale from the model, for debugging. */
  reason: string
}

export interface RankingStats {
  candidates: number
  selected: number
  model: string
  /** Time spent on the OpenAI call, in milliseconds. */
  durationMs: number
}

export interface RankingResponse {
  selected: RankedStory[]
  stats: RankingStats
}
