export type NewsLogger = (message: string) => void

/** Development-only logger: silent in production and under test. */
export const devLog: NewsLogger = (message) => {
  const env = process.env.NODE_ENV
  if (env === "production" || env === "test") return
  console.log(`[News] ${message}`)
}
