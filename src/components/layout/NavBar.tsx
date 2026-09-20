import { AudioLines } from "lucide-react"
import { NavLink } from "react-router-dom"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { MobileNavSheet } from "@/components/layout/MobileNavSheet"
import { navItems } from "@/components/layout/navItems"
import { mockCurrentUser } from "@/data/mockUser"
import { ROUTES } from "@/lib/constants"
import { cn } from "@/lib/utils"

export function NavBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <NavLink to={ROUTES.home} className="flex items-center gap-2 font-semibold tracking-tight text-foreground">
          <AudioLines className="size-6 text-primary" strokeWidth={2.5} />
          <span className="text-base">ProsperPod</span>
        </NavLink>

        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                  isActive && "bg-primary/10 font-semibold text-primary",
                )
              }
            >
              {item.label}
              {item.badge ? (
                <Badge variant="secondary" className="text-[10px] tracking-wide text-muted-foreground uppercase">
                  {item.badge}
                </Badge>
              ) : null}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Avatar size="lg" className="hidden sm:flex">
            <AvatarFallback className="bg-primary/15 font-medium text-primary">
              {mockCurrentUser.initials}
            </AvatarFallback>
          </Avatar>
          <MobileNavSheet />
        </div>
      </div>
    </header>
  )
}
