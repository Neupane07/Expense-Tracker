import type { CSSProperties } from "react"
import { NavLink } from "react-router-dom"
import {
  navGroups,
  type NavGroup,
  type NavItem,
} from "@/components/layout/app-sidebar-config"
import { cn } from "@/lib/utils"

type AppSidebarNavProps = {
  isAdmin: boolean
  onNavigate?: () => void
  touchFriendly?: boolean
}

export function AppSidebarNav({
  isAdmin,
  onNavigate,
  touchFriendly = false,
}: AppSidebarNavProps) {
  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.adminOnly || isAdmin),
    }))
    .filter((group) => group.items.length > 0)

  return (
    <div className="space-y-5">
      {visibleGroups.map((group, index) => (
        <div key={group.id}>
          {index > 0 ? (
            <div
              className="mx-3 mb-5 h-px bg-sidebar-border/80"
              aria-hidden="true"
            />
          ) : null}
          <NavGroupSection
            group={group}
            onNavigate={onNavigate}
            touchFriendly={touchFriendly}
          />
        </div>
      ))}
    </div>
  )
}

function NavGroupSection({
  group,
  onNavigate,
  touchFriendly,
}: {
  group: NavGroup
  onNavigate?: () => void
  touchFriendly?: boolean
}) {
  return (
    <section aria-labelledby={`nav-group-${group.id}`}>
      <div className="mb-2 px-3">
        <div className="flex items-center gap-2">
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: group.accent }}
            aria-hidden="true"
          />
          <h2
            id={`nav-group-${group.id}`}
            className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-foreground/70"
          >
            {group.label}
          </h2>
        </div>
        <p className="mt-1 pl-3.5 text-[0.7rem] leading-snug text-muted-foreground">
          {group.caption}
        </p>
      </div>
      <ul className="space-y-0.5 px-2">
        {group.items.map((item) => (
          <li key={item.href}>
            <SidebarNavItem
              item={item}
              accent={group.accent}
              onNavigate={onNavigate}
              touchFriendly={touchFriendly}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

function SidebarNavItem({
  item,
  accent,
  onNavigate,
  touchFriendly,
}: {
  item: NavItem
  accent: string
  onNavigate?: () => void
  touchFriendly?: boolean
}) {
  const accentStyle = { "--nav-accent": accent } as CSSProperties

  return (
    <NavLink
      to={item.href}
      onClick={onNavigate}
      style={accentStyle}
      className={({ isActive }) =>
        cn(
          "group/nav flex w-full items-center gap-3 rounded-xl px-2.5 text-left transition-[background,box-shadow,color]",
          touchFriendly ? "min-h-11 py-2" : "min-h-10 py-1.5",
          isActive
            ? "bg-[color-mix(in_oklch,var(--nav-accent)_14%,var(--sidebar))] text-sidebar-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--nav-accent)_28%,transparent)]"
            : "text-sidebar-foreground/85 hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground",
        )
      }
    >
      {({ isActive }) => (
        <>
          <NavItemIcon icon={item.icon} active={isActive} />
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[0.8125rem] leading-tight",
              isActive ? "font-semibold" : "font-medium",
            )}
          >
            {item.label}
          </span>
          {isActive ? (
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: accent }}
              aria-hidden="true"
            />
          ) : null}
        </>
      )}
    </NavLink>
  )
}

function NavItemIcon({
  icon: Icon,
  active,
}: {
  icon: NavItem["icon"]
  active: boolean
}) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
        active
          ? "bg-[color-mix(in_oklch,var(--nav-accent)_22%,var(--sidebar))] text-[var(--nav-accent)]"
          : "bg-muted/70 text-muted-foreground group-hover/nav:bg-muted group-hover/nav:text-foreground",
      )}
    >
      <Icon className="size-[1.05rem]" strokeWidth={active ? 2.25 : 2} />
    </span>
  )
}

export function SidebarUserFooter({
  name,
  email,
}: {
  name: string | null | undefined
  email: string | null | undefined
}) {
  const displayName = name?.trim() || email || "Signed in"
  const initials = getInitials(displayName)

  return (
    <div className="flex items-center gap-3">
      <div
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--chart-2)_18%,var(--sidebar))] text-xs font-semibold text-[var(--chart-2)] ring-1 ring-[color-mix(in_oklch,var(--chart-2)_35%,transparent)]"
        aria-hidden="true"
      >
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight">
          {displayName}
        </p>
        {email ? (
          <p className="truncate text-xs text-muted-foreground">{email}</p>
        ) : null}
      </div>
    </div>
  )
}

function getInitials(value: string) {
  const parts = value.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase()
  }
  return value.slice(0, 2).toUpperCase()
}
