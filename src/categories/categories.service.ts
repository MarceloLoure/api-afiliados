// src/categories/categories.service.ts

import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ShopeeService } from '../shopee/shopee.service'
import { ShopeeAffiliateService } from '../shopee/shopee-affiliate.service'

@Injectable()
export class CategoriesService {
  constructor(
    private prisma: PrismaService,
    private shopeeService: ShopeeService,
    private shopeeAffiliateService: ShopeeAffiliateService,
  ) {}

  async create(name: string) {
    return this.prisma.category.create({ data: { name } })
  }

  async findAll() {
    return this.prisma.category.findMany({
      include: { _count: { select: { products: true } } },
      orderBy: { createdAt: 'desc' },
    })
  }

  async findById(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { products: { include: { product: true } } },
    })
    if (!category) throw new NotFoundException('Categoria não encontrada')
    return category
  }

  async update(id: string, name: string) {
    await this.findById(id)
    return this.prisma.category.update({ where: { id }, data: { name } })
  }

  async remove(id: string) {
    await this.findById(id)
    await this.prisma.category.delete({ where: { id } })
    return { message: 'Categoria removida com sucesso' }
  }

  async addProducts(categoryId: string, urls: string[]) {
    const category = await this.prisma.category.findUnique({ where: { id: categoryId } })
    if (!category) throw new NotFoundException('Categoria não encontrada')

    const results: { url: string; status: string; productId?: string; error?: string }[] = []

    for (const url of urls) {
      try {
        const ids = this.shopeeService.extractIds(url)
        if (!ids) {
          results.push({ url, status: 'erro', error: 'URL inválida' })
          continue
        }

        let product = await this.prisma.product.findUnique({ where: { itemId: ids.itemId } })

        if (!product) {
          const shopeeProduct = await this.shopeeAffiliateService.getProductByItemId(ids.itemId)
          if (!shopeeProduct) {
            results.push({ url, status: 'erro', error: 'Produto não encontrado na Shopee' })
            continue
          }

          const shortLink = await this.shopeeAffiliateService.generateShortLink(
            shopeeProduct.offerLink || url,
          )

          product = await this.prisma.product.create({
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
            },
          })
        }

        await this.prisma.productCategory.upsert({
          where: { productId_categoryId: { productId: product.id, categoryId } },
          update: {},
          create: { productId: product.id, categoryId },
        })

        results.push({ url, status: 'ok', productId: product.id })
      } catch (err: any) {
        results.push({ url, status: 'erro', error: err?.message ?? 'Erro desconhecido' })
      }
    }

    return { message: 'Processamento concluído', results }
  }

  async removeProduct(categoryId: string, productId: string) {
    await this.findById(categoryId)
    const link = await this.prisma.productCategory.findUnique({
      where: { productId_categoryId: { productId, categoryId } },
    })
    if (!link) throw new NotFoundException('Produto não encontrado nesta categoria')
    await this.prisma.productCategory.delete({
      where: { productId_categoryId: { productId, categoryId } },
    })
    return { message: 'Produto removido da categoria' }
  }
}
