export type ToolCatalogEntry = {
  name: string
  version: string
  description: string
  readOnly: true
  inputSchema: Record<string, unknown>
  outputSchema: Record<string, unknown>
}

export type ToolCatalogResponse = {
  tools: ToolCatalogEntry[]
  forbiddenToolNames: string[]
  readOnly: true
}

export type ToolExecutionStatus = "ok" | "rejected" | "unavailable" | "error"

export type ToolEnvelope = {
  tool: string
  version: string
  asOf: string
  status: ToolExecutionStatus
  data: Record<string, unknown>
  dataQuality: Record<string, unknown>
  warnings: string[]
  rejectReasons: string[]
  auditId: string
  durationMs: number
}

export type ToolAuditItem = {
  id: string
  toolName: string
  toolVersion: string
  status: ToolExecutionStatus
  startedAt: string
  completedAt: string | null
  durationMs: number | null
  warningCount: number
  rejectCount: number
  errorCode: string | null
  inputHash: string | null
  inputMeta: Record<string, unknown>
  createdAt: string
}

export const MANUAL_SUPER_ORDER_TOOL = "create_manual_super_order_plan"

export const TOOL_TESTER_DISCLAIMER =
  "Research only — internal read-only tools. Verify outputs and place any trade manually in Dhan. No broker writes from this page."

export const MANUAL_DRAFT_DISCLAIMER =
  "Manual draft only — formats Super Order parameters for your review. Does not place, modify, or cancel orders in Dhan."
