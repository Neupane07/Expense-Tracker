import { Navigate, Route, Routes } from "react-router-dom"
import { AppLayout } from "@/components/layout/app-layout"
import { DashboardPage } from "@/pages/dashboard-page"
import { ImportsPage } from "@/pages/imports-page"
import { ReviewPage } from "@/pages/review-page"
import { RulesPage } from "@/pages/rules-page"
import { TransactionsPage } from "@/pages/transactions-page"

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/imports" element={<ImportsPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/rules" element={<RulesPage />} />
      </Route>
    </Routes>
  )
}
