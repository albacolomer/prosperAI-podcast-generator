import type { NewsLogger } from "../news/log.js"

/** Development-only logger: silent in production and under test. */
export const rankingLog: NewsLogger = (message) => {
  const env = process.env.NODE_ENV
  if (env === "production" || env === "test") return
  console.log(`[Ranking] ${message}`)
}
