import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { EpisodeResult, ProgressEvent } from "@/types"
import { EpisodeGenerationFailure, generateEpisode } from "./episodeApi"

const settings = { interests: ["Artificial Intelligence", "Formula 1"], language: "en", durationMinutes: 10, tone: "conversational" as const }

const result: EpisodeResult = {
  episode: {
    id: "ai-briefing-0a1b2c3d",
    title: "AI Briefing",
    summary: "Summary",
    description: "In this episode: A.",
    topics: settings.interests,
    sources: [{ name: "news.example.com", url: "https://news.example.com/a" }],
    durationSeconds: 538,
    audioUrl: "/api/episode-audio?id=ai-briefing-0a1b2c3d",
    downloadUrl: "/api/episode-audio?id=ai-briefing-0a1b2c3d&download=1",
    downloadFilename: "prosperpod-ai-briefing.mp3",
  },
  stats: {
    newsCandidates: 30,
    rankedStories: 7,
    researchedStories: 5,
    plannedStories: 4,
    coveredStories: 4,
    wordCount: 1472,
    validation: { passed: true, errors: 0, warnings: 1, aiReview: "passed" },
    audioBytes: 8_600_000,
    timingsMs: { news: 1, ranking: 1, research: 1, script: 1, audio: 1, total: 5 },
  },
}

/** A streamed body, split into the given chunks (which need not fall on line boundaries). */
function streamOf(chunks: string[], status = 200) {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
        controller.close()
      },
    }),
    { status, headers: { "Content-Type": "application/x-ndjson" } },
  )
}
const line = (event: unknown) => `${JSON.stringify(event)}\n`

describe("generateEpisode", () => {
  const fetchMock = vi.fn<typeof fetch>()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it("sends the current settings to /api/generate-episode and nothing else, in particular no voice", async () => {
    fetchMock.mockResolvedValue(streamOf([line({ type: "result", ...result })]))

    // A stale voice on the settings object (an older saved setting) must not travel with the request.
    await generateEpisode({ ...settings, voiceId: "nova", frequency: "daily" } as typeof settings)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/generate-episode")
    expect(init?.method).toBe("POST")
    expect(JSON.parse(init?.body as string)).toEqual(settings)
  })

  it("reports the server's progress as it arrives and resolves with the stored episode", async () => {
    fetchMock.mockResolvedValue(
      streamOf([
        line({ type: "progress", stage: "news", status: "started" }),
        line({ type: "heartbeat" }),
        line({ type: "progress", stage: "news", status: "done" }),
        line({ type: "result", ...result }),
      ]),
    )
    const seen: ProgressEvent[] = []

    const generated = await generateEpisode({ ...settings, onProgress: (event) => seen.push(event) })

    expect(seen).toEqual([
      { stage: "news", status: "started" },
      { stage: "news", status: "done" },
    ])
    expect(generated).toEqual(result)
  })

  it("handles events split across chunks, and a final line without a newline", async () => {
    const text = line({ type: "progress", stage: "research", status: "started" }) + JSON.stringify({ type: "result", ...result })
    fetchMock.mockResolvedValue(streamOf([text.slice(0, 20), text.slice(20, 90), text.slice(90)]))
    const seen: ProgressEvent[] = []

    expect(await generateEpisode({ ...settings, onProgress: (event) => seen.push(event) })).toEqual(result)
    expect(seen).toEqual([{ stage: "research", status: "started" }])
  })

  it("throws the stage's message when the pipeline fails", async () => {
    fetchMock.mockResolvedValue(
      streamOf([
        line({ type: "progress", stage: "audio", status: "started" }),
        line({ type: "error", stage: "audio", message: "The episode script was generated, but we couldn't generate the audio." }),
      ]),
    )

    const error = await generateEpisode(settings).catch((thrown: unknown) => thrown)
    expect(error).toBeInstanceOf(EpisodeGenerationFailure)
    expect(error).toMatchObject({ stage: "audio", message: "The episode script was generated, but we couldn't generate the audio." })
  })

  it("throws when the stream ends without a result", async () => {
    fetchMock.mockResolvedValue(streamOf([line({ type: "progress", stage: "news", status: "started" })]))
    await expect(generateEpisode(settings)).rejects.toThrow(/interrupted/)
  })

  it("throws the server's message for a rejected request", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "Episode generation is not configured" }, { status: 503 }))
    await expect(generateEpisode(settings)).rejects.toThrow("Episode generation is not configured")

    fetchMock.mockResolvedValue(new Response("<html>", { status: 502 }))
    await expect(generateEpisode(settings)).rejects.toThrow("Episode request failed (502)")
  })
})
