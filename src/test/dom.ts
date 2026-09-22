/**
 * Helpers for the tests that render real components in jsdom and click them. Nothing here reaches the network: `fetch` is
 * replaced by a small fake server, so no test can call OpenAI, GNews, Tavily or ElevenLabs.
 */
import { vi } from "vitest"
import type { GeneratedEpisode, ScheduleSettingsPayload, ScheduleStatus, StoredPodcast } from "@/types"

/** jsdom lacks the few browser APIs Radix's Select and Switch lean on. */
export function installDomPolyfills() {
  const proto = window.HTMLElement.prototype
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => undefined
  proto.releasePointerCapture ??= () => undefined
  proto.scrollIntoView ??= () => undefined
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  // Nothing plays audio in these tests.
  window.HTMLMediaElement.prototype.load = () => undefined
  window.HTMLMediaElement.prototype.pause = () => undefined
  window.HTMLMediaElement.prototype.play = () => Promise.resolve()
}

type Configured = Extract<ScheduleStatus, { configured: true }>

export const configuredSchedule = (overrides: Partial<Configured> = {}): Configured => ({
  configured: true,
  enabled: false,
  frequency: "daily",
  deliveryTime: "08:00",
  weekday: "mon",
  dayOfMonth: 1,
  language: "en",
  tone: "conversational",
  interests: ["Artificial Intelligence"],
  timeZone: "Europe/Madrid",
  nextDeliveryAt: null,
  run: null,
  paused: null,
  ...overrides,
})

export const generatedEpisode: GeneratedEpisode = {
  id: "generated-1",
  title: "Brand New Podcast Title",
  summary: "A summary.",
  description: "A description.",
  topics: ["Artificial Intelligence"],
  sources: [{ name: "Example News" }],
  durationSeconds: 600,
  // Far in the future, so it is the latest whatever the mock episodes are.
  publishedAt: "2099-01-01T08:00:00.000Z",
  audioUrl: "/api/episode-audio?id=generated-1",
  downloadUrl: "/api/episode-audio?id=generated-1&download=1",
  downloadFilename: "prosperpod-brand-new.mp3",
}

export const generatedEpisode2: GeneratedEpisode = {
  ...generatedEpisode,
  id: "generated-2",
  title: "A Second Real Podcast",
  publishedAt: "2098-01-01T08:00:00.000Z",
  audioUrl: "/api/episode-audio?id=generated-2",
  downloadUrl: "/api/episode-audio?id=generated-2&download=1",
  downloadFilename: "prosperpod-second.mp3",
}

export const generatedEpisode3: GeneratedEpisode = {
  ...generatedEpisode,
  id: "generated-3",
  title: "A Third Real Podcast",
  publishedAt: "2097-01-01T08:00:00.000Z",
  audioUrl: "/api/episode-audio?id=generated-3",
  downloadUrl: "/api/episode-audio?id=generated-3&download=1",
  downloadFilename: "prosperpod-third.mp3",
}

/** A controllable POST /api/generate-episode: lines are pushed by the test, so what the UI shows while it waits can be inspected. */
export class FakeGeneration {
  private controller!: ReadableStreamDefaultController<Uint8Array>
  private readonly encoder = new TextEncoder()
  readonly stream = new ReadableStream<Uint8Array>({ start: (controller) => void (this.controller = controller) })

  send(event: object) {
    this.controller.enqueue(this.encoder.encode(`${JSON.stringify(event)}\n`))
  }

  close() {
    this.controller.close()
  }
}

/**
 * A fake API server on `fetch`: the schedule it holds, the requests it received, and the generation stream a test controls.
 * Anything not listed answers 404, so an unexpected call fails loudly instead of leaving the machine.
 */
export function installFakeApi(
  initial: ScheduleStatus = { configured: false, enabled: false, nextDeliveryAt: null, run: null },
  episodes: StoredPodcast[] = [],
) {
  const api = {
    schedule: initial,
    scheduleSaves: [] as ScheduleSettingsPayload[],
    generation: new FakeGeneration(),
    generationRequests: [] as unknown[],
    calls: [] as string[],
    episodes,
  }

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost")
      const method = init?.method ?? "GET"
      api.calls.push(`${method} ${url.pathname}`)
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

      if (url.pathname === "/api/schedule" && method === "GET") return json(api.schedule)
      if (url.pathname === "/api/schedule" && method === "PUT") {
        const payload = JSON.parse(String(init?.body)) as ScheduleSettingsPayload
        api.scheduleSaves.push(payload)
        const { enabled, ...rest } = payload
        api.schedule = configuredSchedule({ ...rest, enabled, nextDeliveryAt: enabled ? "2099-01-01T07:00:00.000Z" : null })
        return json(api.schedule)
      }
      if (url.pathname === "/api/episodes") return json({ episodes: api.episodes })
      if (url.pathname === "/api/generate-episode" && method === "POST") {
        api.generationRequests.push(JSON.parse(String(init?.body)))
        return new Response(api.generation.stream, { status: 200, headers: { "Content-Type": "application/x-ndjson" } })
      }
      return json({ error: `unexpected request ${method} ${url.pathname}` }, 404)
    }),
  )

  return api
}
