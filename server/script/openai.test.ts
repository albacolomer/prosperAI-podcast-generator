import OpenAI from "openai"
import { describe, expect, it, vi } from "vitest"
import { ScriptError } from "./errors.js"
import {
  createOpenAiPlannerModel,
  createOpenAiReviewModel,
  createOpenAiScriptModel,
  outputTokensFor,
  PLAN_JSON_SCHEMA,
  REVIEW_JSON_SCHEMA,
  SCRIPT_JSON_SCHEMA,
  timeoutMsFor,
} from "./openai.js"

const prompt = { system: "system prompt", user: "user prompt", targetWords: 1500 }

function fakeClient(create: () => Promise<unknown>) {
  const spy = vi.fn(create)
  return { client: { responses: { create: spy } } as unknown as OpenAI, spy }
}

async function failureOf(promise: Promise<unknown>): Promise<ScriptError> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  )
  expect(error).toBeInstanceOf(ScriptError)
  return error as ScriptError
}

describe("createOpenAiScriptModel", () => {
  it("requests strict JSON-schema output from the configured model and returns the text", async () => {
    const { client, spy } = fakeClient(async () => ({ status: "completed", output_text: '{"title":"T"}' }))
    const model = createOpenAiScriptModel({ apiKey: "sk-test", client, modelName: "test-model" })

    expect(await model(prompt)).toBe('{"title":"T"}')

    const [params, options] = spy.mock.calls[0] as unknown as [Record<string, unknown>, { timeout: number }]
    expect(params).toMatchObject({
      model: "test-model",
      instructions: "system prompt",
      input: "user prompt",
      store: false,
      reasoning: { effort: "medium" },
      max_output_tokens: outputTokensFor(1500),
      text: { format: { type: "json_schema", strict: true, schema: SCRIPT_JSON_SCHEMA } },
    })
    expect(options.timeout).toBe(timeoutMsFor(1500))
  })

  it("scales the output budget and timeout with the episode length, within limits", () => {
    expect(outputTokensFor(750)).toBeLessThan(outputTokensFor(4500))
    expect(outputTokensFor(4500)).toBeLessThan(outputTokensFor(9000))
    expect(outputTokensFor(1_000_000)).toBeLessThanOrEqual(32_000)
    expect(outputTokensFor(0)).toBeGreaterThan(0)
    expect(timeoutMsFor(750)).toBeLessThan(timeoutMsFor(9000))
    expect(timeoutMsFor(1_000_000)).toBeLessThanOrEqual(300_000)
  })

  it("makes every segment property required, as strict mode demands", () => {
    const segment = SCRIPT_JSON_SCHEMA.properties.segments.items
    expect(segment.required).toEqual(Object.keys(segment.properties))
    expect(SCRIPT_JSON_SCHEMA.required).toEqual(Object.keys(SCRIPT_JSON_SCHEMA.properties))
  })

  it("reports an incomplete response as invalid output", async () => {
    const { client } = fakeClient(async () => ({ status: "incomplete", output_text: '{"title":' }))
    const error = await failureOf(createOpenAiScriptModel({ apiKey: "sk-test", client })(prompt))
    expect(error.kind).toBe("invalid-output")
  })

  it("reports an empty response as invalid output", async () => {
    const { client } = fakeClient(async () => ({ status: "completed", output_text: "" }))
    expect((await failureOf(createOpenAiScriptModel({ apiKey: "sk-test", client })(prompt))).kind).toBe("invalid-output")
  })

  it("maps a timeout to a timeout error", async () => {
    const { client } = fakeClient(async () => {
      throw new OpenAI.APIConnectionTimeoutError()
    })
    expect((await failureOf(createOpenAiScriptModel({ apiKey: "sk-test", client })(prompt))).kind).toBe("timeout")
  })

  it("maps API errors to a safe message that leaks neither the key nor the upstream body", async () => {
    const { client } = fakeClient(async () => {
      throw new OpenAI.AuthenticationError(401, { message: "Incorrect API key provided: sk-secret-key" }, undefined, new Headers())
    })
    const error = await failureOf(createOpenAiScriptModel({ apiKey: "sk-secret-key", client })(prompt))

    expect(error.kind).toBe("upstream")
    expect(error.message).toContain("401")
    expect(error.message).not.toContain("sk-")
  })

  it("maps unexpected failures to a generic upstream error", async () => {
    const { client } = fakeClient(async () => {
      throw new Error("socket hang up sk-secret-key")
    })
    const error = await failureOf(createOpenAiScriptModel({ apiKey: "sk-secret-key", client })(prompt))
    expect(error.kind).toBe("upstream")
    expect(error.message).not.toContain("sk-")
  })
})

describe("the planner and review models", () => {
  const simple = { system: "system prompt", user: "user prompt" }

  it("call the configured model with their own strict schema and reasoning effort", async () => {
    const planned = fakeClient(async () => ({ status: "completed", output_text: "{}" }))
    await createOpenAiPlannerModel({ apiKey: "sk-test", client: planned.client, modelName: "plan-model" })(simple)
    const [planParams] = planned.spy.mock.calls[0] as unknown as [Record<string, unknown>]
    expect(planParams).toMatchObject({
      model: "plan-model",
      instructions: "system prompt",
      input: "user prompt",
      store: false,
      reasoning: { effort: "low" },
      text: { format: { type: "json_schema", name: "episode_plan", strict: true, schema: PLAN_JSON_SCHEMA } },
    })

    const reviewed = fakeClient(async () => ({ status: "completed", output_text: '{"issues":[]}' }))
    expect(await createOpenAiReviewModel({ apiKey: "sk-test", client: reviewed.client, modelName: "review-model" })(simple)).toBe('{"issues":[]}')
    const [reviewParams] = reviewed.spy.mock.calls[0] as unknown as [Record<string, unknown>]
    expect(reviewParams).toMatchObject({
      model: "review-model",
      reasoning: { effort: "medium" },
      text: { format: { type: "json_schema", name: "script_review", strict: true, schema: REVIEW_JSON_SCHEMA } },
    })
  })

  it("make every property required, as strict mode demands", () => {
    expect(PLAN_JSON_SCHEMA.required).toEqual(Object.keys(PLAN_JSON_SCHEMA.properties))
    const planStory = PLAN_JSON_SCHEMA.properties.stories.items
    expect(planStory.required).toEqual(Object.keys(planStory.properties))
    const connection = PLAN_JSON_SCHEMA.properties.connections.items
    expect(connection.required).toEqual(Object.keys(connection.properties))
    const issue = REVIEW_JSON_SCHEMA.properties.issues.items
    expect(issue.required).toEqual(Object.keys(issue.properties))
  })

  it("map failures to safe, kind-specific errors that name the stage and never leak the key", async () => {
    const timeout = fakeClient(async () => {
      throw new OpenAI.APIConnectionTimeoutError()
    })
    const timedOut = await failureOf(createOpenAiPlannerModel({ apiKey: "sk-test", client: timeout.client })(simple))
    expect([timedOut.kind, timedOut.message]).toEqual(["timeout", "The planning request to OpenAI timed out"])

    const broken = fakeClient(async () => {
      throw new Error("socket hang up sk-secret-key")
    })
    const failed = await failureOf(createOpenAiReviewModel({ apiKey: "sk-secret-key", client: broken.client })(simple))
    expect(failed.message).toBe("The review request to OpenAI failed")

    const cut = fakeClient(async () => ({ status: "incomplete", output_text: "{" }))
    expect((await failureOf(createOpenAiPlannerModel({ apiKey: "sk-test", client: cut.client })(simple))).kind).toBe("invalid-output")
  })
})
