import { z } from "zod"
import { EPISODE_DURATION_MINUTES, LANGUAGE_CODES, TONE_IDS } from "../script/options.js"

const MAX_INTERESTS = 10
const MAX_INTEREST_LENGTH = 60

// Deliberately no voice and no duration: the voice is server configuration (ELEVENLABS_VOICE_ID) and every episode is
// EPISODE_DURATION_MINUTES long. Either one sent anyway is dropped here.
const requestSchema = z.object({
  interests: z.array(z.string().trim().min(1).max(MAX_INTEREST_LENGTH)).min(1).max(MAX_INTERESTS),
  language: z.enum(LANGUAGE_CODES),
  tone: z.enum(TONE_IDS),
})

export type EpisodeRequest = z.infer<typeof requestSchema> & { durationMinutes: number }

export type ParsedEpisodeRequest = { ok: true; request: EpisodeRequest } | { ok: false; message: string }

/** Validates the JSON body of POST /api/generate-episode: the user's settings, nothing else. The duration is always fixed. */
export function parseEpisodeRequest(body: unknown): ParsedEpisodeRequest {
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`).join("; ")
    return { ok: false, message }
  }
  return { ok: true, request: { ...parsed.data, durationMinutes: EPISODE_DURATION_MINUTES } }
}
