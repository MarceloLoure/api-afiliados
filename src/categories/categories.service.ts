// src/categories/categories.service.ts

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ShopeeService } from '../shopee/shopee.service'
import { ShopeeAffiliateService } from '../shopee/shopee-affiliate.service'
import { UpdateCategoryDto } from './dto/update-category.dto'
import { CATEGORY_SLUG_REGEX, normalizeCategorySlug } from '../utils/category-slug'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'

@Injectable()
export class CategoriesService {
  constructor(
    private prisma: PrismaService,
    private shopeeService: ShopeeService,
    private shopeeAffiliateService: ShopeeAffiliateService,
  ) {}

  async create(name: string, slug: string) {
    const normalizedSlug = this.normalizeAndValidateSlug(name)
    await this.ensureSlugAvailable(normalizedSlug)

    try {
      return await this.prisma.category.create({ data: { name, slug: normalizedSlug } })
    } catch (error) {
      this.handleUniqueConstraint(error)
      throw error
    }
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
    if (!category) throw new NotFoundException('Categoria nao encontrada')
    return category
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.findById(id)

    const data: { name?: string; slug?: string } = {}
    if (dto.name) data.name = dto.name

    if (dto.slug) {
      const normalizedSlug = this.normalizeAndValidateSlug(dto.slug)
      await this.ensureSlugAvailable(normalizedSlug, id)
      data.slug = normalizedSlug
    }

    try {
      return await this.prisma.category.update({ where: { id }, data })
    } catch (error) {
      this.handleUniqueConstraint(error)
      throw error
    }
  }

  async remove(id: string) {
    await this.findById(id)
    await this.prisma.category.delete({ where: { id } })
    return { message: 'Categoria removida com sucesso' }
  }

  async addProducts(categoryId: string, urls: string[]) {
    const category = await this.prisma.category.findUnique({ where: { id: categoryId } })
    if (!category) throw new NotFoundException('Categoria nao encontrada')

    const results: { url: string; status: string; productId?: string; error?: string }[] = []

    for (const url of urls) {
      try {
        const ids = this.shopeeService.extractIds(url)
        if (!ids) {
          results.push({ url, status: 'erro', error: 'URL invalida' })
          continue
        }

        let product = await this.prisma.product.findUnique({ where: { itemId: ids.itemId } })

        if (!product) {
          const shopeeProduct = await this.shopeeAffiliateService.getProductByItemId(ids.itemId)
          if (!shopeeProduct) {
            results.push({ url, status: 'erro', error: 'Produto nao encontrado na Shopee' })
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

    return { message: 'Processamento concluido', results }
  }

  async removeProduct(categoryId: string, productId: string) {
    await this.findById(categoryId)
    const link = await this.prisma.productCategory.findUnique({
      where: { productId_categoryId: { productId, categoryId } },
    })
    if (!link) throw new NotFoundException('Produto nao encontrado nesta categoria')
    await this.prisma.productCategory.delete({
      where: { productId_categoryId: { productId, categoryId } },
    })
    return { message: 'Produto removido da categoria' }
  }

  private normalizeAndValidateSlug(slug: string) {
    const normalized = normalizeCategorySlug(slug)

    if (!CATEGORY_SLUG_REGEX.test(normalized)) {
      throw new BadRequestException(
        'Slug invalido. Use apenas letras minusculas e hifens entre palavras.',
      )
    }

    return normalized
  }

  private async ensureSlugAvailable(slug: string, excludeCategoryId?: string) {
    const existing = await this.prisma.category.findUnique({ where: { slug } })

    if (existing && existing.id !== excludeCategoryId) {
      throw new ConflictException('Slug ja esta em uso')
    }
  }

  private handleUniqueConstraint(error: unknown): never | void {
    if (!(error instanceof PrismaClientKnownRequestError) || error.code !== 'P2002') {
      return
    }

    const target = Array.isArray(error.meta?.target) ? error.meta?.target : []

    if (target.includes('slug')) {
      throw new ConflictException('Slug ja esta em uso')
    }

    if (target.includes('name')) {
      throw new ConflictException('Nome da categoria ja esta em uso')
    }

    throw new ConflictException('Ja existe um registro com os dados informados')
  }
}
