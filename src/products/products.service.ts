// src/products/products.service.ts

import {
  Injectable,
  BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ShopeeService } from '../shopee/shopee.service'
import { ShopeeAffiliateService } from '../shopee/shopee-affiliate.service'
import { Product } from '@prisma/client'

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private shopeeService: ShopeeService,
    private shopeeAffiliateService: ShopeeAffiliateService,
  ) {}

  async createFromUrls(urls: string[], categoryId: string) {
    const createdProducts: Product[] = []

    for (const url of urls) {
      const ids = this.shopeeService.extractIds(url)

      if (!ids) {
        throw new BadRequestException(`URL inválida: ${url}`)
      }

      const existing = await this.prisma.product.findUnique({
        where: { itemId: ids.itemId },
      })

      if (existing) continue

      const shopeeProduct = await this.shopeeAffiliateService.getProductByItemId(ids.itemId)

      const affiliateUrl = await this.shopeeAffiliateService.generateShortLink(url)

        if (!shopeeProduct) {
            throw new Error('Produto não encontrado na Shopee')
        }

        const product = await this.prisma.product.create({
            data: {
            itemId: String(shopeeProduct.itemId),
            name: shopeeProduct.productName,
            imageUrl: shopeeProduct.imageUrl,
            price: Number(shopeeProduct.priceMin),
            rating: Number(shopeeProduct.ratingStar),
            sales: shopeeProduct.sales,
            shopId: String(shopeeProduct.shopId),
            shopName: shopeeProduct.shopName,
            affiliatedUrl: shopeeProduct.offerLink,
            categories: {
                create: [{ categoryId }],
            },
            },
        })

        createdProducts.push(product)
    }

    return createdProducts
  }
}