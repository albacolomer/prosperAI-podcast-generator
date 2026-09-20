import { downloadFilename, isEpisodeId } from "./storage.js"
import type { EpisodeStore } from "./storage.js"

function json(body: unknown, status: number): Response {
  return Response.json(body, { status })
}

/** A single `bytes=start-end` range (what <audio> sends to seek). Anything else is served whole. */
function parseRange(header: string | null, size: number): { start: number; end: number } | "unsatisfiable" | undefined {
  const match = header ? /^bytes=(\d*)-(\d*)$/.exec(header.trim()) : null
  if (!match || (match[1] === "" && match[2] === "")) return undefined
  let start: number
  let end: number
  if (match[1] === "") {
    // bytes=-N: the last N bytes.
    start = Math.max(0, size - Number(match[2]))
    end = size - 1
  } else {
    start = Number(match[1])
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1)
  }
  return start >= size || start > end ? "unsatisfiable" : { start, end }
}

/**
 * GET /api/episode-audio?id=<episode id>[&download=1]
 * Serves the MP3 that was generated and stored for an episode: the same bytes for playback and for download, so
 * neither ever calls ElevenLabs. Playback supports Range requests so the player can seek.
 */
export async function serveEpisodeAudio(request: Request, store: EpisodeStore): Promise<Response> {
  const url = new URL(request.url)
  const id = url.searchParams.get("id") ?? ""
  if (!isEpisodeId(id)) return json({ error: "Unknown episode" }, 400)

  const audio = await store.read(id)
  if (!audio) return json({ error: "This episode's audio is no longer available" }, 404)

  const headers: Record<string, string> = {
    "Content-Type": "audio/mpeg",
    "Accept-Ranges": "bytes",
    // The bytes for an id never change, so the browser can keep them.
    "Cache-Control": "private, max-age=31536000, immutable",
  }
  if (url.searchParams.has("download")) {
    headers["Content-Disposition"] = `attachment; filename="${downloadFilename(id)}"`
    return new Response(audio, { headers: { ...headers, "Content-Length": String(audio.length) } })
  }

  const range = parseRange(request.headers.get("Range"), audio.length)
  if (range === "unsatisfiable") return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${audio.length}` } })
  if (range) {
    const part = audio.subarray(range.start, range.end + 1)
    return new Response(part, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${range.start}-${range.end}/${audio.length}`, "Content-Length": String(part.length) },
    })
  }
  return new Response(audio, { headers: { ...headers, "Content-Length": String(audio.length) } })
}
