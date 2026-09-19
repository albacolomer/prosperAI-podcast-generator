import { loadEnv } from "vite"
import type { Plugin } from "vite"

type ApiHandler = (request: Request) => Promise<Response>

/**
 * Dev-only stand-in for Vercel: serves GET /api/news from `npm run dev` by running the
 * same handler that api/news.ts exports. The API key is read from .env.local into the
 * dev server's process only — it has no VITE_ prefix, so it is never sent to the browser.
 */
export function devApi(): Plugin {
  return {
    name: "dev-api",
    apply: "serve",
    configureServer(server) {
      const env = loadEnv(server.config.mode, server.config.root, "")
      process.env.GNEWS_API_KEY ??= env.GNEWS_API_KEY

      server.middlewares.use("/api/news", async (req, res) => {
        res.setHeader("Content-Type", "application/json")
        if (req.method !== "GET") {
          res.statusCode = 405
          res.end(JSON.stringify({ error: "Method not allowed" }))
          return
        }

        try {
          // Loaded through Vite so edits to api/ and server/ are picked up without a restart.
          const { GET } = (await server.ssrLoadModule("/api/news.ts")) as { GET: ApiHandler }
          const url = `http://${req.headers.host ?? "localhost"}${req.originalUrl ?? req.url ?? ""}`
          const response = await GET(new Request(url))
          res.statusCode = response.status
          res.end(await response.text())
        } catch (error) {
          server.config.logger.error(`[dev-api] /api/news failed: ${error instanceof Error ? error.message : error}`)
          res.statusCode = 500
          res.end(JSON.stringify({ error: "Internal error in /api/news" }))
        }
      })
    },
  }
}
