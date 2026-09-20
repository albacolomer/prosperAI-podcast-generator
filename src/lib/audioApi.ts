/** What POST /api/generate-audio needs: exactly what POST /api/generate-script returned for a script that passed validation. */
export interface AudioRequestParams {
  script: string
  language: string
  audioToken: string
}

/** Requests the MP3 for a validated script and returns it as a Blob the <audio> element can play. */
export async function generateAudio({ signal, ...params }: AudioRequestParams & { signal?: AbortSignal }): Promise<Blob> {
  const response = await fetch("/api/generate-audio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal,
  })

  if (response.ok && response.headers.get("Content-Type")?.startsWith("audio/")) return response.blob()
  const body = (await response.json().catch(() => null)) as { error?: string } | null
  throw new Error(body?.error ?? `Audio request failed (${response.status})`)
}
