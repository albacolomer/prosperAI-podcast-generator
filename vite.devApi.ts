import { loadEnv } from "vite"
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
]

const routes = [
  { path: "/api/news", module: "/api/news.ts", method: "GET" },
  { path: "/api/rank-news", module: "/api/rank-news.ts", method: "POST" },
  { path: "/api/research-news", module: "/api/research-news.ts", method: "POST" },
  { path: "/api/generate-script", module: "/api/generate-script.ts", method: "POST" },
  { path: "/api/generate-audio", module: "/api/generate-audio.ts", method: "POST" },
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
      const env = loadEnv(server.config.mode, server.config.root, "")
      for (const key of SERVER_ONLY_ENV) {
        if (env[key]) process.env[key] ??= env[key]
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
            const init: RequestInit = { method: route.method }
            if (route.method === "POST") {
              const chunks: Buffer[] = []
              for await (const chunk of req) chunks.push(chunk as Buffer)
              init.body = Buffer.concat(chunks)
            }
            const response = await handlers[route.method](new Request(url, init))
            res.statusCode = response.status
            // JSON by default; the audio endpoint answers with binary audio/mpeg.
            const contentType = response.headers.get("Content-Type")
            if (contentType) res.setHeader("Content-Type", contentType)
            res.end(Buffer.from(await response.arrayBuffer()))
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
