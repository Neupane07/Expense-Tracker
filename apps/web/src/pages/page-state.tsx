import { AlertCircle, Loader2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

type PageStateProps = {
  message?: string
}

export function LoadingState({ message = "Loading data" }: PageStateProps) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        {message}
      </CardContent>
    </Card>
  )
}

export function ErrorState({ message = "Unable to load data" }: PageStateProps) {
  return (
    <Card className="border-destructive/40">
      <CardContent className="flex items-center gap-3 p-5 text-sm text-destructive">
        <AlertCircle className="size-4" aria-hidden="true" />
        {message}
      </CardContent>
    </Card>
  )
}

export function EmptyState({ message = "No records found" }: PageStateProps) {
  return (
    <Card>
      <CardContent className="p-5 text-sm text-muted-foreground">
        {message}
      </CardContent>
    </Card>
  )
}
