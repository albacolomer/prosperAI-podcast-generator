import { serveEpisodeAudio } from "../server/episode/audioResponse.js"
import { createEpisodeStore } from "../server/episode/storage.js"

/**
 * GET /api/episode-audio?id=<episode id>[&download=1]
 * Plays or downloads the MP3 stored for a generated episode. It only reads the stored file: it never calls ElevenLabs,
 * and the ElevenLabs key is not involved.
 */
export async function GET(request: Request): Promise<Response> {
  return serveEpisodeAudio(request, createEpisodeStore())
}
