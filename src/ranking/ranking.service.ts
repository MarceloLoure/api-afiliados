// src/ranking/ranking.service.ts

import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class RankingService {
  constructor(private prisma: PrismaService) {}

  async getMostClickedProducts(limit = 10) {
    const products = await this.prisma.product.findMany({
      include: {
        _count: { select: { clicks: true } },
        categories: { include: { category: true } },
      },
      orderBy: { clicks: { _count: 'desc' } },
      take: limit,
    })

    return products.map((p) => ({
      id: p.id,
      itemId: p.itemId,
      name: p.name,
      imageUrl: p.imageUrl,
      price: p.price,
      shortLink: p.shortLink,
      affiliatedUrl: p.affiliatedUrl,
      commissionRate: p.commissionRate,
      totalClicks: p._count.clicks,
      categories: p.categories.map((c) => c.category.name),
    }))
  }

  async getMostClickedByCategory(categoryId: string, limit = 10) {
    const products = await this.prisma.product.findMany({
      where: { categories: { some: { categoryId } } },
      include: { _count: { select: { clicks: true } } },
      orderBy: { clicks: { _count: 'desc' } },
      take: limit,
    })

    return products.map((p) => ({
      id: p.id,
      name: p.name,
      imageUrl: p.imageUrl,
      price: p.price,
      shortLink: p.shortLink,
      totalClicks: p._count.clicks,
    }))
  }

  async getCategoryReport() {
    const categories = await this.prisma.category.findMany({
      include: {
        products: {
          include: {
            product: { include: { _count: { select: { clicks: true } } } },
          },
        },
      },
    })

    return categories.map((cat) => {
      const products = cat.products.map((pc) => ({
        id: pc.product.id,
        name: pc.product.name,
        price: pc.product.price,
        totalClicks: pc.product._count.clicks,
        commissionRate: pc.product.commissionRate,
        estimatedCommission:
          pc.product.price && pc.product.commissionRate
            ? parseFloat(((pc.product.price * pc.product.commissionRate) / 100).toFixed(2))
            : null,
      }))

      return {
        categoryId: cat.id,
        categoryName: cat.name,
        totalProducts: products.length,
        totalClicks: products.reduce((acc, p) => acc + p.totalClicks, 0),
        products,
      }
    })
  }

  async getDashboard() {
    const [totalProducts, totalCategories, totalClicks, topProducts, recentClicks] =
      await Promise.all([
        this.prisma.product.count(),
        this.prisma.category.count(),
        this.prisma.clickLog.count(),
        this.getMostClickedProducts(5),
        this.prisma.clickLog.findMany({
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            product: { select: { name: true, imageUrl: true, shortLink: true } },
          },
        }),
      ])

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const clicksByDay = await this.prisma.clickLog.groupBy({
      by: ['createdAt'],
      where: { createdAt: { gte: sevenDaysAgo } },
      _count: { id: true },
      orderBy: { createdAt: 'asc' },
    })

    const clicksPerDay: Record<string, number> = {}
    for (const row of clicksByDay) {
      const day = row.createdAt.toISOString().split('T')[0]
      clicksPerDay[day] = (clicksPerDay[day] ?? 0) + row._count.id
    }

    const productsWithCommission = await this.prisma.product.findMany({
      select: { price: true, commissionRate: true },
      where: { price: { not: null }, commissionRate: { not: null } },
    })

    const estimatedTotalCommission = productsWithCommission.reduce(
      (acc, p) => acc + (p.price! * p.commissionRate!) / 100,
      0,
    )

    return {
      totalProducts,
      totalCategories,
      totalClicks,
      estimatedTotalCommission: parseFloat(estimatedTotalCommission.toFixed(2)),
      clicksLast7Days: clicksPerDay,
      topProducts,
      recentClicks: recentClicks.map((c) => ({
        productName: c.product.name,
        shortLink: c.product.shortLink,
        ip: c.ip,
        clickedAt: c.createdAt,
      })),
    }
  }

  async getConversionEstimate() {
    const CONVERSION_RATE = 0.02

    const products = await this.prisma.product.findMany({
      include: { _count: { select: { clicks: true } } },
      where: { commissionRate: { not: null }, price: { not: null } },
    })

    return products
      .filter((p) => p._count.clicks > 0)
      .map((p) => {
        const estimatedSales = Math.floor(p._count.clicks * CONVERSION_RATE)
        const estimatedRevenue = (estimatedSales * p.price! * p.commissionRate!) / 100
        return {
          productId: p.id,
          name: p.name,
          totalClicks: p._count.clicks,
          estimatedConversionRate: `${(CONVERSION_RATE * 100).toFixed(0)}%`,
          estimatedSales,
          commissionRate: `${p.commissionRate}%`,
          estimatedRevenueFromCommission: parseFloat(estimatedRevenue.toFixed(2)),
        }
      })
      .sort((a, b) => b.estimatedRevenueFromCommission - a.estimatedRevenueFromCommission)
  }
}
