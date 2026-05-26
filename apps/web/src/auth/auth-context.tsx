import { useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { apiGet, apiPostVoid } from "@/lib/api-client"
import type { CurrentUser } from "@/pages/types"
import { AuthContext } from "./auth-state"
import type { AuthState } from "./auth-state"

type AuthSession =
  | { authenticated: false }
  | { authenticated: true; user: CurrentUser }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isCurrent = true

    apiGet<AuthSession>("/auth/session")
      .then((result) => {
        if (isCurrent) {
          setSession(result)
          setError(null)
        }
      })
      .catch((caught: unknown) => {
        if (isCurrent) {
          setSession({ authenticated: false })
          setError(
            caught instanceof Error ? caught.message : "Unable to check sign-in status",
          )
        }
      })

    return () => {
      isCurrent = false
    }
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      isLoading: session === null,
      user: session?.authenticated ? session.user : null,
      error,
      signOut: async () => {
        await apiPostVoid("/auth/sign-out")
        setSession({ authenticated: false })
      },
    }),
    [error, session],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
