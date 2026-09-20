import type { NewsLogger } from "../news/log.js"

/** Development-only logger: silent in production and under test. Never pass it page content or keys. */
export const researchLog: NewsLogger = (message) => {
  const env = process.env.NODE_ENV
  if (env === "production" || env === "test") return
  console.log(`[Research] ${message}`)
}
