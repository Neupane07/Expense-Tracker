import { useState } from "react"
import { Menu, X } from "lucide-react"
import { Outlet, useLocation } from "react-router-dom"
import { useAuth } from "@/auth/use-auth"
import {
  AppSidebarNav,
  SidebarUserFooter,
} from "@/components/layout/app-sidebar-nav"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

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
  ["/settings/broker-connections/dhan", "Broker Connections"],
  ["/admin/invitations", "Invitations"],
])

const appName = "Personal Finance"
const appTagline = "Expenses & portfolio"

export function AppLayout() {
  const location = useLocation()
  const { user, signOut } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const pageTitle = routeTitles.get(location.pathname) ?? appName
  const isAdmin = user?.role === "ADMIN"

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[17rem] flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <Brand />
        <nav className="flex-1 overflow-y-auto overscroll-contain px-1 py-4">
          <AppSidebarNav isAdmin={isAdmin} />
        </nav>
      </aside>

      <div className="lg:pl-[17rem]">
        <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3 md:px-6">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="shrink-0 lg:hidden"
                  aria-label="Open navigation"
                >
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                showCloseButton={false}
                className="flex h-full w-[min(19rem,90vw)] max-w-none flex-col gap-0 border-r border-sidebar-border bg-sidebar p-0 text-sidebar-foreground shadow-xl"
              >
                <SheetTitle className="sr-only">Navigation menu</SheetTitle>
                <Brand inSheet />
                <nav className="flex-1 overflow-y-auto overscroll-contain px-1 py-3">
                  <AppSidebarNav
                    isAdmin={isAdmin}
                    touchFriendly
                    onNavigate={() => setMobileOpen(false)}
                  />
                </nav>
                {user ? (
                  <div className="shrink-0 border-t border-sidebar-border px-4 py-3.5 pb-[max(0.85rem,env(safe-area-inset-bottom))]">
                    <SidebarUserFooter
                      name={user.name}
                      email={user.email}
                    />
                  </div>
                ) : null}
              </SheetContent>
            </Sheet>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
                {appName}
              </p>
              <h1 className="truncate text-base font-semibold sm:text-lg md:text-xl">
                {pageTitle}
              </h1>
            </div>

            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <div className="hidden text-right md:block">
                <p className="max-w-[14rem] truncate text-sm font-medium">
                  {user?.name ?? user?.email}
                </p>
                <p className="max-w-[14rem] truncate text-xs text-muted-foreground">
                  {user?.email}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => void signOut().catch(() => undefined)}
              >
                Sign out
              </Button>
            </div>
          </div>
        </header>
        <main className="px-3 py-4 sm:px-4 sm:py-5 md:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function Brand({ inSheet = false }: { inSheet?: boolean }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center border-b border-sidebar-border bg-sidebar",
        inSheet ? "h-14 justify-between gap-2 px-3" : "h-[4.25rem] px-4",
      )}
    >
      <div className="min-w-0 border-l-[3px] border-[var(--chart-2)] pl-3">
        <p className="truncate text-sm font-semibold leading-tight tracking-tight">
          {appName}
        </p>
        <p className="truncate text-xs text-muted-foreground">{appTagline}</p>
      </div>
      {inSheet ? (
        <SheetClose asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground hover:bg-sidebar-accent"
            aria-label="Close menu"
          >
            <X className="size-5" />
          </Button>
        </SheetClose>
      ) : null}
    </div>
  )
}
