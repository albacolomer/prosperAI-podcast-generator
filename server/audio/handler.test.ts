import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "../../api/generate-audio.js"
import { signValidatedScript } from "./token.js"

const MP3 = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00])
const VOICE = "21m00Tcm4TlvDq8ikWAM"
const SECRET = "sk-secret-key"
const script = "Hook.\n\nStory.\n\nBye."
const valid = { script, language: "en", audioToken: signValidatedScript({ script, language: "en" }, SECRET) }

function post(body: unknown) {
  return POST(new Request("http://localhost/api/generate-audio", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }))
}

describe("POST /api/generate-audio", () => {
  const keys = ["ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID", "ELEVENLABS_MODEL_ID", "OPENAI_API_KEY"]
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.spyOn(console, "log").mockImplementation(() => {})
    fetchMock.mockReset()
    fetchMock.mockImplementation(async () => new Response(MP3, { headers: { "Content-Type": "audio/mpeg" } }))
    vi.stubGlobal("fetch", fetchMock)
    process.env.ELEVENLABS_API_KEY = "xi-secret-key"
    process.env.ELEVENLABS_VOICE_ID = VOICE
    process.env.OPENAI_API_KEY = SECRET
    delete process.env.ELEVENLABS_MODEL_ID
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it("returns the MP3 for a script the server signed, sending only the narration to ElevenLabs", async () => {
    const response = await post(valid)

    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("audio/mpeg")
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([...MP3])
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`/text-to-speech/${VOICE}`)
    expect(JSON.parse(init.body as string)).toEqual({ text: script, model_id: "eleven_multilingual_v2" })
  })

  it("uses ELEVENLABS_MODEL_ID when set", async () => {
    process.env.ELEVENLABS_MODEL_ID = "eleven_flash_v2_5"
    await post(valid)
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toMatchObject({ model_id: "eleven_flash_v2_5" })
  })

  it("refuses a script that was not signed, was edited, or has another language, without calling ElevenLabs", async () => {
    for (const body of [
      { ...valid, audioToken: "forged" },
      { script, language: "en", audioToken: signValidatedScript({ script, language: "en" }, "another-secret") },
      { ...valid, script: `${script}\n\nAn extra unvalidated claim.` },
      { ...valid, language: "es" },
    ]) {
      const response = await post(body)
      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ error: "Only a script that passed validation can be voiced" })
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("returns 400 for a body that is not JSON or is malformed", async () => {
    expect((await post("{nope")).status).toBe(400)
    expect((await post({ ...valid, audioToken: undefined })).status).toBe(400)
    expect((await post({ ...valid, language: "klingon" })).status).toBe(400)
    expect((await post({ ...valid, script: 5 })).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("returns 413 for an oversized body", async () => {
    expect((await post("x".repeat(300_001))).status).toBe(413)
  })

  it("returns 503 with a generic message when a key is missing", async () => {
    for (const key of ["ELEVENLABS_API_KEY", "OPENAI_API_KEY"]) {
      const original = process.env[key]
      delete process.env[key]
      const response = await post(valid)
      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({ error: "Audio generation is not configured" })
      process.env[key] = original
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("returns 503 naming the setting when the voice is missing or malformed", async () => {
    delete process.env.ELEVENLABS_VOICE_ID
    let response = await post(valid)
    expect(response.status).toBe(503)
    expect(((await response.json()) as { error: string }).error).toContain("ELEVENLABS_VOICE_ID")

    process.env.ELEVENLABS_VOICE_ID = "nova"
    response = await post(valid)
    expect(response.status).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("returns 422 for an empty script that carries a valid signature", async () => {
    const empty = { script: "  ", language: "en", audioToken: signValidatedScript({ script: "  ", language: "en" }, SECRET) }
    expect((await post(empty)).status).toBe(422)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("maps ElevenLabs failures to safe errors that never contain a key", async () => {
    for (const [upstream, expected] of [
      [401, 502],
      [429, 429],
      [500, 502],
    ] as const) {
      fetchMock.mockImplementation(async () => new Response(JSON.stringify({ detail: { status: "x", message: "xi-secret-key" } }), { status: upstream }))
      const response = await post(valid)
      const text = await response.text()
      expect(response.status).toBe(expected)
      expect(text).not.toContain("xi-secret")
      expect(text).not.toContain(SECRET)
    }
  })

  it("returns 502 when ElevenLabs answers 200 with something that is not audio", async () => {
    fetchMock.mockImplementation(async () => new Response('{"detail":"nope"}', { status: 200 }))
    expect((await post(valid)).status).toBe(502)
  })
})
