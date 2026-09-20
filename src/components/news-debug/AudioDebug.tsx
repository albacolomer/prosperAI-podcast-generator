import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { useAudio } from "@/hooks/useAudio"
import type { ScriptResponse } from "@/types"

/**
 * TEMPORARY: voices a script that passed validation with ElevenLabs and plays the MP3. ElevenLabs is only called
 * when the button is pressed. Only a script the server signed (audioToken) can be voiced; a failed one has no token.
 */
export function AudioDebug({ data, language }: { data: ScriptResponse; language: string }) {
  const { state, generate } = useAudio()
  const loading = state.status === "loading"
  const { audioToken } = data

  return (
    <section className="flex flex-col gap-2">
      <h4 className="font-semibold text-foreground">Audio</h4>
      {audioToken ? (
        <p className="text-muted-foreground">
          The script passed validation. Generating audio sends its {data.stats.wordCount} words to ElevenLabs as one MP3.
        </p>
      ) : (
        <p className="text-muted-foreground">Audio is only generated for a script that passed validation.</p>
      )}
      <div className="flex items-center gap-3">
        <Button size="sm" disabled={loading || !audioToken} onClick={() => audioToken && void generate({ script: data.script, language, audioToken })}>
          {loading ? "Generating audio…" : state.status === "success" ? "Regenerate audio" : "Generate Audio"}
        </Button>
        {loading ? <span className="text-muted-foreground">ElevenLabs renders the whole episode before returning it; this can take a minute.</span> : null}
      </div>

      {state.status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>Audio generation failed</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      {state.status === "success" ? (
        <div className="flex flex-col gap-1">
          <audio controls src={state.url} className="w-full" />
          <p className="text-muted-foreground">
            {(state.sizeBytes / (1024 * 1024)).toFixed(1)} MB · generated in {(state.durationMs / 1000).toFixed(1)}s ·{" "}
            <a href={state.url} download="sample.mp3" className="text-primary underline">
              download
            </a>
          </p>
        </div>
      ) : null}
    </section>
  )
}
