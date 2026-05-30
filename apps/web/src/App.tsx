import { Navigate, Route, Routes } from "react-router-dom"
import { AuthProvider } from "@/auth/auth-context"
import { useAuth } from "@/auth/use-auth"
import { AppLayout } from "@/components/layout/app-layout"
import { AdminInvitationsPage } from "@/pages/admin-invitations-page"
import { DashboardPage } from "@/pages/dashboard-page"
import { DhanConnectionPage } from "@/pages/dhan-connection-page"
import {
  ResearchPage,
  SwingScannerPage,
  TradeJournalPage,
} from "@/pages/finance-placeholder-page"
import { ImportsPage } from "@/pages/imports-page"
import { LoadingState } from "@/pages/page-state"
import { PortfolioPage } from "@/pages/portfolio-page"
import { ReviewPage } from "@/pages/review-page"
import { RulesPage } from "@/pages/rules-page"
import { SignInPage } from "@/pages/sign-in-page"
import { TransactionsPage } from "@/pages/transactions-page"

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}

function AppRoutes() {
  const { isLoading, user } = useAuth()

  if (isLoading) {
    return (
      <div className="mx-auto mt-10 max-w-lg px-4">
        <LoadingState message="Checking sign-in status" />
      </div>
    )
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="*" element={<Navigate to="/sign-in" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/imports" element={<ImportsPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/rules" element={<RulesPage />} />
        <Route path="/portfolio" element={<PortfolioPage />} />
        <Route path="/scanner" element={<SwingScannerPage />} />
        <Route path="/trade-journal" element={<TradeJournalPage />} />
        <Route path="/research" element={<ResearchPage />} />
        <Route
          path="/settings/broker-connections/dhan"
          element={<DhanConnectionPage />}
        />
        {user.role === "ADMIN" ? (
          <Route path="/admin/invitations" element={<AdminInvitationsPage />} />
        ) : null}
      </Route>
      <Route path="/sign-in" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
