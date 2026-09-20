import { handleGenerateEpisode } from "../server/episode/handler.js"

/**
 * POST /api/generate-episode
 * Body: { interests: string[], language: string, durationMinutes: number, tone: string }
 * The one call the Home page makes. The server runs news -> ranking -> research -> planning -> writing -> validation
 * -> ElevenLabs and streams progress as newline-delimited JSON, ending with the stored episode or the stage that
 * failed. The voice is ELEVENLABS_VOICE_ID on the server; the request never carries one.
 * The individual endpoints (/api/generate-script, /api/generate-audio, ...) stay available for debugging.
 */
export async function POST(request: Request): Promise<Response> {
  return handleGenerateEpisode(request)
}
