import type { GenerationEvent } from "../../src/types/generation.js"
import { checkElevenLabsConfig } from "../audio/preflight.js"
import { EpisodeGenerationError } from "./errors.js"
import { generateFullEpisode } from "./pipeline.js"
import { parseEpisodeRequest } from "./request.js"
import { createPipelineServices, missingEnv } from "./services.js"
import type { PipelineServices } from "./services.js"

const MAX_BODY_CHARS = 10_000
// Research and audio are minutes of silence otherwise, and idle connections get closed by proxies.
const HEARTBEAT_MS = 15_000

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

interface HandlerConfig {
  env?: NodeJS.ProcessEnv
  /** Injectable so tests run the real handler with stub services. */
  createServices?: (env: NodeJS.ProcessEnv) => PipelineServices
}

/**
 * POST /api/generate-episode. Body: the user's settings, { interests, language, tone } (no voice, no duration: episodes are
 * always EPISODE_DURATION_MINUTES long). The ElevenLabs settings are checked first, so a bad one answers 503 before any
 * provider is called. Runs the whole pipeline on the server and answers with a stream of newline-delimited JSON events: one "progress"
 * event each time a stage starts or finishes, then exactly one "result" (the stored episode) or "error" (the stage
 * that failed, with a message that is safe to show). The provider keys and the voice never leave the server.
 */
export async function handleGenerateEpisode(request: Request, { env = process.env, createServices = createPipelineServices }: HandlerConfig = {}): Promise<Response> {
  const text = await request.text()
  if (text.length > MAX_BODY_CHARS) return json({ error: "Request body is too large" }, 413)

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return json({ error: "Request body must be valid JSON" }, 400)
  }

  const parsed = parseEpisodeRequest(body)
  if (!parsed.ok) return json({ error: parsed.message }, 400)

  const missing = missingEnv(env)
  if (missing.length > 0) {
    console.error(`${missing.join(", ")} not set; the episode endpoint cannot run the pipeline.`)
    return json({ error: "Episode generation is not configured" }, 503)
  }

  // Before any news, OpenAI or Tavily call: a setting that ElevenLabs is certain to refuse must not cost a whole run.
  const preflight = checkElevenLabsConfig(env)
  if (!preflight.ok) {
    console.error(`[Episode] ElevenLabs preflight failed: ${preflight.message}`)
    return json({ error: preflight.message }, 503)
  }

  const services = createServices(env)
  const cancel = new AbortController()
  request.signal.addEventListener("abort", () => cancel.abort(), { once: true })
  const encoder = new TextEncoder()
  let heartbeat: ReturnType<typeof setInterval> | undefined

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: GenerationEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        } catch {
          // The client went away; the pipeline stops at its next stage boundary.
        }
      }
      heartbeat = setInterval(() => send({ type: "heartbeat" }), HEARTBEAT_MS)

      try {
        const result = await generateFullEpisode(parsed.request, {
          ...services,
          signal: cancel.signal,
          onProgress: (event) => send({ type: "progress", ...event }),
        })
        send({ type: "result", ...result })
      } catch (error) {
        if (error instanceof EpisodeGenerationError) {
          send({ type: "error", stage: error.stage, message: error.message })
        } else {
          console.error("[Episode] Unexpected failure", error instanceof Error ? error.name : "unknown error")
          send({ type: "error", message: "Unexpected error while generating the episode" })
        }
      } finally {
        clearInterval(heartbeat)
        try {
          controller.close()
        } catch {
          // Already closed by a cancelled client.
        }
      }
    },
    cancel() {
      clearInterval(heartbeat)
      cancel.abort()
    },
  })

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  })
}
