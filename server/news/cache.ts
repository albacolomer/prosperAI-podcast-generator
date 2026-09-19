/**
 * Minimal in-memory TTL cache. It lives as long as the server instance does
 * (on serverless, per warm instance), so it protects the provider quota without
 * being a source of truth.
 */
export class TtlCache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>()
  private readonly ttlMs: number

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key: string, value: T): void {
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs })
  }
}
