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

