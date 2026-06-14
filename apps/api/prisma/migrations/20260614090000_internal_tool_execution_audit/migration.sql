-- CreateEnum
CREATE TYPE "ToolExecutionStatus" AS ENUM ('OK', 'REJECTED', 'UNAVAILABLE', 'ERROR');

-- CreateTable
CREATE TABLE "ToolExecutionAudit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "toolVersion" TEXT NOT NULL,
    "status" "ToolExecutionStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "inputHash" TEXT,
    "inputMeta" JSONB,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "rejectCount" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToolExecutionAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ToolExecutionAudit_userId_createdAt_idx" ON "ToolExecutionAudit"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ToolExecutionAudit_userId_toolName_createdAt_idx" ON "ToolExecutionAudit"("userId", "toolName", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ToolExecutionAudit_createdAt_idx" ON "ToolExecutionAudit"("createdAt");

-- AddForeignKey
ALTER TABLE "ToolExecutionAudit" ADD CONSTRAINT "ToolExecutionAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
