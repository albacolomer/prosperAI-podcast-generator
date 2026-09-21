import type { StoredPodcast } from "../../src/types/generation.js"
import { episodeLinks } from "./storage.js"
import type { EpisodeStore } from "./storage.js"

/**
 * GET /api/episodes
 * Every generated podcast whose audio is stored, newest first: the list the Home page shows, kept on the server so it
 * survives a restart, a new browser or cleared site data. It only reads what is stored and calls no provider.
 */
export async function listEpisodes(store: EpisodeStore): Promise<Response> {
  try {
    const episodes: StoredPodcast[] = (await store.list()).map((episode) => ({ ...episode, ...episodeLinks(episode.id) }))
    return Response.json({ episodes }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("[Episode] Could not list the stored podcasts", error instanceof Error ? error.name : "unknown error")
    return Response.json({ error: "The list of podcasts could not be read" }, { status: 500 })
  }
}
