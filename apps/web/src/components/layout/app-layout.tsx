import {
  BarChart3,
  BookOpenText,
  BriefcaseBusiness,
  ClipboardList,
  FileSpreadsheet,
  ListChecks,
  ReceiptText,
  Route,
  ScanSearch,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react"
import { NavLink, Outlet, useLocation } from "react-router-dom"
import { useAuth } from "@/auth/use-auth"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/imports", label: "Imports", icon: FileSpreadsheet },
  { href: "/transactions", label: "Transactions", icon: ReceiptText },
  { href: "/review", label: "Review", icon: ListChecks },
  { href: "/rules", label: "Rules", icon: SlidersHorizontal },
  { href: "/portfolio", label: "Portfolio", icon: BriefcaseBusiness },
  { href: "/scanner", label: "Swing Scanner", icon: ScanSearch },
  { href: "/trade-journal", label: "Trade Journal", icon: ClipboardList },
  { href: "/research", label: "Research", icon: BookOpenText },
]

const routeTitles = new Map([
  ["/dashboard", "Dashboard"],
  ["/imports", "Statement Imports"],
  ["/transactions", "Transactions"],
  ["/review", "Review Queue"],
  ["/rules", "Categorization Rules"],
  ["/portfolio", "Portfolio"],
  ["/scanner", "Swing Scanner"],
  ["/trade-journal", "Trade Journal"],
  ["/research", "Research"],
  ["/admin/invitations", "Invitations"],
])

export function AppLayout() {
  const location = useLocation()
  const { user, signOut } = useAuth()
  const pageTitle = routeTitles.get(location.pathname) ?? "Expense Tracker"
  const visibleNavigation =
    user?.role === "ADMIN"
      ? [
          ...navigation,
          { href: "/admin/invitations", label: "Invitations", icon: ShieldCheck },
        ]
      : navigation

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-border bg-sidebar lg:block">
        <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-5">
          <div className="flex size-9 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Route className="size-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-none">Expense Tracker</p>
            <p className="mt-1 text-xs text-muted-foreground">ICICI statements</p>
          </div>
        </div>
        <nav className="space-y-1 px-3 py-4">
          {visibleNavigation.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
                )
              }
            >
              <item.icon className="size-4" aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:px-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Personal finance
              </p>
              <h1 className="mt-1 text-xl font-semibold">{pageTitle}</h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium">{user?.name ?? user?.email}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void signOut().catch(() => undefined)}
              >
                Sign out
              </Button>
            </div>
            <nav className="flex gap-1 overflow-x-auto lg:hidden md:order-3 md:w-full">
              {visibleNavigation.map((item) => (
                <NavLink
                  key={item.href}
                  to={item.href}
                  className={({ isActive }) =>
                    cn(
                      "inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                      isActive && "bg-accent text-accent-foreground",
                    )
                  }
                >
                  <item.icon className="size-4" aria-hidden="true" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
        </header>
        <main className="px-4 py-5 md:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
