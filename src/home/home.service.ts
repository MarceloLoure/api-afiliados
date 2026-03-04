import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

type CacheEntry<T> = {
  value: T
  expiresAt: number
}

@Injectable()
export class HomeService {
  private readonly cache = new Map<string, CacheEntry<unknown>>()
  private readonly ttlInMs = 5 * 60 * 1000

  constructor(private readonly prisma: PrismaService) {}

  async getMenu(categoryIds?: string[]) {
    const cacheKey = this.buildCacheKey('menu', categoryIds)
    const fromCache = this.getCached(cacheKey)
    if (fromCache) return fromCache

    const categories = await this.prisma.category.findMany({
      where: categoryIds?.length ? { id: { in: categoryIds } } : undefined,
      select: {
        id: true,
        name: true,
        _count: { select: { products: true } },
      },
      orderBy: { name: 'asc' },
    })

    const orderedCategories = this.orderCategories(categories, categoryIds).map((category) => ({
      id: category.id,
      name: category.name,
      productCount: category._count.products,
    }))

    this.setCached(cacheKey, orderedCategories)
    return orderedCategories
  }

  async getHome(categoryIds?: string[], limit = 20) {
    const safeLimit = Math.max(1, Math.min(20, limit))
    const cacheKey = this.buildCacheKey('home', categoryIds, safeLimit)
    const fromCache = this.getCached(cacheKey)
    if (fromCache) return fromCache

    const categories = await this.prisma.category.findMany({
      where: categoryIds?.length ? { id: { in: categoryIds } } : undefined,
      select: {
        id: true,
        name: true,
        _count: { select: { products: true } },
        products: {
          take: safeLimit,
          orderBy: {
            product: { createdAt: 'desc' },
          },
          select: {
            product: {
              select: {
                id: true,
                itemId: true,
                name: true,
                imageUrl: true,
                price: true,
                rating: true,
                sales: true,
                commissionRate: true,
                shortLink: true,
                affiliatedUrl: true,
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    })

    const orderedCategories = this.orderCategories(categories, categoryIds)

    const payload = {
      menu: orderedCategories.map((category) => ({
        id: category.id,
        name: category.name,
        productCount: category._count.products,
      })),
      sections: orderedCategories.map((category) => ({
        categoryId: category.id,
        categoryName: category.name,
        products: category.products.map(({ product }) => product),
      })),
      limit: safeLimit,
      cachedAt: new Date().toISOString(),
    }

    this.setCached(cacheKey, payload)
    return payload
  }

  private buildCacheKey(prefix: string, categoryIds?: string[], limit?: number) {
    const ids = categoryIds?.length ? categoryIds.join(',') : 'all'
    return `${prefix}:${ids}:${limit ?? 'default'}`
  }

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key)
      return null
    }

    return entry.value as T
  }

  private setCached<T>(key: string, value: T) {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.ttlInMs,
    })
  }

  private orderCategories<T extends { id: string }>(categories: T[], orderedIds?: string[]) {
    if (!orderedIds?.length) return categories

    const position = new Map(orderedIds.map((id, index) => [id, index]))

    return [...categories].sort((a, b) => {
      const aPos = position.get(a.id)
      const bPos = position.get(b.id)

      if (aPos === undefined && bPos === undefined) return 0
      if (aPos === undefined) return 1
      if (bPos === undefined) return -1

      return aPos - bPos
    })
  }
}
