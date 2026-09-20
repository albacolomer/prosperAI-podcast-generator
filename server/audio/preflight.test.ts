import { describe, expect, it, vi } from "vitest"
import { DEFAULT_MODEL, KNOWN_MODELS } from "./elevenlabs.js"
import { checkElevenLabsConfig } from "./preflight.js"

const KEY = "xi-secret-key"
const VOICE = "JBFqnCBsd6RMkjVDRZzb"
const env = (overrides: Record<string, string | undefined> = {}) =>
  ({ ELEVENLABS_API_KEY: KEY, ELEVENLABS_VOICE_ID: VOICE, ...overrides }) as NodeJS.ProcessEnv

function failure(overrides: Record<string, string | undefined>): string {
  const result = checkElevenLabsConfig(env(overrides))
  if (result.ok) throw new Error("expected the preflight to fail")
  return result.message
}

describe("checkElevenLabsConfig", () => {
  it("passes for the configured voice with the default model", () => {
    expect(checkElevenLabsConfig(env())).toEqual({ ok: true })
  })

  it("passes for every model whose limit is known, and treats an empty ELEVENLABS_MODEL_ID as the default", () => {
    for (const model of KNOWN_MODELS) expect(checkElevenLabsConfig(env({ ELEVENLABS_MODEL_ID: model }))).toEqual({ ok: true })
    expect(KNOWN_MODELS).toContain(DEFAULT_MODEL)
    expect(checkElevenLabsConfig(env({ ELEVENLABS_MODEL_ID: "" }))).toEqual({ ok: true })
  })

  it("accepts eleven_flash_v2_5, the model the server is configured with", () => {
    expect(checkElevenLabsConfig(env({ ELEVENLABS_MODEL_ID: "eleven_flash_v2_5" }))).toEqual({ ok: true })
  })

  it("never makes a network request", () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    try {
      checkElevenLabsConfig(env())
      failure({ ELEVENLABS_VOICE_ID: "bad id" })
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("names the missing or blank key and voice", () => {
    expect(failure({ ELEVENLABS_API_KEY: undefined })).toContain("ELEVENLABS_API_KEY")
    expect(failure({ ELEVENLABS_API_KEY: "   " })).toContain("ELEVENLABS_API_KEY")
    expect(failure({ ELEVENLABS_VOICE_ID: undefined })).toContain("ELEVENLABS_VOICE_ID")
    expect(failure({ ELEVENLABS_VOICE_ID: "  " })).toContain("ELEVENLABS_VOICE_ID")
  })

  it("rejects a key with whitespace in it, such as a pasted trailing newline", () => {
    expect(failure({ ELEVENLABS_API_KEY: `${KEY}\n` })).toMatch(/ELEVENLABS_API_KEY.*spaces or line breaks/)
    expect(failure({ ELEVENLABS_API_KEY: `${KEY} ` })).toContain("ELEVENLABS_API_KEY")
  })

  it("rejects a voice id that is not an ElevenLabs voice id (typo, quotes, spaces)", () => {
    for (const voice of [`"${VOICE}"`, ` ${VOICE}`, `${VOICE}\n`, "short", "JBFqnCBsd6RMkjVDRZz-", "x".repeat(41)]) {
      expect(failure({ ELEVENLABS_VOICE_ID: voice })).toMatch(/ELEVENLABS_VOICE_ID is not a valid/)
    }
  })

  it("rejects a model the app has no limit for, and lists the supported ones", () => {
    const message = failure({ ELEVENLABS_MODEL_ID: "eleven_multilingual_v3" })
    expect(message).toContain("ELEVENLABS_MODEL_ID")
    for (const model of KNOWN_MODELS) expect(message).toContain(model)
    expect(failure({ ELEVENLABS_MODEL_ID: " eleven_multilingual_v2" })).toContain("ELEVENLABS_MODEL_ID")
  })

  it("never puts the key, the voice id or a rejected value in its messages", () => {
    const messages = [
      failure({ ELEVENLABS_API_KEY: `${KEY}\n` }),
      failure({ ELEVENLABS_VOICE_ID: `"${VOICE}"` }),
      failure({ ELEVENLABS_MODEL_ID: "typo-model-xyz" }),
    ]
    for (const message of messages) expect(message).not.toMatch(new RegExp(`${KEY}|${VOICE}|typo-model-xyz`))
  })
})
