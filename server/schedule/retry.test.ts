import { describe, expect, it, vi } from "vitest"
import { AudioError } from "../audio/errors.js"
import type { AudioErrorKind } from "../audio/errors.js"
import { EpisodeGenerationError } from "../episode/errors.js"
import { happyDeps } from "../episode/testKit.js"
import { RankingError } from "../ranking/errors.js"
import { ResearchError } from "../research/errors.js"
import { ScriptError } from "../script/errors.js"
import { classifyFailure, newObservation, observeServices } from "./retry.js"
import type { FailureObservation } from "./retry.js"

const observed = (overrides: Partial<FailureObservation> = {}): FailureObservation => ({ ...newObservation(), ...overrides })
const retryable = (error: unknown, observation = newObservation()) => classifyFailure(error, observation).retryable
const stage = (name: ConstructorParameters<typeof EpisodeGenerationError>[0]) => new EpisodeGenerationError(name)

describe("retryable failures", () => {
  it("retries a provider timeout at any stage", () => {
    expect(retryable(stage("ranking"), observed({ cause: new RankingError("timeout", "timed out") }))).toBe(true)
    expect(retryable(stage("research"), observed({ cause: new ResearchError("timeout", "timed out") }))).toBe(true)
    expect(retryable(stage("script"), observed({ cause: new ScriptError("timeout", "timed out") }))).toBe(true)
    expect(retryable(stage("audio"), observed({ cause: new AudioError("timeout", "timed out") }))).toBe(true)
  })

  it("retries a temporary upstream failure (a dropped connection or a 5xx)", () => {
    expect(retryable(stage("ranking"), observed({ cause: new RankingError("upstream", "The ranking request to OpenAI failed") }))).toBe(true)
    expect(retryable(stage("script"), observed({ cause: new ScriptError("upstream", "OpenAI rejected the planner request (HTTP 503)") }))).toBe(true)
    expect(retryable(stage("research"), observed({ cause: new ResearchError("upstream", "Tavily returned HTTP 502") }))).toBe(true)
    expect(retryable(stage("research"), observed({ cause: new ResearchError("upstream", "Tavily rate limit exceeded") }))).toBe(true)
    expect(retryable(stage("audio"), observed({ cause: new AudioError("upstream", "ElevenLabs returned an error (503)") }))).toBe(true)
    expect(retryable(stage("audio"), observed({ cause: new AudioError("upstream", "Could not reach ElevenLabs") }))).toBe(true)
  })

  it("retries a model answer that came out unusable, and ElevenLabs rate limiting", () => {
    expect(retryable(stage("ranking"), observed({ cause: new RankingError("invalid-output", "no answer") }))).toBe(true)
    expect(retryable(stage("audio"), observed({ cause: new AudioError("rate-limit", "ElevenLabs is rate limiting requests. Try again shortly") }))).toBe(true)
    expect(retryable(stage("audio"), observed({ cause: new AudioError("invalid-audio", "not an MP3") }))).toBe(true)
  })

  it("retries a script the validator refused, which a model may get right the second time", () => {
    expect(retryable(stage("validation"), observed())).toBe(true)
    expect(retryable(stage("script"), observed())).toBe(true)
  })

  it("retries when the news lookup failed for a transient reason", () => {
    expect(retryable(stage("news"), observed({ newsErrors: ["gnews: request failed or timed out"] }))).toBe(true)
    expect(retryable(stage("news"), observed({ newsErrors: ["gnews: HTTP 503", "gnews: API key rejected or daily quota exhausted"] }))).toBe(true)
    expect(retryable(stage("news"), observed({ newsErrors: ["gnews: rate limit exceeded"] }))).toBe(true)
  })

  it("retries a research stage where lookups failed rather than came up short", () => {
    expect(retryable(stage("research"), observed({ researchFailures: 2 }))).toBe(true)
  })
})

describe("permanent failures", () => {
  it("does not retry missing or refused configuration", () => {
    expect(retryable(stage("config"))).toBe(false)
    expect(retryable(stage("ranking"), observed({ cause: new RankingError("not-configured", "no key") }))).toBe(false)
    expect(retryable(stage("audio"), observed({ cause: new AudioError("not-configured", "no voice") }))).toBe(false)
    expect(retryable(stage("audio"), observed({ cause: new AudioError("invalid-config", "bad voice id") }))).toBe(false)
  })

  it.each<AudioErrorKind>(["auth", "not-validated", "empty-script", "script-too-long"])("does not retry an audio %s failure", (kind) => {
    expect(retryable(stage("audio"), observed({ cause: new AudioError(kind, "x") }))).toBe(false)
  })

  it("does not retry an invalid API key or an exhausted quota", () => {
    expect(retryable(stage("research"), observed({ cause: new ResearchError("upstream", "Tavily rejected the API key") }))).toBe(false)
    expect(retryable(stage("research"), observed({ cause: new ResearchError("upstream", "Tavily usage limit exceeded") }))).toBe(false)
    expect(retryable(stage("ranking"), observed({ cause: new RankingError("upstream", "OpenAI rejected the ranking request (HTTP 401)") }))).toBe(false)
    expect(retryable(stage("script"), observed({ cause: new ScriptError("upstream", "OpenAI rejected the writer request (HTTP 429)") }))).toBe(false)
    expect(retryable(stage("audio"), observed({ cause: new AudioError("rate-limit", "ElevenLabs is rate limiting requests (quota_exceeded). Try again shortly") }))).toBe(false)
  })

  it("does not retry a request the provider refused as invalid", () => {
    expect(retryable(stage("script"), observed({ cause: new ScriptError("upstream", "OpenAI rejected the planner request (HTTP 400)") }))).toBe(false)
    expect(retryable(stage("audio"), observed({ cause: new AudioError("upstream", "ElevenLabs refused the request (voice_not_found). Check ELEVENLABS_VOICE_ID and ELEVENLABS_MODEL_ID") }))).toBe(false)
  })

  it("does not retry a failure to save, which comes after the audio was paid for, or a cancellation", () => {
    expect(retryable(stage("storage"))).toBe(false)
    expect(retryable(stage("cancelled"))).toBe(false)
  })

  it("does not retry when nothing says the failure was transient", () => {
    // No articles and no provider complained: there is simply nothing to report on.
    expect(retryable(stage("news"), observed())).toBe(false)
    expect(retryable(stage("news"), observed({ newsErrors: ["gnews: API key rejected or daily quota exhausted"] }))).toBe(false)
    expect(retryable(stage("research"), observed())).toBe(false)
    expect(retryable(stage("audio"), observed({ cause: new Error("something else") }))).toBe(false)
  })

  it("does not retry an error that is not a pipeline failure, and says nothing about it", () => {
    const verdict = classifyFailure(new TypeError("cannot read properties of undefined (reading 'secret-key')"), newObservation())
    expect(verdict.retryable).toBe(false)
    expect(verdict.message).not.toContain("secret-key")
  })
})

describe("the message", () => {
  it("is the pipeline's own safe message for the stage, whatever the cause said", () => {
    const verdict = classifyFailure(stage("audio"), observed({ cause: new AudioError("upstream", "ElevenLabs returned an error (503) sk-secret") }))
    expect(verdict.message).toBe("The episode script was generated, but we couldn't generate the audio.")
  })
})

describe("observeServices", () => {
  it("passes results through unchanged and remembers what a service threw", async () => {
    const deps = happyDeps()
    const observation = newObservation()
    const failing = new RankingError("timeout", "timed out")
    const services = observeServices({ ...deps, rank: vi.fn().mockRejectedValueOnce(failing).mockImplementation(deps.rank) }, observation)

    await expect(services.rank({ interests: ["a"], articles: [], maxStories: 1 })).rejects.toBe(failing)
    expect(observation.cause).toBe(failing)
  })

  it("forgets a cause as soon as a later call succeeds, so a stage is never judged by an old error", async () => {
    const deps = happyDeps()
    const observation = newObservation()
    const services = observeServices({ ...deps, voice: vi.fn().mockRejectedValueOnce(new AudioError("timeout", "t")).mockImplementation(deps.voice) }, observation)

    await expect(services.voice("script")).rejects.toBeInstanceOf(AudioError)
    await services.voice("script")
    expect(observation.cause).toBeUndefined()
  })

  it("records why the news lookup came back empty", async () => {
    const deps = happyDeps()
    const observation = newObservation()
    const empty = { articles: [], errors: [{ interest: "AI", message: "gnews: HTTP 503" }], stats: { interests: 1, raw: 0, invalid: 0, duplicateUrl: 0, similarTitle: 0, final: 0 } }
    const services = observeServices({ ...deps, news: { fetchCandidateArticles: vi.fn(async () => empty) } }, observation)

    await services.news.fetchCandidateArticles({ interests: ["AI"] })
    expect(observation.newsErrors).toEqual(["gnews: HTTP 503"])
  })
})
