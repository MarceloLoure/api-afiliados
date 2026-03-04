// src/products/products.service.ts

import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ShopeeService } from '../shopee/shopee.service'
import { ShopeeAffiliateService } from '../shopee/shopee-affiliate.service'
import { UpdateProductDto } from './dto/update-product.dto'
import { Product } from '@prisma/client'

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private shopeeService: ShopeeService,
    private shopeeAffiliateService: ShopeeAffiliateService,
  ) {}

  async createFromUrls(urls: string[], categoryId: string) {
    const category = await this.prisma.category.findUnique({ where: { id: categoryId } })
    if (!category) throw new BadRequestException(`Categoria não encontrada: ${categoryId}`)

    const created: Product[] = []
    const skipped: { url: string; productId: string }[] = []
    const errors: { url: string; error: string }[] = []

    for (const url of urls) {
      try {
        const ids = this.shopeeService.extractIds(url)
        if (!ids) { errors.push({ url, error: 'URL inválida' }); continue }

        const existing = await this.prisma.product.findUnique({ where: { itemId: ids.itemId } })

        if (existing) {
          await this.prisma.productCategory.upsert({
            where: { productId_categoryId: { productId: existing.id, categoryId } },
            update: {},
            create: { productId: existing.id, categoryId },
          })
          skipped.push({ url, productId: existing.id })
          continue
        }

        const shopeeProduct = await this.shopeeAffiliateService.getProductByItemId(ids.itemId)
        if (!shopeeProduct) { errors.push({ url, error: 'Produto não encontrado na API Shopee' }); continue }

        const shortLink = await this.shopeeAffiliateService.generateShortLink(
          shopeeProduct.offerLink || url,
        )

        const product = await this.prisma.product.create({
          data: {
            itemId: String(shopeeProduct.itemId),
            name: shopeeProduct.productName,
            imageUrl: shopeeProduct.imageUrl,
            price: Number(shopeeProduct.priceMin),
            rating: Number(shopeeProduct.ratingStar),
            sales: shopeeProduct.sales,
            commissionRate: Number(shopeeProduct.commissionRate ?? 0),
            shopId: String(shopeeProduct.shopId),
            shopName: shopeeProduct.shopName,
            originalUrl: url,
            affiliatedUrl: shopeeProduct.offerLink,
            shortLink: shortLink ?? shopeeProduct.offerLink,
            categories: { create: [{ categoryId }] },
          },
        })

        created.push(product)
      } catch (err: any) {
        errors.push({ url, error: err?.message ?? 'Erro desconhecido' })
      }
    }

    return { created, skipped, errors }
  }

  async findAll(params: { categoryId?: string; search?: string; page: number; limit: number }) {
    const { categoryId, search, page, limit } = params
    const skip = (page - 1) * limit
    const where: any = {}

    if (categoryId) where.categories = { some: { categoryId } }
    if (search) where.name = { contains: search, mode: 'insensitive' }

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        include: {
          categories: { include: { category: true } },
          _count: { select: { clicks: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ])

    return {
      data: products,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    }
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        categories: {
          include: {
            category: true,
          },
        },
        _count: {
          select: {
            clicks: true,
          },
        },
      },
    })
    if (!product) throw new NotFoundException('Produto não encontrado')
    return product
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.findOne(id)
    return this.prisma.product.update({ where: { id }, data: dto })
  }

  async remove(id: string) {
    await this.findOne(id)
    await this.prisma.product.delete({ where: { id } })
    return { message: 'Produto removido com sucesso' }
  }

  async trackClick(
    productId: string,
    meta: { ip?: string; userAgent?: string; referer?: string },
  ) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { shortLink: true, affiliatedUrl: true, name: true },
    })
    if (!product) throw new NotFoundException('Produto não encontrado')

    await this.prisma.clickLog.create({
      data: { productId, ip: meta.ip, userAgent: meta.userAgent, referer: meta.referer },
    })

    return {
      message: 'Clique registrado',
      product: product.name,
      redirectUrl: product.shortLink ?? product.affiliatedUrl,
    }
  }

  async getProductStats(productId: string) {
    await this.findOne(productId)

    const [totalClicks, clicksByDay] = await Promise.all([
      this.prisma.clickLog.count({ where: { productId } }),
      this.prisma.clickLog.groupBy({
        by: ['createdAt'],
        where: { productId },
        _count: { id: true },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    const clicksPerDay: Record<string, number> = {}
    for (const row of clicksByDay) {
      const day = row.createdAt.toISOString().split('T')[0]
      clicksPerDay[day] = (clicksPerDay[day] ?? 0) + row._count.id
    }

    return { productId, totalClicks, clicksPerDay }
  }
}
