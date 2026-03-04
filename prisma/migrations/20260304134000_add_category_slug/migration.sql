-- Add slug column first as nullable to backfill existing rows
ALTER TABLE "Category" ADD COLUMN "slug" TEXT;

-- Normalize name into slug pattern: lowercase letters and hyphen only
WITH base AS (
  SELECT
    id,
    COALESCE(
      NULLIF(
        TRIM(BOTH '-' FROM REGEXP_REPLACE(
          REGEXP_REPLACE(
            LOWER("name"),
            '[^a-z]+',
            '-',
            'g'
          ),
          '-+',
          '-',
          'g'
        )),
        ''
      ),
      'categoria'
    ) AS base_slug
  FROM "Category"
),
ranked AS (
  SELECT
    id,
    base_slug,
    ROW_NUMBER() OVER (PARTITION BY base_slug ORDER BY id) AS slug_rank
  FROM base
),
resolved AS (
  SELECT
    id,
    CASE
      WHEN slug_rank = 1 THEN base_slug
      ELSE base_slug || '-' || COALESCE(
        NULLIF(SUBSTRING(REGEXP_REPLACE(MD5(id), '[^a-f]+', '', 'g') FROM 1 FOR 6), ''),
        'a'
      )
    END AS final_slug
  FROM ranked
)
UPDATE "Category" c
SET "slug" = r.final_slug
FROM resolved r
WHERE c.id = r.id;

ALTER TABLE "Category" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");
