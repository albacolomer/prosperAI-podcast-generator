import { z } from "zod"
import { MAX_CANDIDATES } from "../ranking/request.js"
import { LANGUAGE_CODES, MAX_DURATION_MINUTES, MIN_DURATION_MINUTES, TONE_IDS } from "./options.js"

export const MAX_SCRIPT_STORIES = 20
const MAX_INTERESTS = 10
const MAX_INTEREST_LENGTH = 60

// These limits only bound the payload: Research itself caps quotes and sources but not the number or length
// of claims, and the handler's body limit is the real ceiling.
const MAX_ID_CHARS = 100
const MAX_CLAIM_CHARS = 2000
const MAX_CLAIMS = 100
const MAX_QUOTES = 20
const MAX_SOURCES = 20
const MAX_DISAGREEMENTS = 20

// A claim that no source supports must never be spoken, so an unsourced one is refused rather than passed on.
const sourcedClaimSchema = z.object({
  claim: z.string().trim().min(1).max(MAX_CLAIM_CHARS),
  sourceIds: z.array(z.string().min(1).max(MAX_ID_CHARS)).min(1).max(MAX_SOURCES),
})

const sourceIdSchema = z.string().min(1).max(MAX_ID_CHARS)

/**
 * What Research produced for one story (EnrichedStory), without its debug `trace`. `trace` is deliberately not
 * declared: Zod drops undeclared keys, so it can neither reach the prompt nor bloat the request.
 */
const enrichedStorySchema = z
  .object({
    storyId: z.string().min(1).max(MAX_ID_CHARS),
    headline: z.string().trim().min(1).max(500),
    summary: z.string().max(2000),
    facts: z.array(sourcedClaimSchema).min(1).max(MAX_CLAIMS),
    context: z.array(sourcedClaimSchema).max(MAX_CLAIMS),
    analysis: z.array(sourcedClaimSchema).max(MAX_CLAIMS),
    quotes: z
      .array(
        z.object({
          text: z.string().trim().min(1).max(1000),
          speaker: z.string().trim().min(1).max(200),
          sourceId: sourceIdSchema,
        }),
      )
      .max(MAX_QUOTES),
    disagreements: z
      .array(
        z.object({
          topic: z.string().trim().min(1).max(MAX_CLAIM_CHARS),
          positions: z.array(sourcedClaimSchema).min(1).max(MAX_SOURCES),
        }),
      )
      .max(MAX_DISAGREEMENTS),
    sources: z
      .array(
        z.object({
          id: sourceIdSchema,
          title: z.string().max(500),
          url: z.string().max(2048),
          domain: z.string().min(1).max(253),
          type: z.enum(["primary", "reporting", "context"]),
        }),
      )
      .max(MAX_SOURCES),
    // Research marks stories it could not substantiate "insufficient" or "failed". They are not material.
    status: z.literal("enriched", { error: 'only stories researched as "enriched" can be scripted' }),
    statusReason: z.string().max(1000).optional(),
  })
  .superRefine((story, ctx) => {
    // The prompt tells the writer that every claim can be traced to a listed source, so that must be true.
    const known = new Set(story.sources.map((source) => source.id))
    const check = (path: (string | number)[], ids: string[]) => {
      for (const id of ids) {
        if (!known.has(id)) ctx.addIssue({ code: "custom", path, message: `unknown source id "${id}"` })
      }
    }
    for (const key of ["facts", "context", "analysis"] as const) {
      story[key].forEach((entry, index) => check([key, index, "sourceIds"], entry.sourceIds))
    }
    story.quotes.forEach((quote, index) => check(["quotes", index, "sourceId"], [quote.sourceId]))
    story.disagreements.forEach((entry, index) => {
      entry.positions.forEach((position, positionIndex) =>
        check(["disagreements", index, "positions", positionIndex, "sourceIds"], position.sourceIds),
      )
    })
  })

const scriptStorySchema = z.object({
  /** The ranker's position, kept as given (so gaps are fine once unresearched stories drop out). Importance, not speaking order. */
  rank: z.number().int().min(1).max(MAX_CANDIDATES),
  story: enrichedStorySchema,
})

const requestSchema = z
  .object({
    interests: z.array(z.string().trim().min(1).max(MAX_INTEREST_LENGTH)).min(1).max(MAX_INTERESTS),
    language: z.enum(LANGUAGE_CODES),
    durationMinutes: z.number().int().min(MIN_DURATION_MINUTES).max(MAX_DURATION_MINUTES),
    tone: z.enum(TONE_IDS),
    // Researched stories, in ranking order. Research is the only source of factual content.
    stories: z.array(scriptStorySchema).min(1).max(MAX_SCRIPT_STORIES),
  })
  .superRefine(({ stories }, ctx) => {
    // Ids are how the model's answer is mapped back to stories, so they must be unambiguous.
    const seen = new Set<string>()
    for (const [index, { story }] of stories.entries()) {
      if (seen.has(story.storyId)) {
        ctx.addIssue({ code: "custom", path: ["stories", index, "story", "storyId"], message: "duplicate story id" })
      }
      seen.add(story.storyId)
    }
  })

export type ScriptRequest = z.infer<typeof requestSchema>

export type ParsedScriptRequest = { ok: true; request: ScriptRequest } | { ok: false; message: string }

/** Validates the JSON body of POST /api/generate-script. */
export function parseScriptRequest(body: unknown): ParsedScriptRequest {
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`).join("; ")
    return { ok: false, message }
  }
  return { ok: true, request: parsed.data }
}
