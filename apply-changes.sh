#!/bin/bash

# =============================================================================
# Script de aplicação das alterações — Fases 3, 4 e 5
# Sistema de Afiliados Shopee — NestJS + Prisma + Supabase
#
# CORREÇÃO do erro P3006/P1014:
#   Aplica o SQL diretamente no banco via Node.js (pg), depois usa
#   "prisma migrate resolve --applied" para registrar no histórico
#   sem passar pela shadow database. Não precisa de psql instalado.
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()    { echo -e "${GREEN}[✔]${NC} $1"; }
warn()   { echo -e "${YELLOW}[!]${NC} $1"; }
error()  { echo -e "${RED}[✘]${NC} $1"; exit 1; }
header() { echo -e "\n${BLUE}══════════════════════════════════════${NC}"; echo -e "${BLUE}  $1${NC}"; echo -e "${BLUE}══════════════════════════════════════${NC}"; }

# Verifica raiz do projeto
if [ ! -f "package.json" ] || [ ! -d "prisma" ] || [ ! -d "src" ]; then
  error "Execute este script na raiz do projeto NestJS (onde ficam src/ e prisma/)"
fi

header "FASE 3-5 — Aplicando alterações"

# =============================================================================
# 1. PRISMA SCHEMA
# =============================================================================
header "1/8 — Atualizando prisma/schema.prisma"

cat > prisma/schema.prisma << 'PRISMA_EOF'
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  ADMIN
}

model User {
  id        String   @id @default(uuid())
  email     String   @unique
  password  String
  role      Role     @default(ADMIN)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Product {
  id             String  @id @default(uuid())
  itemId         String  @unique
  name           String
  imageUrl       String?
  price          Float?
  rating         Float?
  sales          Int?
  commissionRate Float?

  shopId        String
  shopName      String

  originalUrl   String?
  affiliatedUrl String?
  shortLink     String?

  categories ProductCategory[]
  dailyStats ProductDailyStats[]
  clicks     ClickLog[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Category {
  id        String            @id @default(uuid())
  name      String            @unique
  products  ProductCategory[]
  createdAt DateTime          @default(now())
  updatedAt DateTime          @updatedAt
}

model ProductCategory {
  productId  String
  categoryId String

  product  Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  category Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)

  @@id([productId, categoryId])
}

model ProductDailyStats {
  id        String  @id @default(uuid())
  product   Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  productId String

  rating Float?
  sales  Int?

  createdAt DateTime @default(now())
}

model ClickLog {
  id        String  @id @default(uuid())
  product   Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  productId String

  ip        String?
  userAgent String?
  referer   String?

  createdAt DateTime @default(now())
}
PRISMA_EOF

log "prisma/schema.prisma atualizado"

# =============================================================================
# 2. MIGRATION SQL
# =============================================================================
header "2/8 — Criando pasta e arquivo migration SQL"

MIGRATION_NAME="20260303000001_add_click_log_and_commission"
MIGRATION_DIR="prisma/migrations/${MIGRATION_NAME}"
mkdir -p "$MIGRATION_DIR"

cat > "$MIGRATION_DIR/migration.sql" << 'SQL_EOF'
-- AlterTable: adiciona commissionRate e shortLink em Product
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "commissionRate" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "shortLink"      TEXT;

-- AlterTable: adiciona timestamps em Category
ALTER TABLE "Category"
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable: ClickLog
CREATE TABLE IF NOT EXISTS "ClickLog" (
    "id"        TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "ip"        TEXT,
    "userAgent" TEXT,
    "referer"   TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClickLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey (seguro se já existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ClickLog_productId_fkey'
  ) THEN
    ALTER TABLE "ClickLog"
      ADD CONSTRAINT "ClickLog_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
SQL_EOF

log "Migration SQL criada em $MIGRATION_DIR"

# =============================================================================
# Carrega .env
# =============================================================================
if [ -f ".env" ]; then
  set -a
  source .env
  set +a
fi

if [ -z "$DATABASE_URL" ]; then
  error "DATABASE_URL não encontrada. Verifique seu .env"
fi

# =============================================================================
# 3. APLICA SQL VIA NODE.JS (sem precisar de psql)
# =============================================================================
header "3/8 — Aplicando SQL direto no banco via Node.js"

warn "Instalando 'pg' temporariamente para executar o SQL..."
npm install pg --save-dev --silent 2>/dev/null || true

warn "Executando migration SQL no banco..."
node - << 'NODE_EOF'
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(
  path.join('prisma', 'migrations', '20260303000001_add_click_log_and_commission', 'migration.sql'),
  'utf8'
);

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  console.log('  Conectado ao banco.');
  try {
    await client.query(sql);
    console.log('  SQL aplicado com sucesso!');
  } catch (err) {
    console.error('  Erro ao aplicar SQL:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
NODE_EOF

log "SQL aplicado no banco com sucesso"

# =============================================================================
# Registra a migration no histórico do Prisma sem shadow database
# =============================================================================
header "4/8 — Registrando migration no histórico Prisma"

warn "Rodando: npx prisma migrate resolve --applied $MIGRATION_NAME"
npx prisma migrate resolve --applied "$MIGRATION_NAME"
log "Migration '$MIGRATION_NAME' registrada no histórico"

# =============================================================================
# 5. CATEGORIES
# =============================================================================
header "5/8 — Atualizando módulo Categories"

mkdir -p src/categories/dto

cat > src/categories/categories.module.ts << 'EOF'
// src/categories/categories.module.ts

import { Module } from '@nestjs/common'
import { CategoriesController } from './categories.controller'
import { CategoriesService } from './categories.service'
import { ShopeeModule } from '../shopee/shopee.module'

@Module({
  imports: [ShopeeModule],
  controllers: [CategoriesController],
  providers: [CategoriesService],
})
export class CategoriesModule {}
EOF
log "src/categories/categories.module.ts"

cat > src/categories/categories.controller.ts << 'EOF'
// src/categories/categories.controller.ts

import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
} from '@nestjs/common'
import { CategoriesService } from './categories.service'
import { CreateCategoryDto } from './dto/create-category.dto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { UpdateCategoryDto } from './dto/update-category.dto'
import { AddProductsToCategoryDto } from './dto/add-products.dto'

@Controller('categories')
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) {}

  @Get()
  async findAll() {
    return this.categoriesService.findAll()
  }

  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.findById(id)
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto.name)
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(id, dto.name)
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.remove(id)
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/products')
  async addProducts(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddProductsToCategoryDto,
  ) {
    return this.categoriesService.addProducts(id, dto.urls)
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/products/:productId')
  async removeProduct(
    @Param('id', ParseUUIDPipe) categoryId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.categoriesService.removeProduct(categoryId, productId)
  }
}
EOF
log "src/categories/categories.controller.ts"

cat > src/categories/categories.service.ts << 'EOF'
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
EOF
log "src/categories/categories.service.ts"

# =============================================================================
# 6. PRODUCTS
# =============================================================================
header "6/8 — Atualizando módulo Products"

mkdir -p src/products/dto

cat > src/products/dto/update-product.dto.ts << 'EOF'
// src/products/dto/update-product.dto.ts

import { IsOptional, IsString, IsNumber } from 'class-validator'

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  imageUrl?: string

  @IsOptional()
  @IsNumber()
  price?: number

  @IsOptional()
  @IsString()
  shortLink?: string

  @IsOptional()
  @IsString()
  affiliatedUrl?: string
}
EOF
log "src/products/dto/update-product.dto.ts"

cat > src/products/products.controller.ts << 'EOF'
// src/products/products.controller.ts

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  UseGuards,
  Req,
  Ip,
  Headers,
} from '@nestjs/common'
import { Request } from 'express'
import { ProductsService } from './products.service'
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard'
import { CreateProductsFromUrlsDto } from './dto/create-product.dto'
import { UpdateProductDto } from './dto/update-product.dto'

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('from-urls')
  createFromUrls(@Body() dto: CreateProductsFromUrlsDto) {
    return this.productsService.createFromUrls(dto.urls, dto.categoryId)
  }

  @Get()
  findAll(
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.productsService.findAll({
      categoryId,
      search,
      page: Number(page),
      limit: Number(limit),
    })
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.findOne(id)
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(id, dto)
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.remove(id)
  }

  @Get(':id/click')
  trackClick(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
    @Headers('referer') referer: string,
  ) {
    return this.productsService.trackClick(id, { ip, userAgent, referer })
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/stats')
  getStats(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.getProductStats(id)
  }
}
EOF
log "src/products/products.controller.ts"

cat > src/products/products.service.ts << 'EOF'
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

    const created = []
    const skipped = []
    const errors = []

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
        categories: { include: { category: true } },
        _count: { select: { clicks: true } },
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
EOF
log "src/products/products.service.ts"

# =============================================================================
# 7. RANKING
# =============================================================================
header "7/8 — Criando módulo Ranking"

mkdir -p src/ranking

cat > src/ranking/ranking.module.ts << 'EOF'
// src/ranking/ranking.module.ts

import { Module } from '@nestjs/common'
import { RankingController } from './ranking.controller'
import { RankingService } from './ranking.service'

@Module({
  controllers: [RankingController],
  providers: [RankingService],
})
export class RankingModule {}
EOF
log "src/ranking/ranking.module.ts"

cat > src/ranking/ranking.controller.ts << 'EOF'
// src/ranking/ranking.controller.ts

import {
  Controller,
  Get,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common'
import { RankingService } from './ranking.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'

@Controller('ranking')
export class RankingController {
  constructor(private rankingService: RankingService) {}

  @UseGuards(JwtAuthGuard)
  @Get('dashboard')
  getDashboard() {
    return this.rankingService.getDashboard()
  }

  @Get('top-products')
  getMostClicked(@Query('limit') limit = '10') {
    return this.rankingService.getMostClickedProducts(Number(limit))
  }

  @Get('category/:id')
  getMostClickedByCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit = '10',
  ) {
    return this.rankingService.getMostClickedByCategory(id, Number(limit))
  }

  @UseGuards(JwtAuthGuard)
  @Get('categories-report')
  getCategoryReport() {
    return this.rankingService.getCategoryReport()
  }

  @UseGuards(JwtAuthGuard)
  @Get('conversion-estimate')
  getConversionEstimate() {
    return this.rankingService.getConversionEstimate()
  }
}
EOF
log "src/ranking/ranking.controller.ts"

cat > src/ranking/ranking.service.ts << 'EOF'
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
EOF
log "src/ranking/ranking.service.ts"

# =============================================================================
# 8. HTTP TEST FILES + PRISMA GENERATE
# =============================================================================
header "8/8 — Arquivos HTTP e prisma generate"

mkdir -p http

cat > http/auth.http << 'EOF'
### ============================================
### AUTH - Testes HTTP
### ============================================

@baseUrl = http://localhost:3000

### 1. Registrar Admin
POST {{baseUrl}}/auth/register
Content-Type: application/json
x-admin-secret: {{$dotenv ADMIN_SECRET}}

{
  "email": "admin@email.com",
  "password": "SenhaForte123!"
}

###

### 2. Login
# @name login
POST {{baseUrl}}/auth/login
Content-Type: application/json

{
  "email": "admin@email.com",
  "password": "SenhaForte123!"
}

###

### 3. Ver perfil (protegido)
GET {{baseUrl}}/auth/me
Content-Type: application/json
Authorization: Bearer {{login.response.body.access_token}}

###
EOF
log "http/auth.http"

cat > http/categories.http << 'EOF'
### ============================================
### CATEGORIES - Testes HTTP
### ============================================

@baseUrl = http://localhost:3000
@token = SEU_TOKEN_JWT_AQUI
@categoryId = UUID_DA_CATEGORIA
@productId = UUID_DO_PRODUTO

### 1. Listar todas (público)
GET {{baseUrl}}/categories

###

### 2. Buscar por ID (público)
GET {{baseUrl}}/categories/{{categoryId}}

###

### 3. Criar (protegido)
POST {{baseUrl}}/categories
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "name": "Perfumes"
}

###

### 4. Atualizar (protegido)
PATCH {{baseUrl}}/categories/{{categoryId}}
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "name": "Perfumes & Cosméticos"
}

###

### 5. Adicionar produtos via URL Shopee (protegido)
POST {{baseUrl}}/categories/{{categoryId}}/products
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "urls": [
    "https://shopee.com.br/Produto-A-i.123456.987654321"
  ]
}

###

### 6. Remover produto de categoria (protegido)
DELETE {{baseUrl}}/categories/{{categoryId}}/products/{{productId}}
Authorization: Bearer {{token}}

###

### 7. Deletar categoria (protegido)
DELETE {{baseUrl}}/categories/{{categoryId}}
Authorization: Bearer {{token}}

###
EOF
log "http/categories.http"

cat > http/products.http << 'EOF'
### ============================================
### PRODUCTS - Testes HTTP
### ============================================

@baseUrl = http://localhost:3000
@token = SEU_TOKEN_JWT_AQUI
@productId = UUID_DO_PRODUTO

### 1. Criar a partir de URLs (protegido)
POST {{baseUrl}}/products/from-urls
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "urls": ["https://shopee.com.br/Produto-A-i.123456.987654321"],
  "categoryId": "UUID_DA_CATEGORIA"
}

###

### 2. Listar todos (público)
GET {{baseUrl}}/products

###

### 3. Filtrar por categoria e paginar
GET {{baseUrl}}/products?categoryId=UUID_DA_CATEGORIA&page=1&limit=10

###

### 4. Buscar por nome
GET {{baseUrl}}/products?search=perfume

###

### 5. Buscar por ID (público)
GET {{baseUrl}}/products/{{productId}}

###

### 6. Atualizar (protegido)
PATCH {{baseUrl}}/products/{{productId}}
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "name": "Nome Atualizado",
  "price": 99.90
}

###

### 7. Registrar clique / obter shortLink (público)
GET {{baseUrl}}/products/{{productId}}/click

###

### 8. Estatísticas de cliques (protegido)
GET {{baseUrl}}/products/{{productId}}/stats
Authorization: Bearer {{token}}

###

### 9. Deletar (protegido)
DELETE {{baseUrl}}/products/{{productId}}
Authorization: Bearer {{token}}

###
EOF
log "http/products.http"

cat > http/ranking.http << 'EOF'
### ============================================
### RANKING & DASHBOARD - Testes HTTP
### ============================================

@baseUrl = http://localhost:3000
@token = SEU_TOKEN_JWT_AQUI
@categoryId = UUID_DA_CATEGORIA

### 1. Dashboard geral (protegido)
GET {{baseUrl}}/ranking/dashboard
Authorization: Bearer {{token}}

###

### 2. Top produtos mais clicados (público)
GET {{baseUrl}}/ranking/top-products

###

### 3. Top produtos - limite customizado
GET {{baseUrl}}/ranking/top-products?limit=5

###

### 4. Top por categoria (público)
GET {{baseUrl}}/ranking/category/{{categoryId}}

###

### 5. Relatório por categoria (protegido)
GET {{baseUrl}}/ranking/categories-report
Authorization: Bearer {{token}}

###

### 6. Estimativa de conversão (protegido)
GET {{baseUrl}}/ranking/conversion-estimate
Authorization: Bearer {{token}}

###
EOF
log "http/ranking.http"

warn "Rodando: npx prisma generate"
npx prisma generate
log "Prisma Client gerado com sucesso"

# =============================================================================
# DONE
# =============================================================================
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ✔  Todas as alterações foram aplicadas!            ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Arquivos alterados/criados:"
echo -e "  ${BLUE}prisma/schema.prisma${NC}"
echo -e "  ${BLUE}prisma/migrations/${MIGRATION_NAME}/${NC}"
echo -e "  ${BLUE}src/categories/categories.module.ts${NC}"
echo -e "  ${BLUE}src/categories/categories.controller.ts${NC}"
echo -e "  ${BLUE}src/categories/categories.service.ts${NC}"
echo -e "  ${BLUE}src/products/products.controller.ts${NC}"
echo -e "  ${BLUE}src/products/products.service.ts${NC}"
echo -e "  ${BLUE}src/products/dto/update-product.dto.ts${NC}"
echo -e "  ${BLUE}src/ranking/ranking.module.ts${NC}"
echo -e "  ${BLUE}src/ranking/ranking.controller.ts${NC}"
echo -e "  ${BLUE}src/ranking/ranking.service.ts${NC}"
echo -e "  ${BLUE}http/auth.http${NC}"
echo -e "  ${BLUE}http/categories.http${NC}"
echo -e "  ${BLUE}http/products.http${NC}"
echo -e "  ${BLUE}http/ranking.http${NC}"
echo ""
echo -e "Para iniciar: ${YELLOW}npm run start:dev${NC}"