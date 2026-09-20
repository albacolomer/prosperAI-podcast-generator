import { describe, expect, it, vi } from "vitest"
import type { ProgressEvent } from "../../src/types/generation.js"
import type { ScriptResponse } from "../../src/types/script.js"
import type { ValidationIssue } from "../../src/types/validation.js"
import { EpisodeGenerationError } from "./errors.js"
import { generateFullEpisode } from "./pipeline.js"
import type { PipelineDeps } from "./pipeline.js"
import { happyDeps, request, scriptResponse, validation } from "./testKit.js"

const ids = ["a", "b"]

const outroLink: ValidationIssue = {
  source: "ai",
  type: "unsupported-connection",
  severity: "error",
  message: "The outro ties the stories together.",
  segmentIndex: 4,
  excerpt: "the same basic rule applies",
  evidenceIds: ["a:f1"],
}
const styleNote: ValidationIssue = { source: "ai", type: "weak-transition", severity: "warning", message: "A transition is abrupt." }
const badQuote: ValidationIssue = {
  source: "deterministic",
  type: "quote-unverified",
  severity: "error",
  message: "Words in quotation marks match no verified quote.",
  segmentIndex: 2,
  excerpt: "we will win everything",
}

/** A script that failed validation with the given issues. */
function rejected(...issues: ValidationIssue[]): ScriptResponse {
  const blocking = issues.filter(({ severity }) => severity === "error").length
  const base = validation({ passed: false })
  return scriptResponse(ids, { validation: { ...base, issues, stats: { ...base.stats, errors: blocking, warnings: issues.length - blocking } } })
}
const accepted = (): ScriptResponse => scriptResponse(ids)

/** A script step that answers with the given responses, one per call, and reports its progress like the real one. */
function scripts(...responses: ScriptResponse[]) {
  let call = 0
  return vi.fn<PipelineDeps["script"]>(async (_input, progress) => {
    progress.planned()
    progress.written()
    const response = responses[Math.min(call, responses.length - 1)]
    call++
    return response
  })
}

const logged = (log: ReturnType<typeof vi.fn>) => log.mock.calls.flat().join("\n")

async function failure(run: Promise<unknown>): Promise<EpisodeGenerationError> {
  const error = await run.then(
    () => undefined,
    (thrown: unknown) => thrown,
  )
  expect(error).toBeInstanceOf(EpisodeGenerationError)
  return error as EpisodeGenerationError
}

describe("the script writing attempts", () => {
  it("first attempt passes: the writer runs once, nothing is retried or saved, and the episode is voiced", async () => {
    const log = vi.fn()
    const deps = happyDeps({ log, script: scripts(accepted()) })

    await generateFullEpisode(request, deps)

    expect(deps.script).toHaveBeenCalledTimes(1)
    expect(vi.mocked(deps.script).mock.calls[0][2]).toBeUndefined()
    expect(deps.voice).toHaveBeenCalledTimes(1)
    expect(deps.store.failedScripts).toEqual([])
    const lines = logged(log)
    expect(lines).toContain("Script attempt 1 of 2")
    expect(lines).toContain("Script attempt 1 of 2: validation PASSED")
    expect(lines).toContain("validation passed on attempt 1 of 2")
    expect(lines).not.toContain("retrying writer")
    expect(lines).not.toContain("Script attempt 2 of 2")
  })

  it("first attempt fails, second passes: the writer runs twice and the pipeline goes on to ElevenLabs", async () => {
    const log = vi.fn()
    const first = rejected(outroLink, styleNote)
    const deps = happyDeps({ log, script: scripts(first, accepted()) })

    const { episode } = await generateFullEpisode(request, deps)

    expect(deps.script).toHaveBeenCalledTimes(2)
    expect(deps.voice).toHaveBeenCalledTimes(1)
    expect(deps.voice).toHaveBeenCalledWith("Welcome. Stories. Bye.")
    expect(episode.title).toBe("AI Chips & Race Cars: Your Briefing")
    expect(deps.store.saved).toHaveLength(1)

    const lines = logged(log)
    const order = ["Script attempt 1 of 2\n", "Script attempt 1 of 2: validation FAILED", "unsupported-connection (segment 4)", "Script attempt 1 failed validation; retrying writer", "Script attempt 2 of 2\n", "Script attempt 2 of 2: validation PASSED", "validation passed on attempt 2 of 2"]
    const positions = order.map((text) => (lines + "\n").indexOf(text))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((x, y) => x - y))
  })

  it("does not run News, Ranking, Research or the Planner again: the retry reuses the same request and the same plan", async () => {
    const first = rejected(outroLink)
    const deps = happyDeps({ script: scripts(first, accepted()) })

    await generateFullEpisode(request, deps)

    expect(deps.news.fetchCandidateArticles).toHaveBeenCalledTimes(1)
    expect(deps.rank).toHaveBeenCalledTimes(1)
    expect(deps.research).toHaveBeenCalledTimes(1)
    const [[firstInput], [secondInput, , retry]] = vi.mocked(deps.script).mock.calls
    // The very same settings and researched stories go to both attempts (the same object, so nothing was rebuilt)...
    expect(secondInput).toBe(firstInput)
    expect(secondInput).toMatchObject({ language: request.language, tone: request.tone, durationMinutes: 10, interests: request.interests })
    // ...and the second attempt is told to write on the plan the first one produced, which is what skips the planner.
    expect(retry?.plan).toBe(first.plan)
  })

  it("gives the second attempt the first attempt's blocking issues, with type, segment, message and excerpt, and no warnings", async () => {
    const deps = happyDeps({ script: scripts(rejected(outroLink, styleNote, badQuote), accepted()) })

    await generateFullEpisode(request, deps)

    const retry = vi.mocked(deps.script).mock.calls[1][2]
    expect(retry?.issues).toEqual([outroLink, badQuote])
    for (const issue of retry?.issues ?? []) {
      expect(issue).toMatchObject({ type: expect.any(String), segmentIndex: expect.any(Number), message: expect.any(String), excerpt: expect.any(String) })
    }
    expect(retry?.issues.map(({ type }) => type)).not.toContain("weak-transition")
  })

  it("both attempts fail: it stops with the validation error, never writes a third time and never calls ElevenLabs", async () => {
    const log = vi.fn()
    const deps = happyDeps({ log, script: scripts(rejected(outroLink), rejected(badQuote)) })

    const error = await failure(generateFullEpisode(request, deps))

    expect(error.stage).toBe("validation")
    expect(error.message).toBe("We couldn't validate this episode reliably.")
    expect(deps.script).toHaveBeenCalledTimes(2)
    expect(deps.voice).not.toHaveBeenCalled()
    expect(deps.store.saved).toEqual([])
    const lines = logged(log)
    expect(lines).toContain("Script attempt 2 of 2: validation FAILED")
    expect(lines).toContain("[ai] unsupported-connection (segment 4)")
    expect(lines).toContain("[deterministic] quote-unverified (segment 2)")
    expect(lines).toContain("did not pass validation (2 of 2 attempts used)")
    expect(lines).not.toContain("attempt 3")
  })

  it("keeps every failed attempt for inspection, with the issues it was given", async () => {
    const first = rejected(outroLink)
    const second = rejected(badQuote)
    const deps = happyDeps({ script: scripts(first, second) })

    await failure(generateFullEpisode(request, deps))

    expect(deps.store.failedScripts).toEqual([
      { attempt: 1, maxAttempts: 2, feedback: [], script: first },
      { attempt: 2, maxAttempts: 2, feedback: [outroLink], script: second },
    ])
  })

  it("keeps the first failed attempt even when the second one passes", async () => {
    const first = rejected(outroLink)
    const deps = happyDeps({ script: scripts(first, accepted()) })

    await generateFullEpisode(request, deps)

    expect(deps.store.failedScripts).toEqual([{ attempt: 1, maxAttempts: 2, feedback: [], script: first }])
  })

  it("a failure to save the debug file changes nothing: the retry still runs and the episode is still voiced", async () => {
    const log = vi.fn()
    const deps = happyDeps({ log, script: scripts(rejected(outroLink), accepted()) })
    deps.store.saveFailedScript = vi.fn(async () => Promise.reject(new Error("disk full")))

    await generateFullEpisode(request, deps)

    expect(deps.script).toHaveBeenCalledTimes(2)
    expect(deps.voice).toHaveBeenCalledTimes(1)
    expect(logged(log)).toContain("Could not save script attempt 1 for inspection")
  })

  it("does not retry a script that only has warnings", async () => {
    // Warnings never block: this is a passing validation, so the first attempt is the only one.
    const passing = scriptResponse(ids, { validation: { ...validation(), issues: [styleNote] } })
    const deps = happyDeps({ script: scripts(passing) })

    await generateFullEpisode(request, deps)

    expect(deps.script).toHaveBeenCalledTimes(1)
  })

  it("does not write again when only the AI review was unavailable: that is not a writing problem", async () => {
    const deps = happyDeps({ script: scripts(scriptResponse(ids, { validation: validation({ aiReview: "unavailable" }) })) })

    expect((await failure(generateFullEpisode(request, deps))).stage).toBe("validation")

    expect(deps.script).toHaveBeenCalledTimes(1)
    expect(deps.voice).not.toHaveBeenCalled()
    expect(deps.store.failedScripts).toHaveLength(1)
  })

  it("a second attempt that throws ends as a script failure, with nothing voiced and no third attempt", async () => {
    let call = 0
    const deps = happyDeps({
      script: vi.fn(async (_input, progress) => {
        progress.planned()
        progress.written()
        if (++call === 2) throw new Error("writer output cut off")
        return rejected(outroLink)
      }),
    })

    expect((await failure(generateFullEpisode(request, deps))).stage).toBe("script")

    expect(deps.script).toHaveBeenCalledTimes(2)
    expect(deps.voice).not.toHaveBeenCalled()
  })

  it("stops between the attempts once the client is gone", async () => {
    const controller = new AbortController()
    const deps = happyDeps({
      signal: controller.signal,
      script: vi.fn(async (_input, progress) => {
        progress.planned()
        progress.written()
        controller.abort()
        return rejected(outroLink)
      }),
    })

    expect((await failure(generateFullEpisode(request, deps))).stage).toBe("cancelled")

    expect(deps.script).toHaveBeenCalledTimes(1)
    expect(deps.voice).not.toHaveBeenCalled()
  })

  it("keeps the planning retry separate: a rejected plan does not use up the writer's second attempt", async () => {
    const log = vi.fn()
    let call = 0
    const deps = happyDeps({
      log,
      script: vi.fn(async (_input, progress) => {
        call++
        if (call === 1) throw Object.assign(new Error("The episode planner returned an invalid plan"), { name: "ScriptError" })
        progress.planned()
        progress.written()
        return call === 2 ? rejected(outroLink) : accepted()
      }),
    })

    await generateFullEpisode(request, deps)

    // Call 1: plan rejected. Call 2: first writing attempt, fails validation. Call 3: the retry, on that plan.
    expect(deps.script).toHaveBeenCalledTimes(3)
    expect(vi.mocked(deps.script).mock.calls.map(([, , retry]) => retry !== undefined)).toEqual([false, false, true])
    expect(logged(log)).toContain("Planning attempt 1 of 3 failed")
    expect(deps.voice).toHaveBeenCalledTimes(1)
  })

  it("shows each stage to the user once, as before, even when the writer runs twice", async () => {
    const events: ProgressEvent[] = []
    const deps = happyDeps({ script: scripts(rejected(outroLink), accepted()) })
    deps.onProgress = (event) => events.push(event)

    await generateFullEpisode(request, deps)

    const keys = events.map(({ stage, status }) => `${stage}:${status}`)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toEqual([
      "news:started", "news:done", "ranking:started", "ranking:done", "research:started", "research:done",
      "planning:started", "planning:done", "writing:started", "writing:done", "checking:started", "checking:done",
      "audio:started", "audio:done",
    ])
  })

  it("does not weaken the gate: a script that fails validation twice is never voiced, whatever the issues", async () => {
    const deps = happyDeps({ script: scripts(rejected(styleNote, outroLink), rejected(styleNote, outroLink)) })

    expect((await failure(generateFullEpisode(request, deps))).stage).toBe("validation")

    expect(deps.voice).not.toHaveBeenCalled()
  })
})
