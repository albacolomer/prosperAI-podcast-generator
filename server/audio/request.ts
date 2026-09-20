import { z } from "zod"
import { LANGUAGE_CODES } from "../script/options.js"

// Bounds the payload only: the real length limit is the ElevenLabs model's (see elevenlabs.ts).
const MAX_SCRIPT_CHARS = 100_000

const requestSchema = z.object({
  /** The validated script exactly as POST /api/generate-script returned it (every segment's text, in order). */
  script: z.string().max(MAX_SCRIPT_CHARS),
  language: z.enum(LANGUAGE_CODES),
  /** The server's signature over the script, issued only for a script that passed validation. */
  audioToken: z.string().min(1).max(200),
})

export type AudioRequest = z.infer<typeof requestSchema>

export type ParsedAudioRequest = { ok: true; request: AudioRequest } | { ok: false; message: string }

/** Validates the JSON body of POST /api/generate-audio. */
export function parseAudioRequest(body: unknown): ParsedAudioRequest {
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`).join("; ")
    return { ok: false, message }
  }
  return { ok: true, request: parsed.data }
}
