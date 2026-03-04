// src/products/products.service.ts

import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ShopeeService } from '../shopee/shopee.service'
import { ShopeeAffiliateService } from '../shopee/shopee-affiliate.service'
import { Product } from '@prisma/client'

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name)

  constructor(
    private prisma: PrismaService,
    private shopeeService: ShopeeService,
    private shopeeAffiliateService: ShopeeAffiliateService,
  ) {}

  async createFromUrls(urls: string[], categoryId: string) {
    const createdProducts: Product[] = []
    const skippedProducts: string[] = []
    const errors: { url: string; error: string }[] = []

    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    })
    if (!category) {
      throw new NotFoundException(`Categoria ${categoryId} não encontrada`)
    }

    for (const url of urls) {
      try {
        const ids = this.shopeeService.extractIds(url)
        if (!ids) {
          throw new BadRequestException(
            `URL inválida (padrão -i.shopId.itemId não encontrado): ${url}`,
          )
        }

        this.logger.log(`📦 Processando itemId: ${ids.itemId} (shopId: ${ids.shopId})`)

        const existing = await this.prisma.product.findUnique({
          where: { itemId: ids.itemId },
        })

        if (existing) {
          this.logger.log(`⏭️ Produto ${ids.itemId} já existe, vinculando à categoria...`)

          await this.prisma.productCategory.upsert({
            where: {
              productId_categoryId: {
                productId: existing.id,
                categoryId,
              },
            },
            update: {},
            create: { productId: existing.id, categoryId },
          })

          skippedProducts.push(ids.itemId)
          continue
        }

        // 1. Busca dados na API Shopee
        const shopeeProduct = await this.shopeeAffiliateService.getProductByItemId(ids.itemId)

        if (!shopeeProduct) {
          this.logger.warn(`⚠️ Produto ${ids.itemId} não encontrado na Shopee Affiliate API`)
          errors.push({
            url,
            error: `Produto ${ids.itemId} não encontrado. Possíveis causas: sem programa de afiliados, produto inativo ou credenciais sem permissão.`,
          })
          continue
        }

        // 2. Gera shortlink (usa offerLink como fallback se falhar)
        let affiliatedUrl = shopeeProduct.offerLink

        try {
          const shortLink = await this.shopeeAffiliateService.generateShortLink(url)
          if (shortLink) affiliatedUrl = shortLink
        } catch (linkErr: any) {
          this.logger.warn(`⚠️ Falha ao gerar shortlink, usando offerLink: ${linkErr.message}`)
        }

        // 3. Salva no banco
        const product = await this.prisma.product.create({
          data: {
            itemId: String(shopeeProduct.itemId),
            name: shopeeProduct.productName,
            imageUrl: shopeeProduct.imageUrl ?? null,
            price: shopeeProduct.priceMin ? Number(shopeeProduct.priceMin) : null,
            rating: shopeeProduct.ratingStar ? Number(shopeeProduct.ratingStar) : null,
            sales: shopeeProduct.sales ?? null,
            shopId: String(shopeeProduct.shopId),
            shopName: shopeeProduct.shopName,
            affiliatedUrl,
            categories: {
              create: [{ categoryId }],
            },
          },
        })

        this.logger.log(`✅ Produto "${shopeeProduct.productName}" salvo`)
        createdProducts.push(product)

      } catch (err: any) {
        this.logger.error(`❌ Erro ao processar ${url}: ${err.message}`)
        errors.push({ url, error: err.message })
      }
    }

    return {
      created: createdProducts,
      skipped: skippedProducts,
      errors,
      summary: {
        total: urls.length,
        created: createdProducts.length,
        skipped: skippedProducts.length,
        failed: errors.length,
      },
    }
  }

  async findAll(filters: { categoryId?: string; search?: string }) {
    return this.prisma.product.findMany({
      where: {
        ...(filters.categoryId && {
          categories: { some: { categoryId: filters.categoryId } },
        }),
        ...(filters.search && {
          name: { contains: filters.search, mode: 'insensitive' },
        }),
      },
      include: {
        categories: { include: { category: true } },
      },
    })
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { categories: { include: { category: true } } },
    })
    if (!product) throw new NotFoundException('Produto não encontrado')
    return product
  }

  async remove(id: string) {
    await this.findOne(id)
    return this.prisma.product.delete({ where: { id } })
  }
}
