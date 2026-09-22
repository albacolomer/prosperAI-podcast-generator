// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { generatedEpisode, generatedEpisode2, installDomPolyfills, installFakeApi } from "@/test/dom"
import { EpisodesPage } from "./EpisodesPage"

function renderEpisodes() {
  return render(
    <MemoryRouter initialEntries={["/episodes"]}>
      <Routes>
        <Route path="/" element={<div>Home page</div>} />
        <Route path="/episodes" element={<EpisodesPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  installDomPolyfills()
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("terminology", () => {
  it("calls the page and its podcasts 'Podcasts', not 'Episodes'", async () => {
    installFakeApi(undefined, [generatedEpisode])
    renderEpisodes()

    await screen.findByText(generatedEpisode.title)
    expect(screen.getByText("Your podcasts")).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/\bEpisodes?\b/)
  })
})

describe("back to Home", () => {
  it("navigates to / when clicked", async () => {
    installFakeApi()
    const user = userEvent.setup()
    renderEpisodes()

    await user.click(screen.getByRole("link", { name: /Back to Home/i }))
    expect(await screen.findByText("Home page")).toBeTruthy()
  })
})

describe("real podcasts only", () => {
  it("shows an empty state, not a fabricated podcast, when none have been generated yet", async () => {
    installFakeApi()
    renderEpisodes()

    await screen.findByText("No podcasts yet")
    expect(screen.queryByText(generatedEpisode.title)).toBeNull()
  })

  it("shows every real generated podcast", async () => {
    installFakeApi(undefined, [generatedEpisode2, generatedEpisode])
    renderEpisodes()

    await screen.findByText(generatedEpisode.title)
    expect(screen.getByText(generatedEpisode2.title)).toBeTruthy()
    expect(screen.queryByText("No podcasts yet")).toBeNull()
  })

  it("never shows the onboarding demo podcast or any other fabricated podcast", async () => {
    installFakeApi(undefined, [generatedEpisode])
    renderEpisodes()

    await screen.findByText(generatedEpisode.title)
    expect(document.body.textContent).not.toMatch(/Your First ProsperPod|Inside the New Wave of Foundation Models/i)
  })
})
