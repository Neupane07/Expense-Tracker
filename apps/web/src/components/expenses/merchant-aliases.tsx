import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { apiDelete, apiPostJson } from "@/lib/api-client"
import { useApiQuery } from "@/lib/use-api-query"

export function MerchantAliases() {
  const [refresh, setRefresh] = useState(0)
  const [alias, setAlias] = useState("")
  const [canonical, setCanonical] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const q = useApiQuery<{ id: string; alias: string; canonical: string }[]>(`/review/aliases?refresh=${refresh}`)
  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError("")
    try { await action(); setRefresh((v) => v + 1) }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  return <Card>
    <CardHeader><CardTitle>Merchant aliases</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <p className="text-sm text-muted-foreground">Treat another statement name as the same merchant for future imports and remembered rules. Existing classifications remain unchanged.</p>
      {(error || q.error) && <p role="alert">{error || q.error}</p>}
      {q.data?.map((row) => <div key={row.id} className="flex items-center justify-between gap-3"><span>{row.alias} → {row.canonical}</span><Button variant="outline" disabled={busy} onClick={() => void run(() => apiDelete(`/review/aliases/${row.id}`))}>Remove</Button></div>)}
      <div className="flex flex-wrap gap-2">
        <Input aria-label="Statement merchant name" placeholder="Statement merchant name" value={alias} onChange={(e) => setAlias(e.target.value)} />
        <Input aria-label="Use this merchant name" placeholder="Use this merchant name" value={canonical} onChange={(e) => setCanonical(e.target.value)} />
        <Button disabled={busy || !alias.trim() || !canonical.trim()} onClick={() => void run(async () => { await apiPostJson('/review/aliases', { alias, canonical }); setAlias(''); setCanonical('') })}>Save alias</Button>
      </div>
    </CardContent>
  </Card>
}
