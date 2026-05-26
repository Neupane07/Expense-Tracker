import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { apiDelete, apiPostJson } from "@/lib/api-client"
import { formatDate } from "@/lib/format"
import { useApiQuery } from "@/lib/use-api-query"
import type { Invitation } from "@/pages/types"
import { EmptyState, ErrorState, LoadingState } from "./page-state"

export function AdminInvitationsPage() {
  const [email, setEmail] = useState("")
  const [role, setRole] = useState("MEMBER")
  const [refreshKey, setRefreshKey] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const query = useApiQuery<Invitation[]>(`/auth/invitations?refresh=${refreshKey}`)

  async function invite() {
    setIsSaving(true)
    setMessage(null)
    setActionError(null)

    try {
      await apiPostJson<Invitation>("/auth/invitations", { email, role })
      setEmail("")
      setMessage("Invitation created.")
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to create invitation",
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function revoke(id: string) {
    setIsSaving(true)
    setMessage(null)
    setActionError(null)

    try {
      await apiDelete<Invitation>(`/auth/invitations/${id}`)
      setMessage("Invitation revoked.")
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to revoke invitation",
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Invite user</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[1fr_180px_auto] md:items-end">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Google email</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="member@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MEMBER">Member</SelectItem>
                  <SelectItem value="ADMIN">Administrator</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={invite} disabled={isSaving || !email.trim()}>
              Create invitation
            </Button>
          </div>
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
          {actionError ? <ErrorState message={actionError} /> : null}
        </CardContent>
      </Card>

      <InvitationTable
        data={query.data}
        error={query.error}
        isLoading={query.isLoading}
        isSaving={isSaving}
        onRevoke={revoke}
      />
    </div>
  )
}

function InvitationTable({
  data,
  error,
  isLoading,
  isSaving,
  onRevoke,
}: {
  data: Invitation[] | null
  error: string | null
  isLoading: boolean
  isSaving: boolean
  onRevoke: (id: string) => void
}) {
  if (isLoading) {
    return <LoadingState message="Loading invitations" />
  }

  if (error || !data) {
    return <ErrorState message={error ?? "Invitations are unavailable"} />
  }

  if (data.length === 0) {
    return <EmptyState message="No invitations yet" />
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invitations</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((invitation) => {
              const status = invitation.usedAt
                ? "Accepted"
                : invitation.revokedAt
                  ? "Revoked"
                  : "Pending"

              return (
                <TableRow key={invitation.id}>
                  <TableCell className="font-medium">{invitation.email}</TableCell>
                  <TableCell>{invitation.role}</TableCell>
                  <TableCell>
                    <Badge>{status}</Badge>
                  </TableCell>
                  <TableCell>{formatDate(invitation.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onRevoke(invitation.id)}
                      disabled={isSaving || status !== "Pending"}
                    >
                      Revoke
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
