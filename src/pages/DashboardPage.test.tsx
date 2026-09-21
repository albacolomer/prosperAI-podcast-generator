// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NavBar } from "@/components/layout/NavBar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { installDomPolyfills } from "@/test/dom"
import { DashboardPage } from "./DashboardPage"

vi.setConfig({ testTimeout: 20_000 })

beforeEach(() => installDomPolyfills())
afterEach(cleanup)

const renderPage = () =>
  render(
    <MemoryRouter>
      <TooltipProvider>
        <DashboardPage />
      </TooltipProvider>
    </MemoryRouter>,
  )

/** The number under a KPI label, e.g. "Total users" -> "1,720". */
const kpi = (label: RegExp) => {
  const card = screen.getAllByText(label)[0].parentElement as HTMLElement
  return card.querySelectorAll("p")[1].textContent
}

describe("DashboardPage", () => {
  it("defaults to 30 days and marks itself internal", () => {
    renderPage()
    expect(screen.getByRole("radio", { name: "Last 30 days" })).toHaveProperty("ariaChecked", "true")
    expect(screen.getByText("Internal")).toBeTruthy()
    expect(screen.getByRole("heading", { level: 1, name: "Product analytics" })).toBeTruthy()
  })

  it("shows every section, with the regeneration rate labelled as a proxy, research reuse as the only personalization card, and no voice metric", () => {
    renderPage()
    for (const title of ["Product usage", "Content & engagement", "Quality", "Personalization", "Technology", "API & economics"]) {
      expect(screen.getByRole("heading", { level: 2, name: title })).toBeTruthy()
    }
    expect(screen.getByText(/Proxy for potential dissatisfaction/)).toBeTruthy()
    expect(screen.getByText("Research reuse")).toBeTruthy()
    expect(screen.queryByText(/Personalization signals/)).toBeNull()
    expect(screen.queryByText(/top voices/i)).toBeNull()
    expect(screen.getByText(/Voice analytics — coming later/)).toBeTruthy()
  })

  it("changes the numbers with the range and never renders NaN or undefined", async () => {
    const user = userEvent.setup()
    renderPage()
    const seen = new Map<string, string | null>()

    for (const days of [7, 30, 90, 7]) {
      await user.click(screen.getByRole("radio", { name: `Last ${days} days` }))
      const text = document.body.textContent ?? ""
      expect(text).not.toMatch(/NaN|undefined|Infinity/)
      expect(screen.getByText(new RegExp(`previous ${days} days`))).toBeTruthy()
      seen.set(String(days), kpi(/^Episodes generated$/i))
    }

    const counts = [seen.get("7"), seen.get("30"), seen.get("90")].map((value) => Number((value ?? "").replace(/,/g, "")))
    expect(counts[0]).toBeLessThan(counts[1])
    expect(counts[1]).toBeLessThan(counts[2])
  })

  it("keeps the Dashboard marked INTERNAL in the navigation", () => {
    render(
      <MemoryRouter>
        <NavBar />
      </MemoryRouter>,
    )
    const link = screen.getAllByRole("link", { name: /Dashboard/ })[0]
    expect(within(link).getByText("Internal")).toBeTruthy()
  })
})
