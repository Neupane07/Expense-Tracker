import type { ComponentType } from "react"
import {
  BarChart3,
  BookOpenText,
  BriefcaseBusiness,
  ClipboardList,
  FileSpreadsheet,
  ListChecks,
  ReceiptText,
  ScanSearch,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react"

export type NavItem = {
  href: string
  label: string
  icon: ComponentType<{ className?: string; strokeWidth?: number }>
  adminOnly?: boolean
}

export type NavGroup = {
  id: string
  label: string
  caption: string
  accent: string
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  {
    id: "expenses",
    label: "Expenses",
    caption: "Imports, review & rules",
    accent: "var(--chart-1)",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
      { href: "/imports", label: "Imports", icon: FileSpreadsheet },
      { href: "/transactions", label: "Transactions", icon: ReceiptText },
      { href: "/review", label: "Review", icon: ListChecks },
      { href: "/rules", label: "Rules", icon: SlidersHorizontal },
    ],
  },
  {
    id: "finance-os",
    label: "Finance OS",
    caption: "Portfolio, markets & journal",
    accent: "var(--chart-2)",
    items: [
      { href: "/portfolio", label: "Portfolio", icon: BriefcaseBusiness },
      { href: "/scanner", label: "Swing Scanner", icon: ScanSearch },
      { href: "/trade-journal", label: "Trade Journal", icon: ClipboardList },
      { href: "/research", label: "Research", icon: BookOpenText },
      {
        href: "/settings/broker-connections/dhan",
        label: "Settings",
        icon: Settings,
      },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    caption: "Team access",
    accent: "var(--chart-4)",
    items: [
      {
        href: "/admin/invitations",
        label: "Invitations",
        icon: ShieldCheck,
        adminOnly: true,
      },
    ],
  },
]
