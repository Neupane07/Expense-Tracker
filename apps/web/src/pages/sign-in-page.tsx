import { Route } from "lucide-react"
import { useSearchParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { apiUrl } from "@/lib/api-client"

export function SignInPage() {
  const [params] = useSearchParams()
  const inviteRequired = params.get("error") === "invite_required"
  const signInFailed = params.get("error") === "sign_in_failed"

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Route className="size-6" aria-hidden="true" />
          </div>
          <CardTitle>Expense Tracker</CardTitle>
          <p className="text-sm text-muted-foreground">
            Private ICICI statement imports and expense review.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {inviteRequired ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              This verified Google email does not have an unused invitation. Ask an
              administrator to invite you, then sign in again.
            </div>
          ) : signInFailed ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              Sign-in could not be completed. Check the API configuration and database
              migration status, then try again.
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Access is invite-only. Sign in with the Google email on your invitation.
            </p>
          )}
          <Button
            className="w-full"
            onClick={() => window.location.assign(apiUrl("/auth/google"))}
          >
            Sign in with Google
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
