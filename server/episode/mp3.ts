import { OUTPUT_FORMAT } from "../audio/elevenlabs.js"

const AUDIO_BITRATE_BPS = Number(/_(\d+)$/.exec(OUTPUT_FORMAT)?.[1] ?? 128) * 1000

/** The MP3 is constant-bitrate (OUTPUT_FORMAT), so its length follows from its size. The player replaces this with the decoded length. */
export function mp3DurationSeconds(bytes: number): number {
  return Math.round((bytes * 8) / AUDIO_BITRATE_BPS)
}
