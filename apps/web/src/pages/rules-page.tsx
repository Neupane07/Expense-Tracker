import { useState } from "react"
import type { ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { apiPatchJson, apiPostJson } from "@/lib/api-client"
import { useApiQuery } from "@/lib/use-api-query"
import type {
  DefaultRulesSummary,
  Rule,
  RuleApplySummary,
  UpdateRuleInput,
} from "@/pages/types"
import { EmptyState, ErrorState, LoadingState } from "./page-state"

const expenseTypes = [
  "EXPENSE",
  "TRANSFER",
  "INVESTMENT",
  "INCOME",
  "REFUND",
  "REVIEW",
]

const matchTypes = ["CONTAINS", "EXACT", "STARTS_WITH", "REGEX"]

export function RulesPage() {
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedRule, setSelectedRule] = useState<Rule | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const { data, error, isLoading } = useApiQuery<Rule[]>(
    `/rules?refresh=${refreshKey}`,
  )

  async function addStarterRules() {
    setIsSaving(true)
    setActionError(null)
    setMessage(null)

    try {
      const summary = await apiPostJson<DefaultRulesSummary>(
        "/rules/defaults",
        {},
      )
      setMessage(
        `Added ${summary.createdRules} starter rules and updated ${summary.updatedRows} review rows.`,
      )
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to add starter rules",
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function applyRule(rule: Rule) {
    setIsSaving(true)
    setActionError(null)
    setMessage(null)

    try {
      const summary = await apiPostJson<RuleApplySummary>(
        `/rules/${rule.id}/apply`,
        {},
      )
      setMessage(
        `Applied "${rule.vendor}" to ${summary.updatedRows} of ${summary.matchedRows} matching rows. Manual edits were skipped.`,
      )
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to apply rule",
      )
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return <LoadingState message="Loading rules" />
  }

  if (error || !data) {
    return <ErrorState message={error ?? "Rules are unavailable"} />
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <EmptyState message="No rules configured" />
          <Button onClick={addStarterRules} disabled={isSaving}>
            {isSaving ? "Adding" : "Add starter rules"}
          </Button>
          {message ? (
            <p className="text-sm text-muted-foreground">{message}</p>
          ) : null}
          {actionError ? <ErrorState message={actionError} /> : null}
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle>Rules</CardTitle>
          <Button
            variant="outline"
            onClick={addStarterRules}
            disabled={isSaving}
          >
            {isSaving ? "Adding" : "Add missing starter rules"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {message ? (
            <p className="text-sm text-muted-foreground">{message}</p>
          ) : null}
          {actionError ? <ErrorState message={actionError} /> : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Priority</TableHead>
                <TableHead>Pattern</TableHead>
                <TableHead>Match</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Expense type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell>{rule.priority}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {rule.pattern}
                  </TableCell>
                  <TableCell>{rule.matchType}</TableCell>
                  <TableCell>{rule.vendor}</TableCell>
                  <TableCell>{rule.category}</TableCell>
                  <TableCell>
                    <Badge>{rule.expenseType}</Badge>
                  </TableCell>
                  <TableCell>{rule.isActive ? "Active" : "Inactive"}</TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => applyRule(rule)}
                      disabled={isSaving || !rule.isActive}
                    >
                      Apply
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedRule(rule)}
                    >
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {selectedRule ? (
        <EditRuleDialog
          key={selectedRule.id}
          rule={selectedRule}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedRule(null)
            }
          }}
          onSaved={() => {
            setSelectedRule(null)
            setRefreshKey((value) => value + 1)
            setMessage("Rule updated.")
          }}
        />
      ) : null}
    </>
  )
}

function EditRuleDialog({
  rule,
  onOpenChange,
  onSaved,
}: {
  rule: Rule
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [priority, setPriority] = useState(String(rule.priority))
  const [matchType, setMatchType] = useState(rule.matchType)
  const [pattern, setPattern] = useState(rule.pattern)
  const [vendor, setVendor] = useState(rule.vendor)
  const [category, setCategory] = useState(rule.category)
  const [subcategory, setSubcategory] = useState(rule.subcategory ?? "")
  const [expenseType, setExpenseType] = useState(rule.expenseType)
  const [isActive, setIsActive] = useState(String(rule.isActive))
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  async function saveRule() {
    setIsSaving(true)
    setError(null)

    try {
      await apiPatchJson<Rule>(`/rules/${rule.id}`, {
        priority: Number(priority),
        matchType,
        pattern,
        vendor,
        category,
        subcategory: subcategory.trim() || null,
        expenseType,
        isActive: isActive === "true",
      } satisfies UpdateRuleInput)
      onSaved()
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to update rule")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit rule</DialogTitle>
          <DialogDescription>
            Rule edits affect future imports immediately. Existing transactions
            are changed only when you apply an active rule from the rules list.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
            Deactivating a rule stops it from matching future imports. It does
            not rewrite history, and manual review edits are protected from rule
            applies.
          </div>
          <RuleField label="Priority">
            <Input
              type="number"
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
            />
          </RuleField>
          <RuleField label="Match type">
            <Select value={matchType} onValueChange={setMatchType}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {matchTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </RuleField>
          <RuleField label="Pattern">
            <Input
              value={pattern}
              onChange={(event) => setPattern(event.target.value)}
            />
          </RuleField>
          <RuleField label="Vendor">
            <Input
              value={vendor}
              onChange={(event) => setVendor(event.target.value)}
            />
          </RuleField>
          <RuleField label="Category">
            <Input
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            />
          </RuleField>
          <RuleField label="Subcategory">
            <Input
              value={subcategory}
              onChange={(event) => setSubcategory(event.target.value)}
            />
          </RuleField>
          <RuleField label="Expense type">
            <Select value={expenseType} onValueChange={setExpenseType}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {expenseTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </RuleField>
          <RuleField label="Status">
            <Select value={isActive} onValueChange={setIsActive}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Active</SelectItem>
                <SelectItem value="false">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </RuleField>
          {error ? <ErrorState message={error} /> : null}
        </div>

        <DialogFooter showCloseButton>
          <Button
            onClick={saveRule}
            disabled={
              isSaving ||
              !pattern.trim() ||
              !vendor.trim() ||
              !category.trim() ||
              !priority
            }
          >
            {isSaving ? "Saving" : "Save rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RuleField({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
