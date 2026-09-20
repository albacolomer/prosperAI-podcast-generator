import { generateAudio } from "../server/audio/audio.js"
import { createElevenLabsClient, DEFAULT_MODEL } from "../server/audio/elevenlabs.js"
import { AudioError, statusForAudioError } from "../server/audio/errors.js"
import { parseAudioRequest } from "../server/audio/request.js"
import { isValidatedScript } from "../server/audio/token.js"

const MAX_BODY_CHARS = 300_000

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

/**
 * POST /api/generate-audio
 * Body: { script: string, language: string, audioToken: string }, exactly the `script`, the request's language and
 * the `audioToken` that POST /api/generate-script returned. The token is the server's signature over a script that
 * passed validation, so a script that failed (no token is issued) or was edited afterwards is refused before anything
 * is sent to ElevenLabs. On success the response body is the MP3 (audio/mpeg). The ElevenLabs key stays here.
 * The voice and model come from ELEVENLABS_VOICE_ID and ELEVENLABS_MODEL_ID.
 */
export async function POST(request: Request): Promise<Response> {
  const text = await request.text()
  if (text.length > MAX_BODY_CHARS) return json({ error: "Request body is too large" }, 413)

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return json({ error: "Request body must be valid JSON" }, 400)
  }

  const parsed = parseAudioRequest(body)
  if (!parsed.ok) return json({ error: parsed.message }, 400)
  const { script, language, audioToken } = parsed.request

  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    console.error("ELEVENLABS_API_KEY is not set; the audio endpoint cannot call ElevenLabs.")
    return json({ error: "Audio generation is not configured" }, 503)
  }
  // The signing secret is the OpenAI key, which script generation cannot run without either.
  const signingSecret = process.env.OPENAI_API_KEY
  if (!signingSecret) {
    console.error("OPENAI_API_KEY is not set; the audio endpoint cannot verify that a script passed validation.")
    return json({ error: "Audio generation is not configured" }, 503)
  }

  if (!isValidatedScript({ script, language }, audioToken, signingSecret)) {
    return json({ error: "Only a script that passed validation can be voiced" }, 403)
  }

  try {
    const { audio } = await generateAudio(script, {
      client: createElevenLabsClient({ apiKey }),
      voiceId: process.env.ELEVENLABS_VOICE_ID,
      modelId: process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL,
    })
    return new Response(audio, {
      headers: { "Content-Type": "audio/mpeg", "Content-Length": String(audio.length), "Cache-Control": "no-store" },
    })
  } catch (error) {
    if (error instanceof AudioError) {
      console.error(`[Audio] ${error.kind}: ${error.message}`)
      return json({ error: error.message }, statusForAudioError(error))
    }
    console.error("[Audio] Unexpected failure", error instanceof Error ? error.name : "unknown error")
    return json({ error: "Unexpected error while generating the audio" }, 500)
  }
}
