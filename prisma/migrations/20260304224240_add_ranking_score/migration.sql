-- AlterTable: adiciona rankingScore ao model Product
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "rankingScore" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Index para ordenação eficiente por score na home e listagens
CREATE INDEX IF NOT EXISTS "Product_rankingScore_idx" ON "Product"("rankingScore" DESC);
