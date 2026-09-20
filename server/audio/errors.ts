export type AudioErrorKind =
  | "not-configured"
  | "invalid-config"
  | "not-validated"
  | "empty-script"
  | "script-too-long"
  | "auth"
  | "rate-limit"
  | "timeout"
  | "upstream"
  | "invalid-audio"

/**
 * An audio-generation failure whose message is safe to show to the caller: it never carries secrets
 * or raw upstream error bodies.
 */
export class AudioError extends Error {
  readonly kind: AudioErrorKind

  constructor(kind: AudioErrorKind, message: string) {
    super(message)
    this.name = "AudioError"
    this.kind = kind
  }
}

export function statusForAudioError(error: AudioError): number {
  switch (error.kind) {
    case "not-configured":
    case "invalid-config":
      return 503
    case "not-validated":
      return 403
    case "empty-script":
    case "script-too-long":
      return 422
    case "rate-limit":
      return 429
    case "timeout":
      return 504
    case "auth":
    case "upstream":
    case "invalid-audio":
      return 502
  }
}
