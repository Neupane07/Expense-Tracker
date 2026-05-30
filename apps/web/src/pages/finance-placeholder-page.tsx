import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type FinancePlaceholderPageProps = {
  title: string
  scope: string
}

export function FinancePlaceholderPage({
  title,
  scope,
}: FinancePlaceholderPageProps) {
  return (
    <div className="max-w-3xl">
      <Card>
        <CardHeader className="space-y-2">
          <Badge variant="secondary" className="w-fit">
            Foundation
          </Badge>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>{scope}</p>
          <p>No records are available in this foundation phase.</p>
        </CardContent>
      </Card>
    </div>
  )
}

export function SwingScannerPage() {
  return (
    <FinancePlaceholderPage
      title="Swing Scanner"
      scope="Scanner logic is not implemented yet. A later phase will use verified portfolio, market data, research, and risk inputs."
    />
  )
}

export function TradeJournalPage() {
  return (
    <FinancePlaceholderPage
      title="Trade Journal"
      scope="Trade plans, exits, and post-trade reviews will be added in a later phase."
    />
  )
}

export function ResearchPage() {
  return (
    <FinancePlaceholderPage
      title="Research"
      scope="Company evidence, filings, news notes, and dated research will be added in a later phase."
    />
  )
}
