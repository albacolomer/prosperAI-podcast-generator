import { listEpisodes } from "../server/episode/list.js"
import { createEpisodeStore } from "../server/episode/storage.js"

/**
 * GET /api/episodes
 * The generated podcasts stored on the server, newest first, each with the links that play and download its MP3.
 * Read-only: it never calls ElevenLabs or any other provider.
 */
export async function GET(): Promise<Response> {
  return listEpisodes(createEpisodeStore())
}
