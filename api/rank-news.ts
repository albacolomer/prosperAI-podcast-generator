import { RankingError, statusForRankingError } from "../server/ranking/errors.js"
import { createOpenAiRankModel, DEFAULT_RANKING_MODEL } from "../server/ranking/openai.js"
import { rankStories } from "../server/ranking/ranker.js"
import { parseRankRequest } from "../server/ranking/request.js"

const MAX_BODY_CHARS = 1_000_000

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

/**
 * POST /api/rank-news
 * Body: { interests: string[], articles: Article[], maxStories: number }
 * Picks which candidate articles are worth including in the episode. The OpenAI key stays here.
 */
export async function POST(request: Request): Promise<Response> {
  const text = await request.text()
  if (text.length > MAX_BODY_CHARS) return json({ error: "Request body is too large" }, 413)

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return json({ error: "Request body must be valid JSON" }, 400)
  }

  const parsed = parseRankRequest(body)
  if (!parsed.ok) return json({ error: parsed.message }, 400)

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error("OPENAI_API_KEY is not set; the ranking endpoint cannot call OpenAI.")
    return json({ error: "Ranking is not configured" }, 503)
  }

  const modelName = process.env.OPENAI_RANKING_MODEL || DEFAULT_RANKING_MODEL
  try {
    const result = await rankStories(parsed.request, {
      model: createOpenAiRankModel({ apiKey, modelName }),
      modelName,
    })
    return json(result)
  } catch (error) {
    if (error instanceof RankingError) {
      console.error(`[Ranking] ${error.kind}: ${error.message}`)
      return json({ error: error.message }, statusForRankingError(error))
    }
    console.error("[Ranking] Unexpected failure", error instanceof Error ? error.name : "unknown error")
    return json({ error: "Unexpected error while ranking stories" }, 500)
  }
}
