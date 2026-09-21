import { describe, expect, it } from "vitest"
import { config } from "./fixtures.js"
import { checkRunnable, serverConfigProblem } from "./config.js"

const ENV = {
  GNEWS_API_KEY: "gnews-secret",
  OPENAI_API_KEY: "sk-secret-key",
  TAVILY_API_KEY: "tvly-secret",
  ELEVENLABS_API_KEY: "xi-secret-key",
  ELEVENLABS_VOICE_ID: "JBFqnCBsd6RMkjVDRZzb",
  ELEVENLABS_MODEL_ID: "eleven_flash_v2_5",
} as NodeJS.ProcessEnv

const without = (name: string) => {
  const env = { ...ENV }
  delete env[name]
  return env
}

describe("serverConfigProblem", () => {
  it("is undefined for a correctly configured server", () => {
    expect(serverConfigProblem(ENV)).toBeUndefined()
  })

  it.each(["GNEWS_API_KEY", "OPENAI_API_KEY", "TAVILY_API_KEY", "ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID"])("names %s when it is missing", (name) => {
    expect(serverConfigProblem(without(name))).toBe(`${name} is not set on the server.`)
  })

  it("treats an empty setting as missing", () => {
    expect(serverConfigProblem({ ...ENV, OPENAI_API_KEY: "" })).toBe("OPENAI_API_KEY is not set on the server.")
  })

  it("lists all that are missing", () => {
    expect(serverConfigProblem({ ...without("GNEWS_API_KEY"), TAVILY_API_KEY: "" })).toBe("These settings are not set on the server: GNEWS_API_KEY, TAVILY_API_KEY.")
  })

  it("names a voice id that is not shaped like one", () => {
    expect(serverConfigProblem({ ...ENV, ELEVENLABS_VOICE_ID: "not a voice id" })).toMatch(/^ELEVENLABS_VOICE_ID is not a valid ElevenLabs voice id/)
  })

  it("names a model the app does not support", () => {
    expect(serverConfigProblem({ ...ENV, ELEVENLABS_MODEL_ID: "eleven_imaginary_v9" })).toMatch(/^ELEVENLABS_MODEL_ID is not a supported model/)
  })

  it("accepts an unset model, which falls back to the app's default", () => {
    expect(serverConfigProblem(without("ELEVENLABS_MODEL_ID"))).toBeUndefined()
  })

  it("never puts a key, a voice id or a model name in the message", () => {
    const messages = [
      serverConfigProblem({ ...ENV, ELEVENLABS_VOICE_ID: "bad voice!" }),
      serverConfigProblem({ ...ENV, ELEVENLABS_MODEL_ID: "eleven_imaginary_v9" }),
      serverConfigProblem({ ...without("TAVILY_API_KEY") }),
      serverConfigProblem({ ...ENV, ELEVENLABS_API_KEY: "has spaces in it" }),
    ].join(" | ")

    for (const secret of ["gnews-secret", "sk-secret-key", "tvly-secret", "xi-secret-key", "JBFqnCBsd6RMkjVDRZzb", "bad voice!", "eleven_imaginary_v9", "has spaces in it"]) {
      expect(messages).not.toContain(secret)
    }
  })
})

describe("checkRunnable", () => {
  it("gives the request a scheduled run would make: the saved settings and the fixed 10-minute length", () => {
    const runnable = checkRunnable(config({ interests: ["Space"], language: "es", tone: "humorous" }), ENV)

    expect(runnable).toEqual({ ok: true, request: { interests: ["Space"], language: "es", tone: "humorous", durationMinutes: 10 } })
  })

  it("reports the server's problem first", () => {
    expect(checkRunnable(config(), without("OPENAI_API_KEY"))).toEqual({ ok: false, message: "OPENAI_API_KEY is not set on the server." })
  })

  it("reports settings that are not valid", () => {
    const runnable = checkRunnable(config({ interests: Array.from({ length: 11 }, (_, index) => `Topic ${index}`) }), ENV)

    expect(runnable).toMatchObject({ ok: false, message: expect.stringContaining("The schedule's settings are not valid") })
  })
})
