import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { extractItemId } from 'src/utils/extract-item-id'

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async create(name: string) {
    return this.prisma.category.create({
      data: { name },
    })
  }

  async findAll() {
    return this.prisma.category.findMany()
  }

  async update(id: string, name: string) {
    return this.prisma.category.update({
      where: { id },
      data: { name },
    })
  }

  async findById(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        products: {
          include: {
            product: true,
          },
        },
      },
    })

    if(!category) throw new NotFoundException('Categoria não encontrada')

    return category
  }

  async addProducts(categoryId: string, urls: string[]) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    })

    if (!category) throw new NotFoundException('Categoria não encontrada')

    for (const url of urls) {
      const itemId = extractItemId(url)
      if (!itemId) continue

      let product = await this.prisma.product.findUnique({
        where: { itemId },
      })

      // Se não existir, criar placeholder (depois conectamos Shopee API)
      if (!product) {
        product = await this.prisma.product.create({
          data: {
            itemId,
            name: 'Produto temporário',
            shopId: 'unknown',
            shopName: 'unknown',
          },
        })
      }

      await this.prisma.productCategory.upsert({
        where: {
          productId_categoryId: {
            productId: product.id,
            categoryId,
          },
        },
        update: {},
        create: {
          productId: product.id,
          categoryId,
        },
      })
    }

    return { message: 'Produtos vinculados com sucesso' }
  }
}