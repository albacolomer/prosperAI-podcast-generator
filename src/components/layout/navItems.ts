import { ROUTES } from "@/lib/constants"

export interface NavItem {
  to: string
  label: string
  badge?: string
}

export const navItems: NavItem[] = [
  { to: ROUTES.home, label: "Home" },
  { to: ROUTES.dashboard, label: "Dashboard", badge: "Internal" },
]
