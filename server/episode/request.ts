import { z } from "zod"
import { LANGUAGE_CODES, MAX_DURATION_MINUTES, MIN_DURATION_MINUTES, TONE_IDS } from "../script/options.js"

const MAX_INTERESTS = 10
const MAX_INTEREST_LENGTH = 60

// Deliberately no voice: the voice is server configuration (ELEVENLABS_VOICE_ID). A voice sent anyway is dropped here.
const requestSchema = z.object({
  interests: z.array(z.string().trim().min(1).max(MAX_INTEREST_LENGTH)).min(1).max(MAX_INTERESTS),
  language: z.enum(LANGUAGE_CODES),
  durationMinutes: z.number().int().min(MIN_DURATION_MINUTES).max(MAX_DURATION_MINUTES),
  tone: z.enum(TONE_IDS),
})

export type EpisodeRequest = z.infer<typeof requestSchema>

export type ParsedEpisodeRequest = { ok: true; request: EpisodeRequest } | { ok: false; message: string }

/** Validates the JSON body of POST /api/generate-episode: the user's settings, nothing else. */
export function parseEpisodeRequest(body: unknown): ParsedEpisodeRequest {
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`).join("; ")
    return { ok: false, message }
  }
  return { ok: true, request: parsed.data }
}
