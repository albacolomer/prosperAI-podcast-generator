export interface NavItem {
  to: string
  label: string
  badge?: string
}

// Home and Dashboard are reachable directly (`/` and `/dashboard`) but are no longer listed in the top nav —
// the Dashboard is an internal tool, not a product surface to advertise alongside Home.
export const navItems: NavItem[] = []
