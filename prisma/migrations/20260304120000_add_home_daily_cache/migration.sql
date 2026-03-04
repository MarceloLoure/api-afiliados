-- CreateTable
CREATE TABLE "HomeCategory" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomeCache" (
    "id" TEXT NOT NULL,
    "cacheDate" DATE NOT NULL,
    "menu" JSONB NOT NULL,
    "sections" JSONB NOT NULL,
    "limit" INTEGER NOT NULL DEFAULT 20,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HomeCategory_categoryId_key" ON "HomeCategory"("categoryId");

-- CreateIndex
CREATE INDEX "HomeCategory_position_idx" ON "HomeCategory"("position");

-- CreateIndex
CREATE UNIQUE INDEX "HomeCache_cacheDate_key" ON "HomeCache"("cacheDate");

-- AddForeignKey
ALTER TABLE "HomeCategory" ADD CONSTRAINT "HomeCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
