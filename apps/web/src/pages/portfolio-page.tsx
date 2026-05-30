import { type FormEvent, type ReactNode, useState } from "react"
import {
  Calculator,
  DatabaseZap,
  Pencil,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { apiDelete, apiGet, apiPatchJson, apiPostJson } from "@/lib/api-client"
import { formatDate, formatDateTime, formatMoney, formatNumber, formatPercent } from "@/lib/format"
import { useApiQuery } from "@/lib/use-api-query"
import { EmptyState, ErrorState, LoadingState } from "./page-state"

type DataQuality = {
  freshness?: string
  confidence?: string
  warnings?: string[]
  [key: string]: unknown
}

type Allocation = {
  stockValue: number
  etfValue: number
  mutualFundValue: number
  cashValue: number
  totalValue: number
  stockPercent: number
  etfPercent: number
  mutualFundPercent: number
  cashPercent: number
}

type PortfolioSnapshot = {
  id: string
  snapshotTime: string
  brokerAccountId: string | null
  allocation: Allocation
  mutualFunds: MutualFundsResponse
  warnings: string[]
  source: {
    brokerProvider: string
    syncRunId: string | null
    holdingCount: number
    fundSnapshotId: string | null
    mutualFundHoldingCount: number
  }
}

type Holding = {
  id: string
  asOf: string
  exchange: string | null
  tradingSymbol: string
  securityId: string | null
  isin: string | null
  assetClass: string
  totalQty: number
  availableQty: number
  avgCostPrice: number
  costValue: number
  marketValue: number
}

type Order = {
  id: string
  asOf: string
  orderId: string
  orderStatus: string
  transactionType: string
  exchangeSegment: string | null
  productType: string | null
  orderType: string | null
  tradingSymbol: string | null
  quantity: number
  price: number
  averageTradedPrice: number
  filledQty: number
  remainingQuantity: number
  createTime: string | null
  updateTime: string | null
  exchangeTime: string | null
}

type MutualFundHolding = {
  id: string
  folioLastFour: string | null
  schemeCode: string | null
  schemeName: string
  units: number
  avgCostNav: number | null
  costValue: number | null
  nav: number | null
  navDate: string | null
  navSource: string | null
  currentValue: number
  pnl: number
  warnings?: string[]
}

type MutualFundsResponse = {
  asOf: string
  holdings: MutualFundHolding[]
  totalValue: number
  warnings: string[]
}

type SyncDhanResponse = {
  sync: {
    syncRunId: string
    provider: string
    counts?: {
      holdings?: number
      positions?: number
      orders?: number
      trades?: number
      funds?: number
    }
    holdings?: { count?: number }
    positions?: { count?: number }
    orders?: { count?: number }
    trades?: { count?: number }
    funds?: { count?: number }
    warnings: string[]
  }
  snapshot: PortfolioSnapshot
}

type AmfiSyncResponse = {
  source: string
  totalSchemes: number
  holdingCount: number
  matched: number
  unmatched: number
  navsUpserted: number
}

type MarketInstrument = {
  symbol: string
  exchange: string
  securityId: string | null
  isin: string | null
  name: string
  instrumentType: string
  sector: string | null
  industry: string | null
  isActive: boolean
  source: string
  asOf: string | null
  dataQuality: DataQuality
  warnings: string[]
}

type LatestPriceResponse = {
  instrument: MarketInstrument
  price: {
    ltp: number
    open: number | null
    high: number | null
    low: number | null
    previousClose: number | null
    volume: number | null
    source: string
    timestamp: string
    freshness: string
    dataQuality: DataQuality
    warnings: string[]
  } | null
  source: string
  asOf: string
  timestamp: string | null
  dataQuality: DataQuality
  warnings: string[]
}

type CandlesResponse = {
  instrument: MarketInstrument
  candles: Array<{
    id: string
    date: string
    open: number
    high: number
    low: number
    close: number
    volume: number | null
    source: string
    isAdjusted: boolean
    warnings: string[]
  }>
  source: string
  asOf: string
  timestamp: string | null
  dataQuality: DataQuality
  warnings: string[]
}

type IndicatorsResponse = {
  instrument: MarketInstrument
  indicators: {
    asOfDate: string
    sma20: number | null
    sma50: number | null
    sma200: number | null
    rsi14: number | null
    atr14: number | null
    volumeAverage20: number | null
    volumeRatio: number | null
    distanceFromSma50: number | null
    source: string
    dataQuality: DataQuality
    warnings: string[]
  }
  source: string
  asOf: string
  timestamp: string
  dataQuality: DataQuality
  warnings: string[]
}

type MarketLookupResult = {
  instrument: ResultState<MarketInstrument>
  price: ResultState<LatestPriceResponse>
  candles: ResultState<CandlesResponse>
  indicators: ResultState<IndicatorsResponse>
}

type ResultState<T> = {
  data: T | null
  error: string | null
}

type TradeValidationResult = {
  valid: boolean
  symbol: string
  entry: number
  target: number
  stopLoss: number
  quantity: number
  capitalRequired: number
  riskPerShare: number
  rewardPerShare: number
  riskReward: number
  maxLossAmount: number
  targetProfitAmount: number
  portfolioExposureBefore: { amount: number; percent: number }
  portfolioExposureAfter: { amount: number; percent: number }
  warnings: string[]
  rejectReasons: string[]
  dataQuality: {
    source: string | null
    asOf: string | null
    freshness: string
    confidence: string
    warnings: string[]
  }
}

type PositionSizeResult = {
  entry: number
  stopLoss: number
  availableCash: number
  maxCapitalPerTrade: number
  maxRiskPerTrade: number
  riskPerShare: number
  quantityByCapital: number
  quantityByRisk: number
  quantity: number
  capitalRequired: number
  maxLossAmount: number
  warnings: string[]
}

type PortfolioRisk = {
  totalPortfolioValue: number
  cash: number
  activeSwingCapital: number
  activeSwingTradeCount: number
  maxLossIfActiveStopLossesHit: number
  topHoldingsConcentration: Array<{
    symbol: string
    name: string
    assetClass: string
    marketValue: number
    quantity: number
    sector: string | null
    theme: string | null
    weightPct: number
  }>
  assetAllocation: {
    stock: number
    etf: number
    mutualFund: number
    cash: number
  }
  sectorExposure: Array<{ sector: string; value: number; weightPct: number }>
  themeExposure: Array<{ theme: string; value: number; weightPct: number }>
  warnings: string[]
}

type MutualFundForm = {
  id: string | null
  schemeName: string
  schemeCode: string
  folioLastFour: string
  units: string
  avgCostNav: string
  costValue: string
}

type TradeForm = {
  symbol: string
  entry: string
  target: string
  stopLoss: string
  quantity: string
  capital: string
}

type PositionSizeForm = {
  entry: string
  stopLoss: string
  availableCash: string
  maxCapitalPerTrade: string
  maxRiskPerTrade: string
}

const emptyMutualFundForm: MutualFundForm = {
  id: null,
  schemeName: "",
  schemeCode: "",
  folioLastFour: "",
  units: "",
  avgCostNav: "",
  costValue: "",
}

const emptyTradeForm: TradeForm = {
  symbol: "",
  entry: "",
  target: "",
  stopLoss: "",
  quantity: "",
  capital: "",
}

const emptyPositionSizeForm: PositionSizeForm = {
  entry: "",
  stopLoss: "",
  availableCash: "",
  maxCapitalPerTrade: "",
  maxRiskPerTrade: "",
}

export function PortfolioPage() {
  const [refreshKey, setRefreshKey] = useState(0)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const snapshotQuery = useApiQuery<PortfolioSnapshot>(
    `/portfolio/snapshot?refresh=${refreshKey}`,
  )
  const holdingsQuery = useApiQuery<Holding[]>(
    `/portfolio/holdings?refresh=${refreshKey}`,
  )
  const ordersQuery = useApiQuery<Order[]>(`/portfolio/orders?refresh=${refreshKey}`)

  async function syncDhan() {
    setIsSyncing(true)
    setSyncMessage(null)
    setSyncError(null)

    try {
      const result = await apiPostJson<SyncDhanResponse>("/portfolio/sync/dhan", {})
      const counts = getSyncCounts(result.sync)
      setSyncMessage(
        `Dhan sync completed. Holdings: ${counts.holdings}, orders: ${counts.orders}.`,
      )
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Unable to sync Dhan")
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Portfolio</CardTitle>
            <CardDescription>
              Read-only broker, mutual fund, market-data, and risk workspace.
            </CardDescription>
          </div>
          <Button onClick={syncDhan} disabled={isSyncing}>
            <RefreshCw className={isSyncing ? "size-4 animate-spin" : "size-4"} />
            {isSyncing ? "Syncing Dhan" : "Sync Dhan"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Broker operations here are read-only. Saved Dhan secrets stay behind the
            API boundary.
          </p>
          {syncMessage ? <SuccessBanner message={syncMessage} /> : null}
          {syncError ? <ErrorState message={syncError} /> : null}
        </CardContent>
      </Card>

      <Tabs defaultValue="holdings" className="space-y-4">
        <TabsList className="flex w-full justify-start overflow-x-auto">
          <TabsTrigger value="holdings">Holdings</TabsTrigger>
          <TabsTrigger value="mutual-funds">Mutual Funds</TabsTrigger>
          <TabsTrigger value="market-data">Market Data</TabsTrigger>
          <TabsTrigger value="risk">Risk</TabsTrigger>
        </TabsList>

        <TabsContent value="holdings" className="space-y-5">
          <HoldingsSection
            snapshotQuery={snapshotQuery}
            holdingsQuery={holdingsQuery}
            ordersQuery={ordersQuery}
          />
        </TabsContent>
        <TabsContent value="mutual-funds">
          <MutualFundsSection refreshKey={refreshKey} onRefresh={() => setRefreshKey((value) => value + 1)} />
        </TabsContent>
        <TabsContent value="market-data">
          <MarketDataSection />
        </TabsContent>
        <TabsContent value="risk">
          <RiskSection refreshKey={refreshKey} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function HoldingsSection({
  snapshotQuery,
  holdingsQuery,
  ordersQuery,
}: {
  snapshotQuery: ReturnType<typeof useApiQuery<PortfolioSnapshot>>
  holdingsQuery: ReturnType<typeof useApiQuery<Holding[]>>
  ordersQuery: ReturnType<typeof useApiQuery<Order[]>>
}) {
  if (snapshotQuery.isLoading || holdingsQuery.isLoading || ordersQuery.isLoading) {
    return <LoadingState message="Loading portfolio snapshot" />
  }

  if (snapshotQuery.error || holdingsQuery.error || ordersQuery.error) {
    return (
      <ErrorState
        message={
          snapshotQuery.error ??
          holdingsQuery.error ??
          ordersQuery.error ??
          "Portfolio data is unavailable"
        }
      />
    )
  }

  if (!snapshotQuery.data || !holdingsQuery.data || !ordersQuery.data) {
    return <ErrorState message="Portfolio data is unavailable" />
  }

  const snapshot = snapshotQuery.data
  const allocation = snapshot.allocation

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total value" value={formatMoney(allocation.totalValue)} />
        <MetricCard label="Cash" value={formatMoney(allocation.cashValue)} />
        <MetricCard label="Stock + ETF" value={formatMoney(allocation.stockValue + allocation.etfValue)} />
        <MetricCard label="Mutual funds" value={formatMoney(allocation.mutualFundValue)} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Allocation</CardTitle>
            <CardDescription>
              Snapshot as of {formatDateTime(snapshot.snapshotTime)} from {snapshot.source.brokerProvider}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <AllocationRow label="Stocks" amount={allocation.stockValue} percent={allocation.stockPercent} />
            <AllocationRow label="ETF" amount={allocation.etfValue} percent={allocation.etfPercent} />
            <AllocationRow label="Mutual funds" amount={allocation.mutualFundValue} percent={allocation.mutualFundPercent} />
            <AllocationRow label="Cash" amount={allocation.cashValue} percent={allocation.cashPercent} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data Freshness</CardTitle>
            <CardDescription>
              Broker holdings: {snapshot.source.holdingCount}; MF holdings: {snapshot.source.mutualFundHoldingCount}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <FreshnessBadge warnings={snapshot.warnings} />
            <WarningsList warnings={snapshot.warnings} />
            <KeyValue label="Broker account" value={snapshot.brokerAccountId ?? "Not available"} />
            <KeyValue label="Sync run" value={snapshot.source.syncRunId ?? "Latest stored data"} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Holdings</CardTitle>
          <CardDescription>Latest synced broker holdings.</CardDescription>
        </CardHeader>
        <CardContent>
          {holdingsQuery.data.length === 0 ? (
            <EmptyState message="No synced Dhan holdings are available." />
          ) : (
            <TableScroll>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Asset</TableHead>
                    <TableHead>Exchange</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Avg cost</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead>As of</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holdingsQuery.data.map((holding) => (
                    <TableRow key={holding.id}>
                      <TableCell className="font-medium">
                        {holding.tradingSymbol}
                        {!holding.securityId ? (
                          <Badge variant="outline" className="ml-2">
                            unmapped
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>{holding.assetClass}</TableCell>
                      <TableCell>{holding.exchange ?? "-"}</TableCell>
                      <TableCell className="text-right">{formatNumber(holding.totalQty)}</TableCell>
                      <TableCell className="text-right">{formatMoney(holding.avgCostPrice)}</TableCell>
                      <TableCell className="text-right">{formatMoney(holding.costValue)}</TableCell>
                      <TableCell className="text-right">{formatMoney(holding.marketValue)}</TableCell>
                      <TableCell>{formatDateTime(holding.asOf)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableScroll>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Broker Orders</CardTitle>
          <CardDescription>
            Read-only order history from Dhan. These rows are executions/orders, not
            current holdings or open positions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ordersQuery.data.length === 0 ? (
            <EmptyState message="No synced Dhan orders are available." />
          ) : (
            <TableScroll>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Updated</TableHead>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Filled</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Avg traded</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ordersQuery.data.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>{formatDateTime(order.updateTime ?? order.asOf)}</TableCell>
                      <TableCell className="font-medium">{order.tradingSymbol ?? "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{order.orderStatus}</Badge>
                      </TableCell>
                      <TableCell>{order.transactionType}</TableCell>
                      <TableCell>{order.productType ?? "-"}</TableCell>
                      <TableCell className="text-right">{formatNumber(order.quantity)}</TableCell>
                      <TableCell className="text-right">{formatNumber(order.filledQty)}</TableCell>
                      <TableCell className="text-right">{formatMoney(order.price)}</TableCell>
                      <TableCell className="text-right">{formatMoney(order.averageTradedPrice)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableScroll>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function MutualFundsSection({
  refreshKey,
  onRefresh,
}: {
  refreshKey: number
  onRefresh: () => void
}) {
  const [form, setForm] = useState<MutualFundForm>(emptyMutualFundForm)
  const [message, setMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const mutualFundsQuery = useApiQuery<MutualFundsResponse>(
    `/portfolio/mutual-funds?refresh=${refreshKey}`,
  )

  async function submitHolding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSaving(true)
    setMessage(null)
    setActionError(null)

    const payload = {
      schemeName: form.schemeName,
      schemeCode: nullableText(form.schemeCode),
      folioLastFour: nullableText(form.folioLastFour),
      units: form.units,
      avgCostNav: nullableText(form.avgCostNav),
      costValue: nullableText(form.costValue),
    }

    try {
      if (form.id) {
        await apiPatchJson(`/portfolio/mutual-funds/${form.id}`, payload)
        setMessage("Mutual fund holding updated.")
      } else {
        await apiPostJson("/portfolio/mutual-funds", payload)
        setMessage("Mutual fund holding added.")
      }
      setForm(emptyMutualFundForm)
      onRefresh()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to save mutual fund")
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteHolding(holdingId: string) {
    setIsSaving(true)
    setMessage(null)
    setActionError(null)

    try {
      await apiDelete(`/portfolio/mutual-funds/${holdingId}`)
      setMessage("Mutual fund holding deleted.")
      onRefresh()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to delete mutual fund")
    } finally {
      setIsSaving(false)
    }
  }

  async function syncAmfiNav() {
    setIsSaving(true)
    setMessage(null)
    setActionError(null)

    try {
      const result = await apiPostJson<AmfiSyncResponse>("/portfolio/sync/amfi-nav", {})
      setMessage(
        `AMFI NAV sync completed. Matched ${result.matched}/${result.holdingCount}; NAV rows upserted: ${result.navsUpserted}.`,
      )
      onRefresh()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to sync AMFI NAV")
    } finally {
      setIsSaving(false)
    }
  }

  function editHolding(holding: MutualFundHolding) {
    setForm({
      id: holding.id,
      schemeName: holding.schemeName,
      schemeCode: holding.schemeCode ?? "",
      folioLastFour: holding.folioLastFour ?? "",
      units: String(holding.units),
      avgCostNav: holding.avgCostNav == null ? "" : String(holding.avgCostNav),
      costValue: holding.costValue == null ? "" : String(holding.costValue),
    })
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>{form.id ? "Edit Mutual Fund" : "Add Mutual Fund"}</CardTitle>
          <CardDescription>Manual holdings only; NAV valuation is synced from AMFI.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submitHolding}>
            <Field label="Scheme name" id="mf-scheme-name">
              <Input
                id="mf-scheme-name"
                value={form.schemeName}
                onChange={(event) => setForm((state) => ({ ...state, schemeName: event.target.value }))}
                required
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Scheme code" id="mf-scheme-code">
                <Input
                  id="mf-scheme-code"
                  value={form.schemeCode}
                  onChange={(event) => setForm((state) => ({ ...state, schemeCode: event.target.value }))}
                />
              </Field>
              <Field label="Folio last 4" id="mf-folio">
                <Input
                  id="mf-folio"
                  value={form.folioLastFour}
                  onChange={(event) => setForm((state) => ({ ...state, folioLastFour: event.target.value }))}
                />
              </Field>
              <Field label="Units" id="mf-units">
                <Input
                  id="mf-units"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={form.units}
                  onChange={(event) => setForm((state) => ({ ...state, units: event.target.value }))}
                  required
                />
              </Field>
              <Field label="Average NAV" id="mf-avg-cost">
                <Input
                  id="mf-avg-cost"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={form.avgCostNav}
                  onChange={(event) => setForm((state) => ({ ...state, avgCostNav: event.target.value }))}
                />
              </Field>
            </div>
            <Field label="Cost value" id="mf-cost">
              <Input
                id="mf-cost"
                type="number"
                min="0"
                step="0.01"
                value={form.costValue}
                onChange={(event) => setForm((state) => ({ ...state, costValue: event.target.value }))}
              />
            </Field>

            {message ? <SuccessBanner message={message} /> : null}
            {actionError ? <ErrorState message={actionError} /> : null}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={isSaving}>
                <Save className="size-4" />
                {form.id ? "Update holding" : "Add holding"}
              </Button>
              <Button type="button" variant="outline" onClick={syncAmfiNav} disabled={isSaving}>
                <DatabaseZap className="size-4" />
                Sync AMFI NAV
              </Button>
              {form.id ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setForm(emptyMutualFundForm)}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manual Mutual Fund Holdings</CardTitle>
          <CardDescription>
            Current value uses latest matched AMFI NAV when available.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {mutualFundsQuery.isLoading ? <LoadingState message="Loading mutual funds" /> : null}
          {mutualFundsQuery.error ? <ErrorState message={mutualFundsQuery.error} /> : null}
          {mutualFundsQuery.data ? (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <MetricCard label="Current value" value={formatMoney(mutualFundsQuery.data.totalValue)} />
                <MetricCard label="Holdings" value={String(mutualFundsQuery.data.holdings.length)} />
                <MetricCard label="As of" value={formatDateTime(mutualFundsQuery.data.asOf)} />
              </div>
              <WarningsList warnings={mutualFundsQuery.data.warnings} />
              {mutualFundsQuery.data.holdings.length === 0 ? (
                <EmptyState message="No manual mutual fund holdings yet." />
              ) : (
                <TableScroll>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Scheme</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead className="text-right">Units</TableHead>
                        <TableHead className="text-right">NAV</TableHead>
                        <TableHead>NAV date</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead className="text-right">P&L</TableHead>
                        <TableHead>Warnings</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mutualFundsQuery.data.holdings.map((holding) => (
                        <TableRow key={holding.id}>
                          <TableCell className="min-w-56 font-medium">{holding.schemeName}</TableCell>
                          <TableCell>{holding.schemeCode ?? "-"}</TableCell>
                          <TableCell className="text-right">{formatNumber(holding.units)}</TableCell>
                          <TableCell className="text-right">{formatNumber(holding.nav)}</TableCell>
                          <TableCell>{formatDate(holding.navDate)}</TableCell>
                          <TableCell className="text-right">{formatMoney(holding.costValue)}</TableCell>
                          <TableCell className="text-right">{formatMoney(holding.currentValue)}</TableCell>
                          <TableCell className="text-right">{formatMoney(holding.pnl)}</TableCell>
                          <TableCell>
                            <InlineWarnings warnings={holding.warnings} />
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                type="button"
                                onClick={() => editHolding(holding)}
                                aria-label={`Edit ${holding.schemeName}`}
                              >
                                <Pencil className="size-4" />
                              </Button>
                              <Button
                                size="icon-sm"
                                variant="destructive"
                                type="button"
                                disabled={isSaving}
                                onClick={() => void deleteHolding(holding.id)}
                                aria-label={`Delete ${holding.schemeName}`}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableScroll>
              )}
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

function MarketDataSection() {
  const [symbol, setSymbol] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [activeSymbol, setActiveSymbol] = useState("")
  const [result, setResult] = useState<MarketLookupResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function lookup(event?: FormEvent<HTMLFormElement>, requestedSymbol = symbol) {
    event?.preventDefault()
    const normalized = requestedSymbol.trim().toUpperCase()

    if (!normalized) {
      return
    }

    setIsLoading(true)
    setActiveSymbol(normalized)

    const candleQuery = new URLSearchParams()
    if (from) {
      candleQuery.set("from", from)
    }
    if (to) {
      candleQuery.set("to", to)
    }
    const candlePath = `/market-data/candles/${normalized}${candleQuery.toString() ? `?${candleQuery.toString()}` : ""}`

    const [instrument, price, candles, indicators] = await Promise.all([
      safeGet<MarketInstrument>(`/market-data/instruments/${normalized}`),
      safeGet<LatestPriceResponse>(`/market-data/prices/${normalized}/latest`),
      safeGet<CandlesResponse>(candlePath),
      safeGet<IndicatorsResponse>(`/market-data/indicators/${normalized}/latest`),
    ])

    setResult({ instrument, price, candles, indicators })
    setIsLoading(false)
  }

  async function recalculateIndicators() {
    if (!activeSymbol) {
      return
    }

    setIsLoading(true)
    const indicators = await safePost<IndicatorsResponse>(
      `/market-data/indicators/recalculate/${activeSymbol}`,
    )
    setResult((state) =>
      state
        ? { ...state, indicators }
        : {
            instrument: { data: null, error: null },
            price: { data: null, error: null },
            candles: { data: null, error: null },
            indicators,
          },
    )
    setIsLoading(false)
  }

  const price = result?.price.data?.price
  const priceQuality = result?.price.data?.dataQuality
  const candles = result?.candles.data?.candles ?? []
  const indicators = result?.indicators.data?.indicators

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Symbol Lookup</CardTitle>
          <CardDescription>
            Reads instrument mapping, latest price, candles, and indicators from the API.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-[220px_180px_180px_auto]" onSubmit={lookup}>
            <Field label="Symbol" id="market-symbol">
              <Input
                id="market-symbol"
                value={symbol}
                onChange={(event) => setSymbol(event.target.value.toUpperCase())}
                placeholder="INFY"
              />
            </Field>
            <Field label="Candles from" id="market-from">
              <Input id="market-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </Field>
            <Field label="Candles to" id="market-to">
              <Input id="market-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </Field>
            <div className="flex items-end gap-2">
              <Button type="submit" disabled={isLoading || !symbol.trim()}>
                <Search className="size-4" />
                Lookup
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isLoading || !activeSymbol}
                onClick={() => void recalculateIndicators()}
              >
                <Calculator className="size-4" />
                Recalculate
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {isLoading ? <LoadingState message="Loading market data" /> : null}
      {result ? (
        <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>{activeSymbol}</CardTitle>
              <CardDescription>Latest price and data quality.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {result.instrument.error ? <ErrorState message={result.instrument.error} /> : null}
              {result.price.error ? <ErrorState message={result.price.error} /> : null}
              {price ? (
                <>
                  <MetricCard label="LTP" value={formatMoney(price.ltp)} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <KeyValue label="Open" value={formatMoney(price.open)} />
                    <KeyValue label="High" value={formatMoney(price.high)} />
                    <KeyValue label="Low" value={formatMoney(price.low)} />
                    <KeyValue label="Prev close" value={formatMoney(price.previousClose)} />
                    <KeyValue label="Volume" value={formatNumber(price.volume)} />
                    <KeyValue label="Timestamp" value={formatDateTime(price.timestamp)} />
                  </div>
                  <KeyValue label="Source" value={price.source} />
                  <DataQualityPanel dataQuality={priceQuality} warnings={result.price.data?.warnings ?? []} />
                </>
              ) : result.price.error ? null : (
                <EmptyState message="No latest price is available for this symbol." />
              )}
            </CardContent>
          </Card>

          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle>Instrument</CardTitle>
              </CardHeader>
              <CardContent>
                {result.instrument.data ? (
                  <div className="grid gap-3 md:grid-cols-4">
                    <KeyValue label="Name" value={result.instrument.data.name} />
                    <KeyValue label="Exchange" value={result.instrument.data.exchange} />
                    <KeyValue label="Type" value={result.instrument.data.instrumentType} />
                    <KeyValue label="Security ID" value={result.instrument.data.securityId ?? "Missing"} />
                    <KeyValue label="ISIN" value={result.instrument.data.isin ?? "-"} />
                    <KeyValue label="Sector" value={result.instrument.data.sector ?? "Unmapped"} />
                    <KeyValue label="Industry" value={result.instrument.data.industry ?? "Unmapped"} />
                    <KeyValue label="Verified" value={formatDateTime(result.instrument.data.asOf)} />
                  </div>
                ) : result.instrument.error ? null : (
                  <EmptyState message="Instrument mapping is not available." />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>Indicators</CardTitle>
                  <CardDescription>Displayed values only; scanner scoring is not calculated here.</CardDescription>
                </div>
                {indicators ? <Badge variant="outline">As of {formatDate(indicators.asOfDate)}</Badge> : null}
              </CardHeader>
              <CardContent className="space-y-4">
                {result.indicators.error ? <ErrorState message={result.indicators.error} /> : null}
                {indicators ? (
                  <>
                    <div className="grid gap-3 md:grid-cols-4">
                      <MetricCard label="SMA 20" value={formatNumber(indicators.sma20)} />
                      <MetricCard label="SMA 50" value={formatNumber(indicators.sma50)} />
                      <MetricCard label="SMA 200" value={formatNumber(indicators.sma200)} />
                      <MetricCard label="RSI 14" value={formatNumber(indicators.rsi14)} />
                      <MetricCard label="ATR 14" value={formatNumber(indicators.atr14)} />
                      <MetricCard label="Volume avg 20" value={formatNumber(indicators.volumeAverage20)} />
                      <MetricCard label="Volume ratio" value={formatNumber(indicators.volumeRatio)} />
                      <MetricCard label="Distance SMA 50" value={formatPercent(indicators.distanceFromSma50)} />
                    </div>
                    <DataQualityPanel dataQuality={indicators.dataQuality} warnings={indicators.warnings} />
                  </>
                ) : result.indicators.error ? null : (
                  <EmptyState message="No indicators are available yet." />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Daily Candles</CardTitle>
                <CardDescription>
                  {candles.length} rows returned from {result.candles.data?.source ?? "market-data API"}.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {result.candles.error ? <ErrorState message={result.candles.error} /> : null}
                {result.candles.data ? (
                  <>
                    <DataQualityPanel dataQuality={result.candles.data.dataQuality} warnings={result.candles.data.warnings} />
                    {candles.length === 0 ? (
                      <EmptyState message="No candle rows are available." />
                    ) : (
                      <TableScroll>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead className="text-right">Open</TableHead>
                              <TableHead className="text-right">High</TableHead>
                              <TableHead className="text-right">Low</TableHead>
                              <TableHead className="text-right">Close</TableHead>
                              <TableHead className="text-right">Volume</TableHead>
                              <TableHead>Source</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {candles.slice(-20).map((candle) => (
                              <TableRow key={candle.id}>
                                <TableCell>{formatDate(candle.date)}</TableCell>
                                <TableCell className="text-right">{formatNumber(candle.open)}</TableCell>
                                <TableCell className="text-right">{formatNumber(candle.high)}</TableCell>
                                <TableCell className="text-right">{formatNumber(candle.low)}</TableCell>
                                <TableCell className="text-right">{formatNumber(candle.close)}</TableCell>
                                <TableCell className="text-right">{formatNumber(candle.volume)}</TableCell>
                                <TableCell>{candle.source}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableScroll>
                    )}
                  </>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <EmptyState message="Search a mapped symbol to inspect market data." />
      )}
    </div>
  )
}

function RiskSection({ refreshKey }: { refreshKey: number }) {
  const [tradeForm, setTradeForm] = useState<TradeForm>(emptyTradeForm)
  const [positionForm, setPositionForm] = useState<PositionSizeForm>(emptyPositionSizeForm)
  const [tradeResult, setTradeResult] = useState<TradeValidationResult | null>(null)
  const [positionResult, setPositionResult] = useState<PositionSizeResult | null>(null)
  const [tradeError, setTradeError] = useState<string | null>(null)
  const [positionError, setPositionError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const portfolioRiskQuery = useApiQuery<PortfolioRisk>(`/risk/portfolio?refresh=${refreshKey}`)

  async function validateTrade(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setTradeError(null)
    setTradeResult(null)

    try {
      const result = await apiPostJson<TradeValidationResult>("/risk/validate-trade", {
        symbol: tradeForm.symbol,
        side: "BUY",
        entry: Number(tradeForm.entry),
        target: Number(tradeForm.target),
        stopLoss: Number(tradeForm.stopLoss),
        product: "DELIVERY",
        ...(tradeForm.quantity ? { quantity: Number(tradeForm.quantity) } : {}),
        ...(tradeForm.capital && !tradeForm.quantity ? { capital: Number(tradeForm.capital) } : {}),
      })
      setTradeResult(result)
    } catch (error) {
      setTradeError(error instanceof Error ? error.message : "Unable to validate trade")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function calculatePositionSize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setPositionError(null)
    setPositionResult(null)

    try {
      const result = await apiPostJson<PositionSizeResult>("/risk/position-size", {
        entry: Number(positionForm.entry),
        stopLoss: Number(positionForm.stopLoss),
        ...(positionForm.availableCash ? { availableCash: Number(positionForm.availableCash) } : {}),
        ...(positionForm.maxCapitalPerTrade ? { maxCapitalPerTrade: Number(positionForm.maxCapitalPerTrade) } : {}),
        ...(positionForm.maxRiskPerTrade ? { maxRiskPerTrade: Number(positionForm.maxRiskPerTrade) } : {}),
      })
      setPositionResult(result)
    } catch (error) {
      setPositionError(error instanceof Error ? error.message : "Unable to calculate position size")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Trade Validation</CardTitle>
            <CardDescription>
              BUY and DELIVERY are fixed. Research-only — verify and place orders manually in Dhan.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={validateTrade}>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Symbol" id="risk-symbol">
                  <Input
                    id="risk-symbol"
                    value={tradeForm.symbol}
                    onChange={(event) => setTradeForm((state) => ({ ...state, symbol: event.target.value.toUpperCase() }))}
                    required
                  />
                </Field>
                <ReadonlyField label="Side" value="BUY" />
                <Field label="Entry" id="risk-entry">
                  <Input id="risk-entry" type="number" step="0.01" value={tradeForm.entry} onChange={(event) => setTradeForm((state) => ({ ...state, entry: event.target.value }))} required />
                </Field>
                <Field label="Target" id="risk-target">
                  <Input id="risk-target" type="number" step="0.01" value={tradeForm.target} onChange={(event) => setTradeForm((state) => ({ ...state, target: event.target.value }))} required />
                </Field>
                <Field label="Stop loss" id="risk-stop">
                  <Input id="risk-stop" type="number" step="0.01" value={tradeForm.stopLoss} onChange={(event) => setTradeForm((state) => ({ ...state, stopLoss: event.target.value }))} required />
                </Field>
                <ReadonlyField label="Product" value="DELIVERY" />
                <Field label="Quantity" id="risk-quantity">
                  <Input id="risk-quantity" type="number" min="0" step="1" value={tradeForm.quantity} onChange={(event) => setTradeForm((state) => ({ ...state, quantity: event.target.value }))} />
                </Field>
                <Field label="Capital" id="risk-capital">
                  <Input id="risk-capital" type="number" min="0" step="0.01" value={tradeForm.capital} onChange={(event) => setTradeForm((state) => ({ ...state, capital: event.target.value }))} />
                </Field>
              </div>
              <Button type="submit" disabled={isSubmitting}>
                <ShieldIcon />
                Validate
              </Button>
            </form>
            {tradeError ? <div className="mt-4"><ErrorState message={tradeError} /></div> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Position Size</CardTitle>
            <CardDescription>Uses backend portfolio defaults when cash or limits are blank.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={calculatePositionSize}>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Entry" id="size-entry">
                  <Input id="size-entry" type="number" step="0.01" value={positionForm.entry} onChange={(event) => setPositionForm((state) => ({ ...state, entry: event.target.value }))} required />
                </Field>
                <Field label="Stop loss" id="size-stop">
                  <Input id="size-stop" type="number" step="0.01" value={positionForm.stopLoss} onChange={(event) => setPositionForm((state) => ({ ...state, stopLoss: event.target.value }))} required />
                </Field>
                <Field label="Available cash" id="size-cash">
                  <Input id="size-cash" type="number" step="0.01" value={positionForm.availableCash} onChange={(event) => setPositionForm((state) => ({ ...state, availableCash: event.target.value }))} />
                </Field>
                <Field label="Capital cap" id="size-capital-cap">
                  <Input id="size-capital-cap" type="number" step="0.01" value={positionForm.maxCapitalPerTrade} onChange={(event) => setPositionForm((state) => ({ ...state, maxCapitalPerTrade: event.target.value }))} />
                </Field>
                <Field label="Risk cap" id="size-risk-cap">
                  <Input id="size-risk-cap" type="number" step="0.01" value={positionForm.maxRiskPerTrade} onChange={(event) => setPositionForm((state) => ({ ...state, maxRiskPerTrade: event.target.value }))} />
                </Field>
              </div>
              <Button type="submit" disabled={isSubmitting}>
                <Calculator className="size-4" />
                Calculate
              </Button>
            </form>
            {positionError ? <div className="mt-4"><ErrorState message={positionError} /></div> : null}
          </CardContent>
        </Card>
      </div>

      {tradeResult ? <TradeValidationCard result={tradeResult} /> : null}
      {positionResult ? <PositionSizeCard result={positionResult} /> : null}
      <PortfolioRiskCard query={portfolioRiskQuery} />
    </div>
  )
}

function TradeValidationCard({ result }: { result: TradeValidationResult }) {
  return (
    <Card>
      <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>Validation Result</CardTitle>
          <CardDescription>{result.symbol} BUY / DELIVERY</CardDescription>
        </div>
        <Badge variant={result.valid ? "default" : "destructive"}>
          {result.valid ? "Valid" : "Invalid"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <MetricCard label="Quantity" value={formatNumber(result.quantity)} />
          <MetricCard label="Capital required" value={formatMoney(result.capitalRequired)} />
          <MetricCard label="Risk/share" value={formatMoney(result.riskPerShare)} />
          <MetricCard label="Reward/share" value={formatMoney(result.rewardPerShare)} />
          <MetricCard label="Risk/reward" value={formatNumber(result.riskReward)} />
          <MetricCard label="Max loss" value={formatMoney(result.maxLossAmount)} />
          <MetricCard label="Target profit" value={formatMoney(result.targetProfitAmount)} />
          <MetricCard label="Data freshness" value={result.dataQuality.freshness} />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <MetricCard
            label="Exposure before"
            value={`${formatMoney(result.portfolioExposureBefore.amount)} (${formatPercent(result.portfolioExposureBefore.percent)})`}
          />
          <MetricCard
            label="Exposure after"
            value={`${formatMoney(result.portfolioExposureAfter.amount)} (${formatPercent(result.portfolioExposureAfter.percent)})`}
          />
        </div>
        <DataQualityPanel dataQuality={result.dataQuality} warnings={result.dataQuality.warnings} />
        <ReasonList title="Reject Reasons" values={result.rejectReasons} variant="destructive" />
        <ReasonList title="Warnings" values={result.warnings} variant="outline" />
      </CardContent>
    </Card>
  )
}

function PositionSizeCard({ result }: { result: PositionSizeResult }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Position Size Result</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <MetricCard label="Quantity" value={formatNumber(result.quantity)} />
          <MetricCard label="Capital required" value={formatMoney(result.capitalRequired)} />
          <MetricCard label="Max loss" value={formatMoney(result.maxLossAmount)} />
          <MetricCard label="Risk/share" value={formatMoney(result.riskPerShare)} />
          <MetricCard label="Qty by capital" value={formatNumber(result.quantityByCapital)} />
          <MetricCard label="Qty by risk" value={formatNumber(result.quantityByRisk)} />
          <MetricCard label="Capital cap" value={formatMoney(result.maxCapitalPerTrade)} />
          <MetricCard label="Risk cap" value={formatMoney(result.maxRiskPerTrade)} />
        </div>
        <ReasonList title="Warnings" values={result.warnings} variant="outline" />
      </CardContent>
    </Card>
  )
}

function PortfolioRiskCard({
  query,
}: {
  query: ReturnType<typeof useApiQuery<PortfolioRisk>>
}) {
  if (query.isLoading) {
    return <LoadingState message="Loading portfolio risk" />
  }

  if (query.error || !query.data) {
    return <ErrorState message={query.error ?? "Portfolio risk is unavailable"} />
  }

  const risk = query.data

  return (
    <Card>
      <CardHeader>
        <CardTitle>Portfolio Risk</CardTitle>
        <CardDescription>Portfolio-level risk state from the backend risk engine.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-4">
          <MetricCard label="Portfolio value" value={formatMoney(risk.totalPortfolioValue)} />
          <MetricCard label="Cash" value={formatMoney(risk.cash)} />
          <MetricCard label="Active swing capital" value={formatMoney(risk.activeSwingCapital)} />
          <MetricCard label="Active swing trades" value={formatNumber(risk.activeSwingTradeCount)} />
          <MetricCard label="Max SL loss" value={formatMoney(risk.maxLossIfActiveStopLossesHit)} />
          <MetricCard label="Stock allocation" value={formatMoney(risk.assetAllocation.stock)} />
          <MetricCard label="MF allocation" value={formatMoney(risk.assetAllocation.mutualFund)} />
          <MetricCard label="ETF allocation" value={formatMoney(risk.assetAllocation.etf)} />
        </div>
        <WarningsList warnings={risk.warnings} />
        <div className="grid gap-5 xl:grid-cols-3">
          <ExposureTable
            title="Top Holdings"
            label="Holding"
            rows={risk.topHoldingsConcentration.map((holding) => ({
              name: holding.symbol,
              value: holding.marketValue,
              weightPct: holding.weightPct,
            }))}
          />
          <ExposureTable
            title="Sector Exposure"
            label="Sector"
            rows={risk.sectorExposure.map((row) => ({
              name: row.sector,
              value: row.value,
              weightPct: row.weightPct,
            }))}
          />
          <ExposureTable
            title="Theme Exposure"
            label="Theme"
            rows={risk.themeExposure.map((row) => ({
              name: row.theme,
              value: row.value,
              weightPct: row.weightPct,
            }))}
          />
        </div>
      </CardContent>
    </Card>
  )
}

function ExposureTable({
  title,
  label,
  rows,
}: {
  title: string
  label: string
  rows: Array<{ name: string; value: number; weightPct: number }>
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState message="No exposure rows available." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{label}</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Weight</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.name}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="text-right">{formatMoney(row.value)}</TableCell>
                  <TableCell className="text-right">{formatPercent(row.weightPct)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  )
}

function AllocationRow({
  label,
  amount,
  percent,
}: {
  label: string
  amount: number
  percent: number
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {formatMoney(amount)} / {formatPercent(percent)}
        </span>
      </div>
      <div className="h-2 rounded-sm bg-muted">
        <div
          className="h-2 rounded-sm bg-primary"
          style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }}
        />
      </div>
    </div>
  )
}

function Field({
  label,
  id,
  children,
}: {
  label: string
  id: string
  children: ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex h-8 items-center rounded-lg border border-border bg-muted px-3 text-sm font-medium">
        {value}
      </div>
    </div>
  )
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 break-words font-medium">{value}</p>
    </div>
  )
}

function WarningsList({ warnings }: { warnings?: string[] | null }) {
  const safeWarnings = warnings ?? []

  if (safeWarnings.length === 0) {
    return (
      <div className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
        No warnings.
      </div>
    )
  }

  return <ReasonList title="Warnings" values={safeWarnings} variant="outline" />
}

function InlineWarnings({ warnings }: { warnings?: string[] | null }) {
  const safeWarnings = warnings ?? []

  if (safeWarnings.length === 0) {
    return <span className="text-muted-foreground">-</span>
  }

  return (
    <div className="flex flex-wrap gap-1">
      {safeWarnings.map((warning) => (
        <Badge key={warning} variant="outline">
          {warning}
        </Badge>
      ))}
    </div>
  )
}

function ReasonList({
  title,
  values,
  variant,
}: {
  title: string
  values: string[]
  variant: "outline" | "destructive"
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {values.length === 0 ? (
        <p className="text-sm text-muted-foreground">None.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {values.map((value) => (
            <Badge key={value} variant={variant}>
              {value}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

function DataQualityPanel({
  dataQuality,
  warnings,
}: {
  dataQuality: DataQuality | undefined
  warnings: string[]
}) {
  const source = "source" in (dataQuality ?? {}) ? String(dataQuality?.source) : null
  const asOf = "asOf" in (dataQuality ?? {}) ? String(dataQuality?.asOf) : null

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={freshnessVariant(dataQuality?.freshness)}>
          {dataQuality?.freshness ?? "MISSING"}
        </Badge>
        <Badge variant="outline">{dataQuality?.confidence ?? "LOW"}</Badge>
        {source ? <Badge variant="outline">{source}</Badge> : null}
        {asOf ? <Badge variant="outline">{formatDateTime(asOf)}</Badge> : null}
      </div>
      <WarningsList warnings={warnings} />
    </div>
  )
}

function FreshnessBadge({ warnings }: { warnings: string[] }) {
  const hasMissing = warnings.some((warning) => warning.includes("No ") || warning.includes("MISSING"))
  const hasFallback = warnings.some((warning) => warning.includes("fallback") || warning.includes("FALLBACK"))
  const label = hasMissing ? "Missing data" : hasFallback ? "Fallback data" : "Latest stored"

  return (
    <Badge variant={hasMissing ? "destructive" : hasFallback ? "outline" : "default"}>
      {label}
    </Badge>
  )
}

function SuccessBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/50 p-3 text-sm text-foreground">
      {message}
    </div>
  )
}

function TableScroll({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>
}

function nullableText(value: string) {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function getSyncCounts(sync: SyncDhanResponse["sync"]) {
  return {
    holdings: sync.counts?.holdings ?? sync.holdings?.count ?? 0,
    positions: sync.counts?.positions ?? sync.positions?.count ?? 0,
    orders: sync.counts?.orders ?? sync.orders?.count ?? 0,
    trades: sync.counts?.trades ?? sync.trades?.count ?? 0,
    funds: sync.counts?.funds ?? sync.funds?.count ?? 0,
  }
}

async function safeGet<T>(path: string): Promise<ResultState<T>> {
  try {
    return { data: await apiGet<T>(path), error: null }
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "Unable to load data",
    }
  }
}

async function safePost<T>(path: string): Promise<ResultState<T>> {
  try {
    return { data: await apiPostJson<T>(path, {}), error: null }
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "Unable to update data",
    }
  }
}

function freshnessVariant(
  freshness: string | undefined,
): "default" | "outline" | "destructive" {
  if (freshness === "LIVE" || freshness === "RECENT") {
    return "default"
  }

  if (freshness === "STALE") {
    return "outline"
  }

  return "destructive"
}

function ShieldIcon() {
  return <ShieldCheck className="size-4" />
}
