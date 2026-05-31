import { useState } from "react"
import { KeyRound, ShieldCheck, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { apiDelete, apiPostJson } from "@/lib/api-client"
import { useApiQuery } from "@/lib/use-api-query"
import { ErrorState, LoadingState } from "./page-state"

type DhanConnection = {
  brokerName: string
  connected: boolean
  status: string
  hasApiKey: boolean
  hasApiSecret: boolean
  hasAccessToken: boolean
  clientIdMasked: string | null
  apiKeyMasked: string | null
  accessTokenExpiresAt: string | null
  lastValidatedAt: string | null
  lastSyncAt: string | null
}

type FormState = {
  apiKey: string
  apiSecret: string
  clientId: string
  accessToken: string
  accessTokenExpiresAt: string
}

const initialForm: FormState = {
  apiKey: "",
  apiSecret: "",
  clientId: "",
  accessToken: "",
  accessTokenExpiresAt: "",
}

export function DhanConnectionPage() {
  const [refreshKey, setRefreshKey] = useState(0)
  const [form, setForm] = useState<FormState>(initialForm)
  const [message, setMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const { data, error, isLoading } = useApiQuery<DhanConnection>(
    `/broker/dhan/connection?refresh=${refreshKey}`,
  )

  async function saveCredentials() {
    setIsSaving(true)
    setActionError(null)
    setMessage(null)

    try {
      await apiPostJson("/broker/dhan/credentials", {
        apiKey: form.apiKey,
        apiSecret: form.apiSecret,
        clientId: form.clientId,
        accessToken: form.accessToken || null,
        accessTokenExpiresAt: form.accessTokenExpiresAt
          ? new Date(form.accessTokenExpiresAt).toISOString()
          : null,
      })
      setForm(initialForm)
      setMessage("Dhan credentials saved securely.")
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to save credentials",
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function validateConnection() {
    setIsSaving(true)
    setActionError(null)
    setMessage(null)

    try {
      await apiPostJson("/broker/dhan/validate", {})
      setMessage("Dhan connection validated.")
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to validate Dhan",
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteCredentials() {
    setIsSaving(true)
    setActionError(null)
    setMessage(null)

    try {
      await apiDelete("/broker/dhan/credentials")
      setForm(initialForm)
      setMessage("Dhan credentials removed.")
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to delete credentials",
      )
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return <LoadingState message="Loading broker connection" />
  }

  if (error || !data) {
    return <ErrorState message={error ?? "Broker connection is unavailable"} />
  }

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">
          Settings / Broker Connections / Dhan
        </p>
        <h2 className="mt-1 text-lg font-semibold">Dhan</h2>
      </div>

      <Card>
        <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Connection Status</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Credentials are encrypted by the API and never shown after saving.
            </p>
          </div>
          <Badge variant={data.connected ? "default" : "secondary"}>
            {data.status}
          </Badge>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm md:grid-cols-3">
          <StatusItem label="Client ID" value={data.clientIdMasked ?? "Not saved"} />
          <StatusItem label="API key" value={data.apiKeyMasked ?? "Not saved"} />
          <StatusItem
            label="Access token"
            value={data.hasAccessToken ? "Saved" : "Not saved"}
          />
          <StatusItem
            label="Token expiry"
            value={formatDateTime(data.accessTokenExpiresAt)}
          />
          <StatusItem
            label="Last validated"
            value={formatDateTime(data.lastValidatedAt)}
          />
          <StatusItem label="Last sync" value={formatDateTime(data.lastSyncAt)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Secure Credentials</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <CredentialInput
              id="clientId"
              label="Client ID"
              value={form.clientId}
              onChange={(value) => setForm((state) => ({ ...state, clientId: value }))}
            />
            <CredentialInput
              id="apiKey"
              label="API key"
              value={form.apiKey}
              onChange={(value) => setForm((state) => ({ ...state, apiKey: value }))}
            />
            <CredentialInput
              id="apiSecret"
              label="API secret"
              type="password"
              value={form.apiSecret}
              onChange={(value) =>
                setForm((state) => ({ ...state, apiSecret: value }))
              }
            />
            <CredentialInput
              id="accessToken"
              label="Access token"
              type="password"
              value={form.accessToken}
              onChange={(value) =>
                setForm((state) => ({ ...state, accessToken: value }))
              }
            />
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="accessTokenExpiresAt">Access token expiry</Label>
              <Input
                id="accessTokenExpiresAt"
                type="datetime-local"
                value={form.accessTokenExpiresAt}
                onChange={(event) =>
                  setForm((state) => ({
                    ...state,
                    accessTokenExpiresAt: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
          {actionError ? <ErrorState message={actionError} /> : null}

          <div className="flex flex-wrap gap-2">
            <Button onClick={saveCredentials} disabled={isSaving}>
              <KeyRound className="size-4" aria-hidden="true" />
              {isSaving ? "Saving" : "Save encrypted"}
            </Button>
            <Button
              variant="outline"
              onClick={validateConnection}
              disabled={isSaving || !data.connected}
            >
              <ShieldCheck className="size-4" aria-hidden="true" />
              Validate
            </Button>
            <Button
              variant="outline"
              onClick={deleteCredentials}
              disabled={isSaving || !data.connected}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Remove
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  )
}

function CredentialInput({
  id,
  label,
  value,
  onChange,
  type = "text",
}: {
  id: keyof FormState
  label: string
  value: string
  onChange: (value: string) => void
  type?: "text" | "password"
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Not available"
}
