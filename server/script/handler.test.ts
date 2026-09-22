import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "../../api/generate-script.js"
import type { ScriptResponse } from "../../src/types/script.js"
import { signValidatedScript } from "../audio/token.js"
import { ScriptError } from "./errors.js"
import { enrichedStory, modelPlanOf } from "./fixtures.js"
import type { PlannerModel } from "./planner.js"
import type { ReviewModel } from "./review.js"
import type { ScriptModel } from "./writer.js"

// The handler builds its models through these factories; tests swap in fakes so OpenAI is never called.
type Config = { apiKey: string; modelName: string }
const createScript = vi.hoisted(() => vi.fn<(config: Config) => ScriptModel>())
const createPlanner = vi.hoisted(() => vi.fn<(config: Config) => PlannerModel>())
const createReview = vi.hoisted(() => vi.fn<(config: Config) => ReviewModel>())
vi.mock("./openai.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./openai.js")>()),
  createOpenAiScriptModel: createScript,
  createOpenAiPlannerModel: createPlanner,
  createOpenAiReviewModel: createReview,
}))

const valid = {
  interests: ["AI"],
  language: "en",
  durationMinutes: 5,
  tone: "storytelling",
  stories: [{ rank: 1, story: enrichedStory("a") }],
}

const planAnswer = JSON.stringify(modelPlanOf(["a"]))
const goodAnswer = JSON.stringify({
  title: "A Title",
  segments: [
    { type: "hook", text: "Hook.", articleIds: [] },
    { type: "story", text: "Story.", articleIds: ["a"] },
    { type: "outro", text: "Bye.", articleIds: [] },
  ],
})
const cleanReview = JSON.stringify({ issues: [] })

function useModels({ plan = planAnswer, script = goodAnswer, review = cleanReview }: { plan?: string | Error; script?: string | Error; review?: string | Error } = {}) {
  const answer = (value: string | Error) => async () => {
    if (value instanceof Error) throw value
    return value
  }
  createPlanner.mockReturnValue(answer(plan))
  createScript.mockReturnValue(answer(script))
  createReview.mockReturnValue(answer(review))
}

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/generate-script", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  )
}

describe("POST /api/generate-script", () => {
  const saved = Object.fromEntries(["OPENAI_API_KEY", "OPENAI_SCRIPT_MODEL", "OPENAI_PLANNER_MODEL", "OPENAI_VALIDATOR_MODEL"].map((key) => [key, process.env[key]]))

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.spyOn(console, "log").mockImplementation(() => {})
    createScript.mockReset()
    createPlanner.mockReset()
    createReview.mockReset()
    for (const key of ["OPENAI_SCRIPT_MODEL", "OPENAI_PLANNER_MODEL", "OPENAI_VALIDATOR_MODEL"]) delete process.env[key]
  })

  afterEach(() => {
    vi.restoreAllMocks()
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it("returns 400 for a body that is not JSON", async () => {
    expect((await post("{nope")).status).toBe(400)
  })

  it("returns 413 for an oversized body", async () => {
    expect((await post("x".repeat(1_000_001))).status).toBe(413)
  })

  it("returns 400 for a malformed request, before touching OpenAI", async () => {
    process.env.OPENAI_API_KEY = "sk-test"
    for (const [field, value] of [
      ["durationMinutes", 4],
      ["durationMinutes", 61],
      ["tone", "sarcastic"],
      ["language", "klingon"],
      ["stories", []],
    ] as const) {
      const response = await post({ ...valid, [field]: value })
      expect(response.status).toBe(400)
      expect(((await response.json()) as { error: string }).error).toContain(field)
    }
    expect(createPlanner).not.toHaveBeenCalled()
  })

  it("returns 400 for a story Research could not substantiate, before touching OpenAI", async () => {
    process.env.OPENAI_API_KEY = "sk-test"
    for (const status of ["insufficient", "failed"] as const) {
      const stories = [valid.stories[0], { rank: 2, story: enrichedStory("b", { status, statusReason: "no usable sources" }) }]
      const response = await post({ ...valid, stories })

      expect(response.status).toBe(400)
      const { error } = (await response.json()) as { error: string }
      expect(error).toContain("stories.1.story.status")
      expect(error).toContain("enriched")
    }
    expect(createPlanner).not.toHaveBeenCalled()
  })

  it("has no raw-article fallback: the pre-research request shape is refused", async () => {
    process.env.OPENAI_API_KEY = "sk-test"
    const article = { id: "a", title: "Title", description: "Description", url: "https://example.com/a", source: "Example", publishedAt: "2026-09-18T10:00:00.000Z", interests: ["AI"] }
    const response = await post({ ...valid, stories: [{ article, rank: 1, reason: "Big news" }] })

    expect(response.status).toBe(400)
    expect(((await response.json()) as { error: string }).error).toContain("stories.0.story")
    expect(createPlanner).not.toHaveBeenCalled()
  })

  it("returns 503 without leaking anything when the OpenAI key is missing", async () => {
    delete process.env.OPENAI_API_KEY
    const response = await post(valid)

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: "Script generation is not configured" })
    expect(createPlanner).not.toHaveBeenCalled()
  })

  it("returns the script with its plan and validation, without echoing the key", async () => {
    process.env.OPENAI_API_KEY = "sk-secret-key"
    useModels()

    const response = await post(valid)
    const text = await response.text()

    expect(response.status).toBe(200)
    expect(text).not.toContain("sk-")
    const body = JSON.parse(text) as ScriptResponse
    expect(body.title).toBe("A Title")
    expect(body.script).toBe("Hook.\n\nStory.\n\nBye.")
    expect(body.segments).toHaveLength(3)
    expect(body.stats).toMatchObject({ targetWords: 750, model: "gpt-5.5" })
    expect(body.plan.stories.map((s) => s.storyId)).toEqual(["a"])
    expect(body.validation.stats).toMatchObject({ targetWords: 750, maxWords: 863, aiReview: "passed" })
    expect(body.stages.planner.model).toBe("gpt-5-mini")
    expect(body.audioToken).toBe(signValidatedScript({ script: body.script, language: "en" }, "sk-secret-key"))
    expect(createScript).toHaveBeenCalledWith({ apiKey: "sk-secret-key", modelName: "gpt-5.5" })
  })

  it("reports a failed validation as 200 with passed: false, not as an error", async () => {
    process.env.OPENAI_API_KEY = "sk-test"
    // The hook is missing, which is a structural error the validator reports.
    useModels({ script: JSON.stringify({ title: "T", segments: [{ type: "story", text: "Story.", articleIds: ["a"] }, { type: "outro", text: "Bye.", articleIds: [] }] }) })

    const response = await post(valid)
    expect(response.status).toBe(200)
    const body = (await response.json()) as ScriptResponse
    expect(body.validation.passed).toBe(false)
    expect(body.validation.issues.map((issue) => issue.type)).toContain("missing-hook")
    // No signature is issued, so the audio endpoint can never voice this script.
    expect(body.audioToken).toBeUndefined()
  })

  it("gives each stage its own model: the writer's setting never changes the planner's or the validator's", async () => {
    process.env.OPENAI_API_KEY = "sk-test"
    process.env.OPENAI_SCRIPT_MODEL = "custom-model"
    useModels()

    let body = (await (await post(valid)).json()) as ScriptResponse
    expect(body.stats.model).toBe("custom-model")
    expect([body.stages.planner.model, body.stages.writer.model, body.stages.validator.model]).toEqual(["gpt-5-mini", "custom-model", "gpt-5-mini"])

    process.env.OPENAI_PLANNER_MODEL = "planner-model"
    process.env.OPENAI_VALIDATOR_MODEL = "validator-model"
    body = (await (await post(valid)).json()) as ScriptResponse
    expect([body.stages.planner.model, body.stages.writer.model, body.stages.validator.model]).toEqual(["planner-model", "custom-model", "validator-model"])
  })

  it("maps script errors from any stage to their status with a safe message", async () => {
    process.env.OPENAI_API_KEY = "sk-secret-key"
    for (const stage of ["plan", "script"] as const) {
      for (const [kind, status] of [
        ["timeout", 504],
        ["upstream", 502],
        ["invalid-output", 502],
      ] as const) {
        useModels({ [stage]: new ScriptError(kind, `safe ${kind} message`) })
        const response = await post(valid)
        expect(response.status).toBe(status)
        expect(await response.json()).toEqual({ error: `safe ${kind} message` })
      }
    }
  })

  it("returns 502 when the planner or the writer answer is malformed", async () => {
    process.env.OPENAI_API_KEY = "sk-test"
    for (const stage of ["plan", "script"] as const) {
      useModels({ [stage]: "definitely not json" })
      const response = await post(valid)
      expect(response.status).toBe(502)
      expect(((await response.json()) as { error: string }).error).toContain("invalid")
    }
  })

  it("returns a generic 500 for unexpected failures without leaking details", async () => {
    process.env.OPENAI_API_KEY = "sk-secret-key"
    useModels({ plan: new Error("boom sk-secret-key") })

    const response = await post(valid)
    const text = await response.text()
    expect(response.status).toBe(500)
    expect(text).not.toContain("sk-")
    expect(text).not.toContain("boom")
  })
})
