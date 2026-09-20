import { describe, expect, it, vi } from "vitest"
import { createElevenLabsClient, looksLikeMp3 } from "./elevenlabs.js"
import { AudioError } from "./errors.js"

const MP3 = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x01, 0x02])
const request = { text: "Hello there.", voiceId: "21m00Tcm4TlvDq8ikWAM", modelId: "eleven_multilingual_v2" }

function clientReturning(response: Response | Error) {
  const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => {
    if (response instanceof Error) throw response
    return response
  })
  return { client: createElevenLabsClient({ apiKey: "xi-secret-key", fetchImpl }), fetchImpl }
}

const errorBody = (status: string, code: number) =>
  new Response(JSON.stringify({ detail: { status, message: "upstream words xi-secret-key" } }), { status: code })

async function failureOf(promise: Promise<unknown>): Promise<AudioError> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  )
  expect(error).toBeInstanceOf(AudioError)
  return error as AudioError
}

describe("createElevenLabsClient.synthesize", () => {
  it("posts the text with the key in a header only and returns the MP3 bytes", async () => {
    const { client, fetchImpl } = clientReturning(new Response(MP3, { headers: { "Content-Type": "audio/mpeg" } }))

    const speech = await client.synthesize(request)

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM?output_format=mp3_44100_128")
    expect(url).not.toContain("xi-secret")
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("xi-secret-key")
    expect(JSON.parse(init.body as string)).toEqual({ text: "Hello there.", model_id: "eleven_multilingual_v2" })
    expect(speech.status).toBe(200)
    expect([...speech.audio]).toEqual([...MP3])
  })

  it.each([
    [401, "auth"],
    [403, "auth"],
    [429, "rate-limit"],
    [404, "upstream"],
    [422, "upstream"],
    [500, "upstream"],
  ] as const)("maps an upstream %i to %s without leaking the upstream message or the key", async (code, kind) => {
    const { client } = clientReturning(errorBody("some_error", code))
    const error = await failureOf(client.synthesize(request))
    expect(error.kind).toBe(kind)
    expect(error.message).toContain("some_error")
    expect(error.message).not.toContain("xi-secret")
    expect(error.message).not.toContain("upstream words")
  })

  it("survives an error body that is not JSON", async () => {
    const { client } = clientReturning(new Response("<html>bad gateway</html>", { status: 502 }))
    expect((await failureOf(client.synthesize(request))).message).toBe("ElevenLabs returned an error (502)")
  })

  it("rejects an empty or non-MP3 success body", async () => {
    for (const body of [new Uint8Array(), new TextEncoder().encode('{"oops":true}')]) {
      const { client } = clientReturning(new Response(body, { headers: { "Content-Type": "audio/mpeg" } }))
      expect((await failureOf(client.synthesize(request))).kind).toBe("invalid-audio")
    }
  })

  it("maps a timeout and a network failure", async () => {
    const timeout = Object.assign(new Error("slow"), { name: "TimeoutError" })
    expect((await failureOf(clientReturning(timeout).client.synthesize(request))).kind).toBe("timeout")
    const network = await failureOf(clientReturning(new Error("ECONNRESET xi-secret-key")).client.synthesize(request))
    expect(network.message).toBe("Could not reach ElevenLabs")
  })
})

describe("looksLikeMp3", () => {
  it("accepts an ID3 tag or an MPEG frame sync and nothing else", () => {
    expect(looksLikeMp3(MP3)).toBe(true)
    expect(looksLikeMp3(new Uint8Array([0xff, 0xfb, 0x90]))).toBe(true)
    expect(looksLikeMp3(new Uint8Array([0x7b, 0x22, 0x64]))).toBe(false)
    expect(looksLikeMp3(new Uint8Array())).toBe(false)
  })
})
