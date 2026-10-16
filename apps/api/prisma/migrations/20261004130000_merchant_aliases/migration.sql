CREATE TABLE "MerchantAlias" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "alias" TEXT NOT NULL, "canonical" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MerchantAlias_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MerchantAlias_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MerchantAlias_userId_alias_key" ON "MerchantAlias"("userId", "alias");
