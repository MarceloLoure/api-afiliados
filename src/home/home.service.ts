import {
  BadRequestException,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class HomeService implements OnModuleInit, OnModuleDestroy {
  private readonly productsLimit = 20
  private nextRefreshTimeout: NodeJS.Timeout | null = null
  private dailyRefreshInterval: NodeJS.Timeout | null = null

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.refreshDailyCache()
    this.scheduleDailyRefresh()
  }

  onModuleDestroy() {
    if (this.nextRefreshTimeout) clearTimeout(this.nextRefreshTimeout)
    if (this.dailyRefreshInterval) clearInterval(this.dailyRefreshInterval)
  }

  async getHome() {
    const cache = await this.getOrCreateTodayCache()

    return {
      menu: cache.menu,
      sections: cache.sections,
      limit: cache.limit,
      cachedAt: cache.updatedAt.toISOString(),
    }
  }

  async getMenu() {
    const cache = await this.getOrCreateTodayCache()
    return cache.menu
  }

  async updateCategoryOrder(categoryIds: string[]) {
    const uniqueCategoryIds = [...new Set(categoryIds)]

    const categories = await this.prisma.category.findMany({
      where: { id: { in: uniqueCategoryIds } },
      select: { id: true },
    })

    if (categories.length !== uniqueCategoryIds.length) {
      throw new BadRequestException('Uma ou mais categorias informadas não existem')
    }

    await this.prisma.$transaction([
      this.prisma.homeCategory.deleteMany(),
      this.prisma.homeCategory.createMany({
        data: uniqueCategoryIds.map((categoryId, index) => ({
          categoryId,
          position: index + 1,
        })),
      }),
    ])

    await this.refreshDailyCache(true)

    return this.prisma.homeCategory.findMany({
      include: { category: { select: { id: true, name: true } } },
      orderBy: { position: 'asc' },
    })
  }

  async refreshDailyCache(force = false) {
    const today = this.startOfDay(new Date())

    if (!force) {
      const existing = await this.prisma.homeCache.findUnique({
        where: { cacheDate: today },
      })
      if (existing) return existing
    }

    const orderedCategories = await this.getOrderedHomeCategories()

    const menu = orderedCategories.map((item) => ({
      categoryId: item.category.id,
      categoryName: item.category.name,
      categorySlug: item.category.slug,
      order: item.position,
      productCount: item.category._count.products,
    }))

    const sections = orderedCategories.map((item) => ({
      categoryId: item.category.id,
      categoryName: item.category.name,
      order: item.position,
      products: item.category.products.map(({ product }) => product),
    }))

    return this.prisma.homeCache.upsert({
      where: { cacheDate: today },
      create: {
        cacheDate: today,
        menu,
        sections,
        limit: this.productsLimit,
      },
      update: {
        menu,
        sections,
        limit: this.productsLimit,
      },
    })
  }

  private async getOrCreateTodayCache() {
    const today = this.startOfDay(new Date())

    const cache = await this.prisma.homeCache.findUnique({
      where: { cacheDate: today },
    })

    if (cache) return cache
    return this.refreshDailyCache()
  }

  private async getOrderedHomeCategories() {
    const configured = await this.prisma.homeCategory.findMany({
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
            _count: { select: { products: true } },
            products: {
              take: this.productsLimit,
              orderBy: { product: { createdAt: 'desc' } },
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
                    shopName: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { position: 'asc' },
    })

    if (configured.length) return configured

    const categories = await this.prisma.category.findMany({
      select: { id: true },
      orderBy: { name: 'asc' },
    })

    if (!categories.length) return []

    await this.prisma.homeCategory.createMany({
      data: categories.map((category, index) => ({
        categoryId: category.id,
        position: index + 1,
      })),
      skipDuplicates: true,
    })

    return this.prisma.homeCategory.findMany({
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
            _count: { select: { products: true } },
            products: {
              take: this.productsLimit,
              orderBy: { product: { createdAt: 'desc' } },
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
        },
      },
      orderBy: { position: 'asc' },
    })
  }

  private scheduleDailyRefresh() {
    const now = new Date()
    const nextMidnight = new Date(now)
    nextMidnight.setHours(24, 0, 0, 0)
    const delay = nextMidnight.getTime() - now.getTime()

    this.nextRefreshTimeout = setTimeout(async () => {
      await this.refreshDailyCache(true)
      this.dailyRefreshInterval = setInterval(async () => {
        await this.refreshDailyCache(true)
      }, 24 * 60 * 60 * 1000)
    }, delay)
  }

  private startOfDay(date: Date) {
    const value = new Date(date)
    value.setHours(0, 0, 0, 0)
    return value
  }
}
