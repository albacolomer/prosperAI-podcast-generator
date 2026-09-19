import type { NewsResponse } from "../src/types/article.js"
import { GNewsProvider } from "../server/news/providers/gnews.js"
import { parseNewsQuery } from "../server/news/request.js"
import { createNewsService } from "../server/news/service.js"

// Created once per server instance so the service's in-memory cache survives across requests.
let service: ReturnType<typeof createNewsService> | undefined

function getService() {
  const apiKey = process.env.GNEWS_API_KEY
  if (!apiKey) return undefined
  service ??= createNewsService({ providers: [new GNewsProvider(apiKey)] })
  return service
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

/** GET /api/news?interests=Artificial%20Intelligence,Startups&language=en&days=3 */
export async function GET(request: Request): Promise<Response> {
  const query = parseNewsQuery(new URL(request.url))
  if (!query.ok) return json({ error: query.message }, 400)

  const newsService = getService()
  if (!newsService) {
    console.error("GNEWS_API_KEY is not set; the news endpoint cannot query GNews.")
    return json({ error: "News provider is not configured" }, 503)
  }

  const result: NewsResponse = await newsService.fetchCandidateArticles(query.options)
  // Every lookup failed and nothing came back: that is an upstream failure, not an empty news day.
  const status = result.articles.length === 0 && result.errors.length > 0 ? 502 : 200
  return json(result, status)
}
