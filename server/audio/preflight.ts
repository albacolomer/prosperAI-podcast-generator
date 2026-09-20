import { KNOWN_MODELS, modelIdFrom, VOICE_ID_PATTERN } from "./elevenlabs.js"

export type Preflight = { ok: true } | { ok: false; message: string }

const fail = (message: string): Preflight => ({ ok: false, message })

/**
 * Checks the ElevenLabs settings that can be checked without calling ElevenLabs, so a mistake is found before the
 * minutes of news, ranking, research and writing that come first rather than after. It never makes a request (no
 * synthesis, no voice or quota lookup) and never puts a key or a voice id in its messages. What it cannot see (a
 * revoked key, a voice this account cannot use, an exhausted quota) still surfaces at the audio step, and the script
 * length is still checked there against the model's limit once the script exists.
 */
export function checkElevenLabsConfig(env: NodeJS.ProcessEnv): Preflight {
  const apiKey = env.ELEVENLABS_API_KEY
  if (!apiKey?.trim()) return fail("ELEVENLABS_API_KEY is not set on the server.")
  // A pasted key with a stray space or line break cannot be sent as a header.
  if (/\s/.test(apiKey)) return fail("ELEVENLABS_API_KEY contains spaces or line breaks. Paste the key again without them.")

  const voiceId = env.ELEVENLABS_VOICE_ID
  if (!voiceId?.trim()) return fail("ELEVENLABS_VOICE_ID is not set on the server.")
  if (!VOICE_ID_PATTERN.test(voiceId)) {
    return fail("ELEVENLABS_VOICE_ID is not a valid ElevenLabs voice id (letters and digits only, no spaces or quotes).")
  }

  const modelId = modelIdFrom(env)
  // A model the app has no limit for would run with a guessed limit and, if misspelled, fail only when ElevenLabs refuses it.
  if (!KNOWN_MODELS.includes(modelId)) {
    return fail(`ELEVENLABS_MODEL_ID is not a supported model. Use one of: ${KNOWN_MODELS.join(", ")}.`)
  }

  return { ok: true }
}
