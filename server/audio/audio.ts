import type { NewsLogger } from "../news/log.js"
import { AudioError } from "./errors.js"
import { charLimitFor, VOICE_ID_PATTERN } from "./elevenlabs.js"
import type { SpeechClient } from "./elevenlabs.js"
import { audioLog } from "./log.js"

interface AudioConfig {
  client: SpeechClient
  voiceId: string | undefined
  modelId: string
  log?: NewsLogger
  clock?: () => number
}

/**
 * validated script -> ElevenLabs -> one MP3. The script is already the narration (every segment's text, in order,
 * with no ids, scores or citations), so it is sent as it is. Whether the script passed validation is decided by the
 * caller (the handler checks the server's signature) before this runs: nothing here trusts the request.
 */
export async function generateAudio(
  script: string,
  { client, voiceId, modelId, log = audioLog, clock = () => performance.now() }: AudioConfig,
): Promise<{ audio: Uint8Array; durationMs: number }> {
  const text = script.trim()
  if (!text) throw new AudioError("empty-script", "The script has no narration to voice")

  if (!voiceId) throw new AudioError("not-configured", "No ElevenLabs voice is configured. Set ELEVENLABS_VOICE_ID")
  if (!VOICE_ID_PATTERN.test(voiceId)) {
    throw new AudioError("invalid-config", "ELEVENLABS_VOICE_ID is not a valid ElevenLabs voice id")
  }

  const limit = charLimitFor(modelId)
  if (text.length > limit) {
    throw new AudioError(
      "script-too-long",
      `The script is ${text.length} characters but ${modelId} accepts at most ${limit} per request. Set ELEVENLABS_MODEL_ID to a model with a higher limit, such as eleven_flash_v2_5`,
    )
  }

  log(`Voicing ${text.length} characters (voice ${voiceId}, model ${modelId})`)
  const startedAt = clock()
  const speech = await client.synthesize({ text, voiceId, modelId })
  const durationMs = clock() - startedAt
  log(`ElevenLabs ${speech.status}: ${(speech.audio.length / 1024).toFixed(0)} KB of audio in ${(durationMs / 1000).toFixed(1)}s`)
  return { audio: speech.audio, durationMs }
}
