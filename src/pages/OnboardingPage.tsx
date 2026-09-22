import { AudioLines } from "lucide-react"
import { useCallback, useState } from "react"
import { GeneratingOverlay } from "@/components/onboarding/GeneratingOverlay"
import { OnboardingStepShell } from "@/components/onboarding/OnboardingStepShell"
import { ReadyScreen } from "@/components/onboarding/ReadyScreen"
import { SimulatedHome } from "@/components/onboarding/SimulatedHome"
import { DurationStep } from "@/components/onboarding/steps/DurationStep"
import { InterestsStep } from "@/components/onboarding/steps/InterestsStep"
import { ScheduleLanguageStep } from "@/components/onboarding/steps/ScheduleLanguageStep"
import { ToneStep } from "@/components/onboarding/steps/ToneStep"
import { ValuePropStep } from "@/components/onboarding/steps/ValuePropStep"
import { buildFirstPodcastEpisode } from "@/data/onboardingFirstPodcast"
import { useDocumentTitle } from "@/hooks/useDocumentTitle"
import { useOnboardingAnswers } from "@/hooks/useOnboardingAnswers"
import type { OnboardingAnswers } from "@/types/onboarding"

type Phase = "step" | "generating" | "ready" | "simulatedHome"

const LAST_STEP = 5

export function OnboardingPage() {
  useDocumentTitle("ProsperPod — Welcome")

  const [phase, setPhase] = useState<Phase>("step")
  const [step, setStep] = useState(1)
  const {
    answers,
    toggleInterest,
    addCustomInterest,
    setDuration,
    setTone,
    setLanguage,
    setFrequency,
    setWeekday,
    setDayOfMonth,
    setDeliveryTime,
  } = useOnboardingAnswers()

  const goNext = useCallback(() => setStep((current) => Math.min(LAST_STEP, current + 1)), [])
  const goBack = useCallback(() => setStep((current) => Math.max(1, current - 1)), [])

  // Captured once the user commits, from the answers at that exact moment — this is what the simulated Home renders,
  // so it never shifts even if the answers hook were somehow touched again afterwards.
  const [committed, setCommitted] = useState<{ episode: ReturnType<typeof buildFirstPodcastEpisode>; answers: OnboardingAnswers } | null>(null)

  const handleCreatePodcast = useCallback(() => {
    setCommitted({ episode: buildFirstPodcastEpisode(answers), answers })
    setPhase("generating")
  }, [answers])

  if (phase === "simulatedHome" && committed) {
    return (
      <div className="min-h-svh bg-background">
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
          <SimulatedHome episode={committed.episode} answers={committed.answers} />
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex h-16 shrink-0 items-center px-4 sm:px-6">
        <div className="mx-auto flex w-full max-w-xl items-center gap-2 font-semibold tracking-tight text-foreground">
          <AudioLines className="size-6 text-primary" strokeWidth={2.5} />
          <span className="text-base">ProsperPod</span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto flex min-h-full w-full max-w-xl items-center justify-center">
          {phase === "generating" ? (
            <GeneratingOverlay onComplete={() => setPhase("ready")} />
          ) : phase === "ready" ? (
            <ReadyScreen onStartListening={() => setPhase("simulatedHome")} />
          ) : step === 1 ? (
            <div className="w-full">
              <ValuePropStep onNext={goNext} />
            </div>
          ) : (
            <div className="w-full py-4">
              <OnboardingStepShell step={step} onBack={goBack}>
                {step === 2 ? (
                  <InterestsStep selected={answers.interests} onToggle={toggleInterest} onAddCustom={addCustomInterest} onNext={goNext} />
                ) : null}
                {step === 3 ? <DurationStep value={answers.duration} onChange={setDuration} onNext={goNext} /> : null}
                {step === 4 ? <ToneStep value={answers.tone} onChange={setTone} onNext={goNext} /> : null}
                {step === 5 ? (
                  <ScheduleLanguageStep
                    schedule={answers.schedule}
                    language={answers.language}
                    onFrequencyChange={setFrequency}
                    onWeekdayChange={setWeekday}
                    onDayOfMonthChange={setDayOfMonth}
                    onDeliveryTimeChange={setDeliveryTime}
                    onLanguageChange={setLanguage}
                    onSubmit={handleCreatePodcast}
                  />
                ) : null}
              </OnboardingStepShell>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
