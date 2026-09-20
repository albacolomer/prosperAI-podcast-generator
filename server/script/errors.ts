export type ScriptErrorKind = "not-configured" | "timeout" | "upstream" | "invalid-output"

/**
 * A script-generation failure whose message is safe to show to the caller: it never carries
 * secrets, prompts, or raw upstream error bodies.
 */
export class ScriptError extends Error {
  readonly kind: ScriptErrorKind

  constructor(kind: ScriptErrorKind, message: string) {
    super(message)
    this.name = "ScriptError"
    this.kind = kind
  }
}

export function statusForScriptError(error: ScriptError): number {
  switch (error.kind) {
    case "not-configured":
      return 503
    case "timeout":
      return 504
    case "upstream":
    case "invalid-output":
      return 502
  }
}
