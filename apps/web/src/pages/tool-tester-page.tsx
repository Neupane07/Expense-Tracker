import { useCallback, useMemo, useState } from "react"
import { FlaskConical, Play } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ToolAuditHistory } from "@/components/finance/tool-audit-history"
import { ToolEnvelopeView } from "@/components/finance/tool-envelope-view"
import { ToolJsonEditor } from "@/components/finance/tool-json-editor"
import { ResearchDisclaimer } from "@/components/finance/finance-quality"
import { apiPostJson } from "@/lib/api-client"
import {
  buildStarterJson,
  isToolInputValid,
} from "@/lib/tool-starter-json"
import { useApiQuery } from "@/lib/use-api-query"
import { EmptyState, ErrorState, LoadingState } from "./page-state"
import {
  MANUAL_DRAFT_DISCLAIMER,
  MANUAL_SUPER_ORDER_TOOL,
  TOOL_TESTER_DISCLAIMER,
  type ToolCatalogEntry,
  type ToolCatalogResponse,
  type ToolEnvelope,
  type ToolAuditItem,
} from "./tool-tester-types"

export function ToolTesterPage() {
  const catalogQuery = useApiQuery<ToolCatalogResponse>("/tools")
  const auditsQuery = useApiQuery<ToolAuditItem[]>("/tools/audits?limit=50")

  const [selectedToolName, setSelectedToolName] = useState<string | null>(null)
  const [inputByTool, setInputByTool] = useState<Record<string, string>>({})
  const [envelope, setEnvelope] = useState<ToolEnvelope | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)

  const activeToolName =
    selectedToolName ?? catalogQuery.data?.tools[0]?.name ?? null

  const selectedTool = useMemo(() => {
    if (!activeToolName || !catalogQuery.data) {
      return null
    }

    return (
      catalogQuery.data.tools.find((tool) => tool.name === activeToolName) ??
      null
    )
  }, [activeToolName, catalogQuery.data])

  const inputJson = useMemo(() => {
    if (!selectedTool) {
      return "{}"
    }

    if (inputByTool[selectedTool.name] !== undefined) {
      return inputByTool[selectedTool.name]
    }

    return buildStarterJson(selectedTool.name, selectedTool.inputSchema)
  }, [inputByTool, selectedTool])

  const selectTool = useCallback((tool: ToolCatalogEntry) => {
    setSelectedToolName(tool.name)
    setEnvelope(null)
    setRunError(null)
  }, [])

  const updateInputJson = useCallback(
    (value: string) => {
      if (!selectedTool) {
        return
      }

      setInputByTool((current) => ({
        ...current,
        [selectedTool.name]: value,
      }))
    },
    [selectedTool],
  )

  const canRun =
    selectedTool !== null && isToolInputValid(inputJson) && !isRunning

  async function handleRun() {
    if (!selectedTool || !isToolInputValid(inputJson)) {
      return
    }

    setIsRunning(true)
    setRunError(null)

    try {
      const body = JSON.parse(inputJson) as unknown
      const result = await apiPostJson<ToolEnvelope>(
        `/tools/${selectedTool.name}/execute`,
        body,
      )
      setEnvelope(result)
      await auditsQuery.refetch()
    } catch (error) {
      setEnvelope(null)
      setRunError(
        error instanceof Error ? error.message : "Tool execution failed.",
      )
    } finally {
      setIsRunning(false)
    }
  }

  if (catalogQuery.isLoading) {
    return <LoadingState message="Loading tool catalog" />
  }

  if (catalogQuery.error) {
    return <ErrorState message={catalogQuery.error} />
  }

  if (!catalogQuery.data?.tools.length) {
    return (
      <EmptyState message="No internal tools are registered. The registry may be unavailable." />
    )
  }

  return (
    <div className="space-y-6" data-testid="tool-tester-page">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FlaskConical className="size-5 text-muted-foreground" />
            <CardTitle>Tool Tester</CardTitle>
          </div>
          <CardDescription>
            Exercise read-only internal tools through the same registry contract
            future MCP clients will use.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ResearchDisclaimer text={TOOL_TESTER_DISCLAIMER} />
          {selectedTool?.name === MANUAL_SUPER_ORDER_TOOL ? (
            <p
              className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
              data-testid="manual-draft-disclaimer"
            >
              {MANUAL_DRAFT_DISCLAIMER}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Catalog</CardTitle>
            <CardDescription>
              {catalogQuery.data.tools.length} read-only tools registered
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table data-testid="tool-catalog-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Access</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {catalogQuery.data.tools.map((tool) => {
                  const isSelected = tool.name === activeToolName
                  return (
                    <TableRow
                      key={tool.name}
                      data-testid={`tool-row-${tool.name}`}
                      className={
                        isSelected
                          ? "cursor-pointer bg-muted/60"
                          : "cursor-pointer"
                      }
                      onClick={() => selectTool(tool)}
                    >
                      <TableCell className="font-mono text-xs">
                        {tool.name}
                      </TableCell>
                      <TableCell>{tool.version}</TableCell>
                      <TableCell className="max-w-[14rem] text-xs text-muted-foreground">
                        {tool.description}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">Read-only</Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {selectedTool ? selectedTool.name : "Select a tool"}
            </CardTitle>
            {selectedTool ? (
              <CardDescription>{selectedTool.description}</CardDescription>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedTool ? (
              <>
                <ToolJsonEditor
                  value={inputJson}
                  onChange={updateInputJson}
                  disabled={isRunning}
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    onClick={() => void handleRun()}
                    disabled={!canRun}
                    data-testid="tool-run-button"
                  >
                    <Play className="size-4" />
                    Run tool
                  </Button>
                  {!isToolInputValid(inputJson) ? (
                    <p className="text-xs text-muted-foreground">
                      Fix JSON syntax before running.
                    </p>
                  ) : null}
                </div>
                {runError ? (
                  <ErrorState message={runError} />
                ) : null}
                {envelope ? <ToolEnvelopeView envelope={envelope} /> : null}
                {!envelope && !runError ? (
                  <EmptyState message="Run the selected tool to inspect the structured response envelope." />
                ) : null}
              </>
            ) : (
              <EmptyState message="Select a tool from the catalog to begin." />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Execution audit history</CardTitle>
          <CardDescription>
            Redacted metadata for your recent tool runs. Output payloads are not
            stored.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ToolAuditHistory
            audits={auditsQuery.data}
            isLoading={auditsQuery.isLoading}
            error={auditsQuery.error}
          />
        </CardContent>
      </Card>
    </div>
  )
}
