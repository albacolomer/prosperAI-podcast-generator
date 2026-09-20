import { z } from "zod"

export const MAX_RESEARCH_STORIES = 12
const MAX_INTERESTS = 10
const MAX_INTEREST_LENGTH = 60

// Same shape as the article the news pipeline returns and /api/rank-news accepts. Copied rather than shared,
// like the script module does, so this stage stays self-contained.
const articleSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().min(1).max(500),
  description: z.string().max(2000),
  url: z.string().max(2048),
  source: z.string().max(200),
  imageUrl: z.string().max(2048).optional(),
  publishedAt: z.string().max(40),
  interests: z.array(z.string().max(MAX_INTEREST_LENGTH)).max(MAX_INTERESTS),
})

const requestSchema = z
  .object({
    articles: z.array(articleSchema).min(1).max(MAX_RESEARCH_STORIES),
    /** Also return the per-story trace (queries, candidates, extraction and validation results). */
    debug: z.boolean().optional(),
  })
  .superRefine(({ articles }, ctx) => {
    // Ids are how results are mapped back to stories, so they must be unambiguous.
    const seen = new Set<string>()
    for (const [index, article] of articles.entries()) {
      if (seen.has(article.id)) {
        ctx.addIssue({ code: "custom", path: ["articles", index, "id"], message: "duplicate article id" })
      }
      seen.add(article.id)
    }
  })

export type ResearchRequest = z.infer<typeof requestSchema>

export type ParsedResearchRequest = { ok: true; request: ResearchRequest } | { ok: false; message: string }

/** Validates the JSON body of POST /api/research-news. */
export function parseResearchRequest(body: unknown): ParsedResearchRequest {
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`).join("; ")
    return { ok: false, message }
  }
  return { ok: true, request: parsed.data }
}
