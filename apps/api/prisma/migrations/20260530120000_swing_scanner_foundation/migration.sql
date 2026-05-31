-- CreateTable
CREATE TABLE "SwingScanRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "universeSource" TEXT NOT NULL,
    "universe" TEXT[],
    "candidateCount" INTEGER NOT NULL,
    "candidates" JSONB NOT NULL,
    "warnings" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SwingScanRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SwingScanRun_userId_runAt_idx" ON "SwingScanRun"("userId", "runAt");

-- AddForeignKey
ALTER TABLE "SwingScanRun" ADD CONSTRAINT "SwingScanRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
