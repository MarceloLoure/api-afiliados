export const CATEGORY_SLUG_REGEX = /^[a-z]+(?:-[a-z]+)*$/

export function normalizeCategorySlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
