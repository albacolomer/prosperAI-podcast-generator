import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { useDocumentTitle } from "@/hooks/useDocumentTitle"
import { ROUTES } from "@/lib/constants"

export function NotFoundPage() {
  useDocumentTitle("Echo — Page Not Found")
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Page not found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The page you're looking for doesn't exist or may have moved.
      </p>
      <Button asChild className="mt-2">
        <Link to={ROUTES.home}>Back to Home</Link>
      </Button>
    </div>
  )
}
