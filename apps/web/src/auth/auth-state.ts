import { createContext } from "react"
import type { CurrentUser } from "@/pages/types"

export type AuthState = {
  isLoading: boolean
  user: CurrentUser | null
  error: string | null
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)
