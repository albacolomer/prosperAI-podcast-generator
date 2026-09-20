import { ResearchError, statusForResearchError } from "../server/research/errors.js"
import { createOpenAiResearchModel, DEFAULT_RESEARCH_MODEL } from "../server/research/openai.js"
import { parseResearchRequest } from "../server/research/request.js"
import { researchStories } from "../server/research/researcher.js"
import { createTavilyClient } from "../server/research/tavily.js"

const MAX_BODY_CHARS = 1_000_000

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

/**
 * POST /api/research-news
 * Body: { articles: Article[], debug?: boolean }
 * Researches each article (Tavily search + extract, then OpenAI) into source-backed material. A story that
 * cannot be researched comes back as "insufficient" or "failed" rather than failing the request.
 * The Tavily and OpenAI keys stay here.
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

  const parsed = parseResearchRequest(body)
  if (!parsed.ok) return json({ error: parsed.message }, 400)

  const tavilyKey = process.env.TAVILY_API_KEY
  const openAiKey = process.env.OPENAI_API_KEY
  if (!tavilyKey || !openAiKey) {
    console.error(
      `${!tavilyKey ? "TAVILY_API_KEY" : "OPENAI_API_KEY"} is not set; the research endpoint cannot run.`,
    )
    return json({ error: "Research is not configured" }, 503)
  }

  const modelName = process.env.OPENAI_RESEARCH_MODEL || DEFAULT_RESEARCH_MODEL
  try {
    const result = await researchStories(parsed.request, {
      tavily: createTavilyClient({ apiKey: tavilyKey }),
      model: createOpenAiResearchModel({ apiKey: openAiKey, modelName }),
      modelName,
    })
    return json(result)
  } catch (error) {
    if (error instanceof ResearchError) {
      console.error(`[Research] ${error.kind}: ${error.message}`)
      return json({ error: error.message }, statusForResearchError(error))
    }
    console.error("[Research] Unexpected failure", error instanceof Error ? error.name : "unknown error")
    return json({ error: "Unexpected error while researching stories" }, 500)
  }
}
