import OpenAI from "openai"
import { describe, expect, it, vi } from "vitest"
import { ResearchError } from "./errors.js"
import { createOpenAiResearchModel, SELECTION_JSON_SCHEMA, SYNTHESIS_JSON_SCHEMA } from "./openai.js"

const prompt = { system: "system prompt", user: "user prompt" }

function fakeClient(create: () => Promise<unknown>) {
  const spy = vi.fn(create)
  return { client: { responses: { create: spy } } as unknown as OpenAI, spy }
}

async function failureOf(promise: Promise<unknown>): Promise<ResearchError> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  )
  expect(error).toBeInstanceOf(ResearchError)
  return error as ResearchError
}

describe("createOpenAiResearchModel", () => {
  it("requests strict JSON-schema output for source selection and returns the text", async () => {
    const { client, spy } = fakeClient(async () => ({ status: "completed", output_text: '{"selected":[]}' }))
    const model = createOpenAiResearchModel({ apiKey: "sk-test", client, modelName: "test-model" })

    expect(await model.select(prompt)).toBe('{"selected":[]}')

    const [params, options] = spy.mock.calls[0] as unknown as [Record<string, unknown>, { timeout: number }]
    expect(params).toMatchObject({
      model: "test-model",
      instructions: "system prompt",
      input: "user prompt",
      store: false,
      text: { format: { type: "json_schema", name: "source_selection", strict: true, schema: SELECTION_JSON_SCHEMA } },
    })
    expect(options.timeout).toBeGreaterThan(0)
  })

  it("requests strict JSON-schema output for synthesis, with more reasoning than selection", async () => {
    const { client, spy } = fakeClient(async () => ({ status: "completed", output_text: "{}" }))
    const model = createOpenAiResearchModel({ apiKey: "sk-test", client })

    await model.synthesize(prompt)
    await model.select(prompt)

    const [synth, select] = spy.mock.calls.map((call) => (call as unknown as [Record<string, unknown>])[0])
    expect(synth).toMatchObject({
      model: "gpt-5-mini",
      text: { format: { name: "story_research", strict: true, schema: SYNTHESIS_JSON_SCHEMA } },
      reasoning: { effort: "medium" },
    })
    expect(select).toMatchObject({ reasoning: { effort: "low" } })
  })

  it("keeps the strict schemas valid: every property is required and nothing extra is allowed", () => {
    function check(schema: unknown, path: string) {
      if (typeof schema !== "object" || schema === null) return
      const node = schema as Record<string, unknown>
      if (node.type === "object") {
        const properties = Object.keys((node.properties ?? {}) as object)
        expect(node.additionalProperties, path).toBe(false)
        expect([...(node.required as string[])].sort(), path).toEqual(properties.sort())
      }
      for (const [key, value] of Object.entries(node)) {
        if (key === "properties") for (const [name, child] of Object.entries(value as object)) check(child, `${path}.${name}`)
        else if (Array.isArray(value)) value.forEach((child, index) => check(child, `${path}.${key}[${index}]`))
        else check(value, `${path}.${key}`)
      }
    }
    check(SELECTION_JSON_SCHEMA, "selection")
    check(SYNTHESIS_JSON_SCHEMA, "synthesis")
  })

  it("reports an incomplete or empty response as invalid output", async () => {
    for (const response of [{ status: "incomplete", output_text: '{"a":' }, { status: "completed", output_text: "" }]) {
      const { client } = fakeClient(async () => response)
      const model = createOpenAiResearchModel({ apiKey: "sk-test", client })
      expect((await failureOf(model.synthesize(prompt))).kind).toBe("invalid-output")
    }
  })

  it("maps a timeout to a timeout error", async () => {
    const { client } = fakeClient(async () => {
      throw new OpenAI.APIConnectionTimeoutError()
    })
    expect((await failureOf(createOpenAiResearchModel({ apiKey: "sk-test", client }).select(prompt))).kind).toBe("timeout")
  })

  it("maps API errors to a safe message that leaks neither the key nor the upstream body", async () => {
    const { client } = fakeClient(async () => {
      throw new OpenAI.AuthenticationError(401, { message: "Incorrect API key provided: sk-secret-key" }, undefined, new Headers())
    })
    const error = await failureOf(createOpenAiResearchModel({ apiKey: "sk-secret-key", client }).synthesize(prompt))

    expect(error.kind).toBe("upstream")
    expect(error.message).toContain("401")
    expect(error.message).not.toContain("sk-")
  })

  it("maps unexpected failures to a generic upstream error", async () => {
    const { client } = fakeClient(async () => {
      throw new Error("socket hang up sk-secret-key")
    })
    const error = await failureOf(createOpenAiResearchModel({ apiKey: "sk-secret-key", client }).select(prompt))
    expect(error.kind).toBe("upstream")
    expect(error.message).not.toContain("sk-")
  })
})
