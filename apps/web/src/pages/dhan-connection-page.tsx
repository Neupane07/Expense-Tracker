import { useState } from "react"
import { ExternalLink, KeyRound, RefreshCw, ShieldCheck, Trash2 } from "lucide-react"
import { useSearchParams } from "react-router-dom"
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
  accessTokenExpired?: boolean
  reconnectRequired?: boolean
  lastValidatedAt: string | null
  lastSyncAt: string | null
}

type FormState = {
  apiKey: string
  apiSecret: string
  clientId: string
}

type StartConnectResponse = {
  loginUrl: string
  callbackUrl: string
  expiresAt: string
}

const initialForm: FormState = {
  apiKey: "",
  apiSecret: "",
  clientId: "",
}

export function DhanConnectionPage() {
  const [searchParams] = useSearchParams()
  const [refreshKey, setRefreshKey] = useState(() =>
    searchParams.get("connected") === "1" ? 1 : 0,
  )
  const [form, setForm] = useState<FormState>(initialForm)
  const [message, setMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const callbackMessage =
    searchParams.get("connected") === "1"
      ? "Dhan connected successfully. Access token saved securely."
      : message
  const callbackError = (() => {
    const error = searchParams.get("error")
    if (error === "connect_failed") {
      return "Dhan login did not complete. Check your API key redirect URL and try again."
    }
    if (error === "session_required") {
      return "Dhan login finished, but your Finance OS session was not available on callback. Stay signed in, then connect again without using a private/incognito window."
    }
    if (error === "missing_token") {
      return "Dhan redirected back without a tokenId. Confirm your Dhan API redirect URL exactly matches the callback URL shown when you start connect."
    }
    if (error === "token_exchange_failed") {
      return "Dhan returned from login, but token exchange failed. Verify API key/secret and reconnect."
    }
    return actionError
  })()
  const [isSaving, setIsSaving] = useState(false)
  const { data, error, isLoading } = useApiQuery<DhanConnection>(
    `/broker/dhan/connection?refresh=${refreshKey}`,
  )

  async function connectWithDhan() {
    setIsSaving(true)
    setActionError(null)
    setMessage(null)

    try {
      const result = await apiPostJson<StartConnectResponse>(
        "/broker/dhan/connect/start",
        form,
      )
      setForm(initialForm)
      setMessage(
        `Opening Dhan login. Ensure your Dhan API redirect URL is ${result.callbackUrl}.`,
      )
      window.location.assign(result.loginUrl)
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to start Dhan connect",
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function renewToken() {
    setIsSaving(true)
    setActionError(null)
    setMessage(null)

    try {
      await apiPostJson("/broker/dhan/connect/renew", {})
      setMessage("Dhan access token renewed for another 24 hours.")
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to renew Dhan token",
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

  const tokenStatus = getTokenStatus(data)

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
              Read-only OAuth connection using Dhan API key and browser login.
            </p>
          </div>
          <Badge variant={data.connected && !data.reconnectRequired ? "default" : "secondary"}>
            {tokenStatus.label}
          </Badge>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm md:grid-cols-3">
          <StatusItem label="Client ID" value={data.clientIdMasked ?? "Not saved"} />
          <StatusItem label="API key" value={data.apiKeyMasked ?? "Not saved"} />
          <StatusItem label="Access token" value={tokenStatus.tokenLabel} />
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
          <CardTitle>Connect with Dhan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Generate an individual API key in Dhan Web, set the redirect URL to
            your API callback exactly, then connect here. Finance OS stores only
            encrypted API credentials and the issued 24-hour access token.
          </p>
          <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            Dhan redirect URL must match your API callback, for example{" "}
            <span className="font-mono text-foreground">
              http://localhost:4000/broker/dhan/connect/callback
            </span>
            . After Dhan login you should return here with a success message, not
            TOKEN_MISSING.
          </p>
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
          </div>

          {callbackMessage ? <p className="text-sm text-muted-foreground">{callbackMessage}</p> : null}
          {callbackError ? <ErrorState message={callbackError} /> : null}

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={connectWithDhan}
              disabled={isSaving || !form.apiKey || !form.apiSecret || !form.clientId}
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              {isSaving ? "Starting" : "Connect with Dhan"}
            </Button>
            <Button
              variant="outline"
              onClick={renewToken}
              disabled={isSaving || !data.hasAccessToken || data.reconnectRequired}
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              Renew token
            </Button>
            <Button
              variant="outline"
              onClick={validateConnection}
              disabled={isSaving || !data.connected || data.reconnectRequired}
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

      <Card>
        <CardHeader>
          <CardTitle>Manual access token (fallback)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            If OAuth connect fails, paste a 24-hour access token from Dhan Web to
            unblock sync while you fix the redirect URL.
          </p>
          <ManualTokenForm onSaved={() => setRefreshKey((value) => value + 1)} />
        </CardContent>
      </Card>
    </div>
  )
}

function getTokenStatus(data: DhanConnection) {
  if (!data.hasAccessToken) {
    return {
      label: data.connected ? "TOKEN_MISSING" : "DISCONNECTED",
      tokenLabel: "Not connected",
    }
  }

  if (data.accessTokenExpired || data.reconnectRequired) {
    return {
      label: "RECONNECT_REQUIRED",
      tokenLabel: "Expired — reconnect required",
    }
  }

  return {
    label: data.status,
    tokenLabel: "Saved",
  }
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

function ManualTokenForm({ onSaved }: { onSaved: () => void }) {
  const [accessToken, setAccessToken] = useState("")
  const [expiresAt, setExpiresAt] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function saveManualToken() {
    setIsSaving(true)
    setError(null)

    try {
      await apiPostJson("/broker/dhan/connect/manual-token", {
        accessToken,
        accessTokenExpiresAt: expiresAt
          ? new Date(expiresAt).toISOString()
          : null,
      })
      setAccessToken("")
      setExpiresAt("")
      onSaved()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save token")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="manual-access-token">Access token</Label>
          <Input
            id="manual-access-token"
            type="password"
            value={accessToken}
            autoComplete="off"
            onChange={(event) => setAccessToken(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="manualAccessTokenExpiresAt">Token expiry</Label>
          <Input
            id="manualAccessTokenExpiresAt"
            type="datetime-local"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
          />
        </div>
      </div>
      {error ? <ErrorState message={error} /> : null}
      <Button
        variant="outline"
        onClick={() => void saveManualToken()}
        disabled={isSaving || !accessToken.trim()}
      >
        <KeyRound className="size-4" aria-hidden="true" />
        Save manual token
      </Button>
    </div>
  )
}

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Not available"
}
