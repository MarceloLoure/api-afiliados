// src/utils/extract-item-id.ts
export function extractItemId(url: string): string | null {
  const match = url.match(/\.([0-9]+)$/)
  return match ? match[1] : null
}