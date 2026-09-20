import { describe, expect, it, vi } from "vitest"
import { generateAudio } from "./audio.js"
import { charLimitFor, DEFAULT_MODEL } from "./elevenlabs.js"
import type { SpeechClient } from "./elevenlabs.js"
import { AudioError } from "./errors.js"

const VOICE = "21m00Tcm4TlvDq8ikWAM"
const audio = new Uint8Array([0x49, 0x44, 0x33])

function setup(overrides: { voiceId?: string | undefined; modelId?: string } = {}) {
  const synthesize = vi.fn<SpeechClient["synthesize"]>(async () => ({ audio, status: 200 }))
  const config = { client: { synthesize }, voiceId: VOICE, modelId: "eleven_multilingual_v2", log: () => {}, ...overrides }
  return { synthesize, config }
}

async function failureOf(promise: Promise<unknown>): Promise<AudioError> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  )
  expect(error).toBeInstanceOf(AudioError)
  return error as AudioError
}

describe("generateAudio", () => {
  it("sends only the narration, trimmed, with the configured voice and model", async () => {
    const { synthesize, config } = setup()
    const result = await generateAudio("  Hook.\n\nStory.\n\nBye.\n", config)

    expect(synthesize).toHaveBeenCalledWith({ text: "Hook.\n\nStory.\n\nBye.", voiceId: VOICE, modelId: "eleven_multilingual_v2" })
    expect(result.audio).toBe(audio)
  })

  it("refuses an empty script before calling ElevenLabs", async () => {
    const { synthesize, config } = setup()
    expect((await failureOf(generateAudio("  \n ", config))).kind).toBe("empty-script")
    expect(synthesize).not.toHaveBeenCalled()
  })

  it("refuses a missing or malformed voice id before calling ElevenLabs", async () => {
    const missing = setup({ voiceId: undefined })
    expect((await failureOf(generateAudio("Hi.", missing.config))).kind).toBe("not-configured")
    const malformed = setup({ voiceId: "nova" })
    expect((await failureOf(generateAudio("Hi.", malformed.config))).kind).toBe("invalid-config")
    expect(missing.synthesize).not.toHaveBeenCalled()
    expect(malformed.synthesize).not.toHaveBeenCalled()
  })

  it("refuses a script over the model's character limit and names the fix", async () => {
    const { synthesize, config } = setup()
    const error = await failureOf(generateAudio("x".repeat(10_001), config))
    expect(error.kind).toBe("script-too-long")
    expect(error.message).toContain("ELEVENLABS_MODEL_ID")
    expect(synthesize).not.toHaveBeenCalled()

    const flash = setup({ modelId: "eleven_flash_v2_5" })
    await generateAudio("x".repeat(10_001), flash.config)
    expect(flash.synthesize).toHaveBeenCalledOnce()
  })
})

describe("the model's character limit", () => {
  it("knows the limit of eleven_flash_v2_5 (40,000) and of the default model (10,000)", () => {
    expect(charLimitFor("eleven_flash_v2_5")).toBe(40_000)
    expect(charLimitFor(DEFAULT_MODEL)).toBe(10_000)
  })

  it("voices a 10-minute script that runs a little over 10,000 characters in one request on eleven_flash_v2_5", async () => {
    // A real run produced a script of 10,056 characters: refused by eleven_multilingual_v2, well within eleven_flash_v2_5.
    const script = "x".repeat(10_056)
    const multilingual = setup({ modelId: "eleven_multilingual_v2" })
    expect((await failureOf(generateAudio(script, multilingual.config))).kind).toBe("script-too-long")
    expect(multilingual.synthesize).not.toHaveBeenCalled()

    const flash = setup({ modelId: "eleven_flash_v2_5" })
    await generateAudio(script, flash.config)
    expect(flash.synthesize).toHaveBeenCalledTimes(1)
    expect(flash.synthesize.mock.calls[0][0].text).toHaveLength(10_056)
  })

  it("still refuses, without calling ElevenLabs, a script over the flash limit: the backstop stays", async () => {
    const flash = setup({ modelId: "eleven_flash_v2_5" })
    await generateAudio("x".repeat(40_000), flash.config)
    expect(flash.synthesize).toHaveBeenCalledTimes(1)

    const tooLong = setup({ modelId: "eleven_flash_v2_5" })
    const error = await failureOf(generateAudio("x".repeat(40_001), tooLong.config))
    expect(error.kind).toBe("script-too-long")
    expect(error.message).toContain("40000")
    expect(tooLong.synthesize).not.toHaveBeenCalled()
  })
})
