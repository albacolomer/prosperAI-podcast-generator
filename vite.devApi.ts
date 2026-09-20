import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { parseEnv } from "node:util"
import type { Plugin } from "vite"

type ApiHandler = (request: Request) => Promise<Response>

const SERVER_ONLY_ENV = [
  "GNEWS_API_KEY",
  "OPENAI_API_KEY",
  "TAVILY_API_KEY",
  "OPENAI_RANKING_MODEL",
  "OPENAI_SCRIPT_MODEL",
  "OPENAI_PLANNER_MODEL",
  "OPENAI_VALIDATOR_MODEL",
  "OPENAI_RESEARCH_MODEL",
  "ELEVENLABS_API_KEY",
  "ELEVENLABS_VOICE_ID",
  "ELEVENLABS_MODEL_ID",
  "EPISODE_STORAGE_DIR",
]

const routes = [
  { path: "/api/news", module: "/api/news.ts", method: "GET" },
  { path: "/api/rank-news", module: "/api/rank-news.ts", method: "POST" },
  { path: "/api/research-news", module: "/api/research-news.ts", method: "POST" },
  { path: "/api/generate-script", module: "/api/generate-script.ts", method: "POST" },
  { path: "/api/generate-audio", module: "/api/generate-audio.ts", method: "POST" },
  { path: "/api/generate-episode", module: "/api/generate-episode.ts", method: "POST" },
  { path: "/api/episode-audio", module: "/api/episode-audio.ts", method: "GET" },
] as const

/**
 * Dev-only stand-in for Vercel: serves the api/ routes from `npm run dev` by running the
 * same handlers those files export. API keys are read from .env.local into the dev server's
 * process only — they have no VITE_ prefix, so they are never sent to the browser.
 */
export function devApi(): Plugin {
  return {
    name: "dev-api",
    apply: "serve",
    configureServer(server) {
      // Only the .env files are read here (not process.env, which loadEnv would merge in): the point is to tell what the
      // files say apart from what the process already holds.
      const fileEnv: Record<string, string> = {}
      for (const name of [".env", ".env.local", `.env.${server.config.mode}`, `.env.${server.config.mode}.local`]) {
        const file = path.join(server.config.root, name)
        if (existsSync(file)) Object.assign(fileEnv, parseEnv(readFileSync(file, "utf8")))
      }

      // A real environment variable (set in the terminal) wins over .env.local, as usual. But a value this plugin
      // loaded itself is refreshed on every start: Vite restarts in the same process when .env.local changes, and a
      // value kept from before the edit would silently win otherwise.
      const loaded = (globalThis as { __devApiEnvKeys?: Set<string> }).__devApiEnvKeys ?? new Set<string>()
      ;(globalThis as { __devApiEnvKeys?: Set<string> }).__devApiEnvKeys = loaded
      for (const key of SERVER_ONLY_ENV) {
        const fromFile = fileEnv[key]
        if (!fromFile) continue
        if (process.env[key] === undefined || loaded.has(key)) {
          process.env[key] = fromFile
          loaded.add(key)
        } else if (process.env[key] !== fromFile) {
          server.config.logger.warn(
            `[dev-api] ${key} is set in your terminal environment and overrides .env.local. Unset it to use the .env.local value.`,
          )
        }
      }

      for (const route of routes) {
        server.middlewares.use(route.path, async (req, res) => {
          res.setHeader("Content-Type", "application/json")
          if (req.method !== route.method) {
            res.statusCode = 405
            res.end(JSON.stringify({ error: "Method not allowed" }))
            return
          }

          try {
            // Loaded through Vite so edits to api/ and server/ are picked up without a restart.
            const handlers = (await server.ssrLoadModule(route.module)) as Record<string, ApiHandler>
            const url = `http://${req.headers.host ?? "localhost"}${req.originalUrl ?? req.url ?? ""}`
            // A client that goes away cancels the request, so long-running handlers can stop between stages.
            const abort = new AbortController()
            res.on("close", () => {
              if (!res.writableEnded) abort.abort()
            })
            const init: RequestInit = { method: route.method, signal: abort.signal }
            const range = req.headers.range
            if (range) init.headers = { Range: range }
            if (route.method === "POST") {
              const chunks: Buffer[] = []
              for await (const chunk of req) chunks.push(chunk as Buffer)
              init.body = Buffer.concat(chunks)
            }
            const response = await handlers[route.method](new Request(url, init))
            res.statusCode = response.status
            // JSON by default; the handlers also answer with binary audio/mpeg (Range and attachment headers included).
            response.headers.forEach((value, name) => res.setHeader(name, value))
            // Streamed, not buffered: the episode endpoint reports progress while it is still running.
            if (response.body) {
              const reader = response.body.getReader()
              res.on("close", () => void reader.cancel().catch(() => {}))
              for (;;) {
                const { done, value } = await reader.read()
                if (done) break
                res.write(value)
              }
            }
            res.end()
          } catch (error) {
            server.config.logger.error(
              `[dev-api] ${route.path} failed: ${error instanceof Error ? error.message : error}`,
            )
            res.statusCode = 500
            res.end(JSON.stringify({ error: `Internal error in ${route.path}` }))
          }
        })
      }
    },
  }
}
