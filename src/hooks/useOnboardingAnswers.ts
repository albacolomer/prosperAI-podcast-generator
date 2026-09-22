import { useCallback, useState } from "react"
import { onboardingInterests } from "@/data/onboardingOptions"
import { defaultOnboardingAnswers, MAX_ONBOARDING_INTERESTS } from "@/types/onboarding"
import type { OnboardingAnswers, OnboardingSchedule } from "@/types/onboarding"
import type { DayOfWeek, Tone } from "@/types"

/**
 * Local-only state for the onboarding wizard. Nothing here is persisted: it exists for the length of the demo flow and
 * is handed to Home (as real interests/settings) and to the mock first-podcast builder once the user reaches the end.
 */
export function useOnboardingAnswers() {
  const [answers, setAnswers] = useState<OnboardingAnswers>(defaultOnboardingAnswers)

  const toggleInterest = useCallback((label: string) => {
    setAnswers((prev) => {
      const isSelected = prev.interests.includes(label)
      if (isSelected) return { ...prev, interests: prev.interests.filter((interest) => interest !== label) }
      if (prev.interests.length >= MAX_ONBOARDING_INTERESTS) return prev
      return { ...prev, interests: [...prev.interests, label] }
    })
  }, [])

  /** Same dedupe rule as Home's addInterest: trimmed, case-insensitive, against both the curated list and what's already picked. */
  const addCustomInterest = useCallback((label: string) => {
    const trimmed = label.trim()
    if (!trimmed) return
    setAnswers((prev) => {
      if (prev.interests.length >= MAX_ONBOARDING_INTERESTS) return prev
      const exists = [...onboardingInterests, ...prev.interests].some((existing) => existing.toLowerCase() === trimmed.toLowerCase())
      if (exists) return prev
      return { ...prev, interests: [...prev.interests, trimmed] }
    })
  }, [])

  const setDuration = useCallback((minutes: number) => {
    setAnswers((prev) => ({ ...prev, duration: minutes }))
  }, [])

  const setTone = useCallback((tone: Tone) => {
    setAnswers((prev) => ({ ...prev, tone }))
  }, [])

  const setLanguage = useCallback((language: string) => {
    setAnswers((prev) => ({ ...prev, language }))
  }, [])

  const updateSchedule = useCallback((partial: Partial<OnboardingSchedule>) => {
    setAnswers((prev) => ({ ...prev, schedule: { ...prev.schedule, ...partial } }))
  }, [])

  const setFrequency = useCallback((frequency: OnboardingSchedule["frequency"]) => updateSchedule({ frequency }), [updateSchedule])
  const setWeekday = useCallback((weekday: DayOfWeek) => updateSchedule({ weekday }), [updateSchedule])
  const setDayOfMonth = useCallback((dayOfMonth: number) => updateSchedule({ dayOfMonth }), [updateSchedule])
  const setDeliveryTime = useCallback((deliveryTime: string) => updateSchedule({ deliveryTime }), [updateSchedule])

  return {
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
  }
}
