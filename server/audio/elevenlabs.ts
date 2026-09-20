import { AudioError } from "./errors.js"

const API_URL = "https://api.elevenlabs.io/v1/text-to-speech"
/** Recommended by ElevenLabs for long-form narration (audiobooks, podcasts). Override with ELEVENLABS_MODEL_ID. */
export const DEFAULT_MODEL = "eleven_multilingual_v2"
export const OUTPUT_FORMAT = "mp3_44100_128"
// The whole episode is one request and comes back only when fully rendered, which takes a while for a long script.
const REQUEST_TIMEOUT_MS = 180_000

/** Characters one text-to-speech request accepts, per model (ElevenLabs model docs). Unknown models use the smaller limit of the two flash models. */
const MODEL_CHAR_LIMITS: Record<string, number> = {
  eleven_v3: 5_000,
  eleven_multilingual_v2: 10_000,
  eleven_flash_v2: 30_000,
  eleven_flash_v2_5: 40_000,
}
const UNKNOWN_MODEL_CHAR_LIMIT = 30_000

export function charLimitFor(modelId: string): number {
  return MODEL_CHAR_LIMITS[modelId] ?? UNKNOWN_MODEL_CHAR_LIMIT
}

/** The models whose per-request character limit is known here. */
export const KNOWN_MODELS = Object.keys(MODEL_CHAR_LIMITS)

/** ElevenLabs voice ids are 20 alphanumeric characters; checking the shape catches a mistyped setting before a paid call. */
export const VOICE_ID_PATTERN = /^[A-Za-z0-9]{10,40}$/

/** The model the server voices with: ELEVENLABS_MODEL_ID, or the default when it is unset or empty. */
export function modelIdFrom(env: NodeJS.ProcessEnv): string {
  return env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL
}

export interface SpeechRequest {
  text: string
  voiceId: string
  modelId: string
}

export interface Speech {
  audio: Uint8Array
  status: number
}

/** The one ElevenLabs operation the audio step needs. Injectable so tests never touch the network. */
export interface SpeechClient {
  synthesize(request: SpeechRequest): Promise<Speech>
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

interface ElevenLabsClientConfig {
  apiKey: string
  fetchImpl?: FetchLike
}

/** ElevenLabs error bodies are `{ detail: { status: "quota_exceeded", message } }` or, for 422, a `detail` array. Only a short slug is kept. */
async function errorCode(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { detail?: { status?: unknown } }
    const status = body?.detail?.status
    return typeof status === "string" && /^[a-z_]{1,60}$/.test(status) ? status : undefined
  } catch {
    return undefined
  }
}

/** MP3 starts with an ID3 tag or an MPEG frame sync (11 set bits). */
export function looksLikeMp3(bytes: Uint8Array): boolean {
  if (bytes.length < 3) return false
  const id3 = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33
  const frameSync = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0
  return id3 || frameSync
}

/** Calls the ElevenLabs text-to-speech REST API with plain fetch. The key travels only in the xi-api-key header and never appears in errors. */
export function createElevenLabsClient({ apiKey, fetchImpl = fetch }: ElevenLabsClientConfig): SpeechClient {
  return {
    async synthesize({ text, voiceId, modelId }) {
      let response: Response
      try {
        response = await fetchImpl(`${API_URL}/${encodeURIComponent(voiceId)}?output_format=${OUTPUT_FORMAT}`, {
          method: "POST",
          headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
          body: JSON.stringify({ text, model_id: modelId }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
      } catch (error) {
        if (error instanceof Error && error.name === "TimeoutError") {
          throw new AudioError("timeout", "The request to ElevenLabs timed out")
        }
        throw new AudioError("upstream", "Could not reach ElevenLabs")
      }

      if (!response.ok) {
        const code = await errorCode(response)
        const suffix = code ? ` (${code})` : ""
        if (response.status === 401 || response.status === 403) {
          throw new AudioError("auth", `ElevenLabs rejected the API key${suffix}. Check ELEVENLABS_API_KEY`)
        }
        if (response.status === 429) {
          throw new AudioError("rate-limit", `ElevenLabs is rate limiting requests${suffix}. Try again shortly`)
        }
        if (response.status === 404 || response.status === 422) {
          throw new AudioError("upstream", `ElevenLabs refused the request${suffix}. Check ELEVENLABS_VOICE_ID and ELEVENLABS_MODEL_ID`)
        }
        throw new AudioError("upstream", `ElevenLabs returned an error (${response.status})${suffix}`)
      }

      const audio = new Uint8Array(await response.arrayBuffer())
      if (audio.length === 0 || !looksLikeMp3(audio)) {
        throw new AudioError("invalid-audio", "ElevenLabs returned something that is not an MP3")
      }
      return { audio, status: response.status }
    },
  }
}
