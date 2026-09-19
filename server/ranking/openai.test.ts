import OpenAI from "openai"
import { describe, expect, it, vi } from "vitest"
import { RankingError } from "./errors.js"
import { createOpenAiRankModel } from "./openai.js"

const prompt = { system: "system prompt", user: "user prompt" }

function fakeClient(create: () => Promise<unknown>) {
  const spy = vi.fn(create)
  return { client: { responses: { create: spy } } as unknown as OpenAI, spy }
}

async function failureOf(promise: Promise<unknown>): Promise<RankingError> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  )
  expect(error).toBeInstanceOf(RankingError)
  return error as RankingError
}

describe("createOpenAiRankModel", () => {
  it("requests strict JSON-schema output from the configured model and returns the text", async () => {
    const { client, spy } = fakeClient(async () => ({ status: "completed", output_text: '{"selected":[]}' }))
    const model = createOpenAiRankModel({ apiKey: "sk-test", client, modelName: "test-model" })

    expect(await model(prompt)).toBe('{"selected":[]}')

    const params = (spy.mock.calls[0] as unknown as [Record<string, unknown>])[0]
    expect(params).toMatchObject({
      model: "test-model",
      instructions: "system prompt",
      input: "user prompt",
      store: false,
      text: { format: { type: "json_schema", strict: true } },
    })
  })

  it("reports an incomplete response as invalid output", async () => {
    const { client } = fakeClient(async () => ({ status: "incomplete", output_text: '{"selected":[' }))
    const error = await failureOf(createOpenAiRankModel({ apiKey: "sk-test", client })(prompt))
    expect(error.kind).toBe("invalid-output")
  })

  it("reports an empty response as invalid output", async () => {
    const { client } = fakeClient(async () => ({ status: "completed", output_text: "" }))
    expect((await failureOf(createOpenAiRankModel({ apiKey: "sk-test", client })(prompt))).kind).toBe("invalid-output")
  })

  it("maps a timeout to a timeout error", async () => {
    const { client } = fakeClient(async () => {
      throw new OpenAI.APIConnectionTimeoutError()
    })
    expect((await failureOf(createOpenAiRankModel({ apiKey: "sk-test", client })(prompt))).kind).toBe("timeout")
  })

  it("maps API errors to a safe message that leaks neither the key nor the upstream body", async () => {
    const { client } = fakeClient(async () => {
      throw new OpenAI.AuthenticationError(401, { message: "Incorrect API key provided: sk-secret-key" }, undefined, new Headers())
    })
    const error = await failureOf(createOpenAiRankModel({ apiKey: "sk-secret-key", client })(prompt))

    expect(error.kind).toBe("upstream")
    expect(error.message).toContain("401")
    expect(error.message).not.toContain("sk-")
  })

  it("maps unexpected failures to a generic upstream error", async () => {
    const { client } = fakeClient(async () => {
      throw new Error("socket hang up sk-secret-key")
    })
    const error = await failureOf(createOpenAiRankModel({ apiKey: "sk-secret-key", client })(prompt))
    expect(error.kind).toBe("upstream")
    expect(error.message).not.toContain("sk-")
  })
})
