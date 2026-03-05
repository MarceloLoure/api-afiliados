#!/usr/bin/env bash
# =============================================================================
# apply-changes.sh
# Aplica todas as mudanças de refatoração no projeto api-afiliados:
#   1. POST /products/:id/click  (era GET)
#   2. ShopeeController com prefixo /shopee
#   3. ShopeeModule atualizado
#   4. RankingCronService (cron diário de validação + ranking)
#   5. RankingModule com ScheduleModule
#   6. RankingController com endpoint de trigger manual
#   7. Prisma schema com rankingScore no model Product
#   8. Migration SQL para rankingScore
#   9. http/shopee.http (novo)
#  10. http/users.http (novo)
#  11. http/products.http (atualizado: click vira POST)
#  12. http/ranking.http (atualizado: + cron/run)
#  13. Remove shopee-debug.http (substituído)
#  14. Instala @nestjs/schedule
# =============================================================================

set -e  # para o script se qualquer comando falhar

# ---------------------------------------------------------------------------
# Cores para output
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # sem cor

ok()   { echo -e "${GREEN}  ✔ $1${NC}"; }
info() { echo -e "${CYAN}  → $1${NC}"; }
warn() { echo -e "${YELLOW}  ⚠ $1${NC}"; }
fail() { echo -e "${RED}  ✘ $1${NC}"; exit 1; }
step() { echo -e "\n${BOLD}${CYAN}[ $1 ]${NC}"; }

# ---------------------------------------------------------------------------
# Garante que o script rode a partir da raiz do projeto
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ ! -f "package.json" ]]; then
  fail "Execute este script na raiz do projeto (onde está o package.json)"
fi

# ---------------------------------------------------------------------------
# Backup automático com timestamp
# ---------------------------------------------------------------------------
step "1/14 — Backup dos arquivos que serão alterados"

BACKUP_DIR=".backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

backup_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    local dir="$BACKUP_DIR/$(dirname "$file")"
    mkdir -p "$dir"
    cp "$file" "$dir/$(basename "$file")"
    info "Backup: $file"
  fi
}

backup_file "src/products/products.controller.ts"
backup_file "src/shopee/shopee.module.ts"
backup_file "src/ranking/ranking.module.ts"
backup_file "src/ranking/ranking.controller.ts"
backup_file "prisma/schema.prisma"
backup_file "http/products.http"
backup_file "http/ranking.http"
backup_file "http/shopee-debug.http"

ok "Backup salvo em: $BACKUP_DIR"

# ---------------------------------------------------------------------------
# 1. products.controller.ts — GET :id/click → POST :id/click
# ---------------------------------------------------------------------------
step "2/14 — products.controller.ts: GET :id/click → POST :id/click"

PRODUCTS_CTRL="src/products/products.controller.ts"
[[ -f "$PRODUCTS_CTRL" ]] || fail "Arquivo não encontrado: $PRODUCTS_CTRL"

# Adiciona Post ao import se não existir
if ! grep -q "Post," "$PRODUCTS_CTRL"; then
  sed -i "s/  Controller,/  Controller,\n  Post,/" "$PRODUCTS_CTRL"
  info "Adicionado 'Post' ao import de @nestjs/common"
fi

# Troca @Get(':id/click') por @Post(':id/click')
sed -i "s/@Get(':id\/click')/@Post(':id\/click')/" "$PRODUCTS_CTRL"

# Verifica se a mudança foi aplicada
if grep -q "@Post(':id/click')" "$PRODUCTS_CTRL"; then
  ok "Rota de click alterada para POST"
else
  fail "Falha ao alterar rota de click para POST"
fi

# ---------------------------------------------------------------------------
# 2. shopee.controller.ts — novo arquivo
# ---------------------------------------------------------------------------
step "3/14 — Criando src/shopee/shopee.controller.ts"

cat > src/shopee/shopee.controller.ts << 'TYPESCRIPT'
// src/shopee/shopee.controller.ts

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ShopeeAffiliateService } from './shopee-affiliate.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'

@UseGuards(JwtAuthGuard)
@Controller('shopee')
export class ShopeeController {
  constructor(private readonly shopeeAffiliateService: ShopeeAffiliateService) {}

  /**
   * GET /shopee/test-credentials
   * Valida se SHOPEE_APP_ID e SHOPEE_APP_SECRET estão corretos.
   */
  @Get('test-credentials')
  testCredentials() {
    return this.shopeeAffiliateService.testCredentials()
  }

  /**
   * GET /shopee/item/:itemId
   * Busca um produto na API Shopee Afiliados pelo itemId.
   */
  @Get('item/:itemId')
  getProductByItemId(@Param('itemId') itemId: string) {
    return this.shopeeAffiliateService.getProductByItemId(itemId)
  }

  /**
   * GET /shopee/search?q=keyword&page=1&limit=10
   * Pesquisa produtos na API Shopee Afiliados por palavra-chave.
   */
  @Get('search')
  searchProducts(
    @Query('q') keyword: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    return this.shopeeAffiliateService.searchProducts(
      keyword,
      Number(page),
      Number(limit),
    )
  }

  /**
   * POST /shopee/short-link
   * Gera um shortlink de afiliado a partir de uma URL original da Shopee.
   */
  @Post('short-link')
  generateShortLink(@Body('url') url: string) {
    return this.shopeeAffiliateService.generateShortLink(url)
  }
}
TYPESCRIPT

ok "shopee.controller.ts criado"

# ---------------------------------------------------------------------------
# 3. shopee.module.ts — registra o novo controller
# ---------------------------------------------------------------------------
step "4/14 — Atualizando src/shopee/shopee.module.ts"

cat > src/shopee/shopee.module.ts << 'TYPESCRIPT'
// src/shopee/shopee.module.ts

import { Module } from '@nestjs/common'
import { ShopeeController } from './shopee.controller'
import { ShopeeService } from './shopee.service'
import { ShopeeAffiliateService } from './shopee-affiliate.service'

@Module({
  controllers: [ShopeeController],
  providers: [ShopeeService, ShopeeAffiliateService],
  exports: [ShopeeService, ShopeeAffiliateService],
})
export class ShopeeModule {}
TYPESCRIPT

ok "shopee.module.ts atualizado"

# ---------------------------------------------------------------------------
# 4. ranking-cron.service.ts — novo arquivo
# ---------------------------------------------------------------------------
step "5/14 — Criando src/ranking/ranking-cron.service.ts"

cat > src/ranking/ranking-cron.service.ts << 'TYPESCRIPT'
// src/ranking/ranking-cron.service.ts
//
// CRON DE RANKING — roda automaticamente às 03:00 para:
// 1. Validar todos os produtos contra a API Shopee (preço, sales, rating)
// 2. Calcular score de ranking baseado em cliques + vendas
// 3. Persistir rankingScore no produto
// 4. Salvar snapshot diário em ProductDailyStats

import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../prisma/prisma.service'
import { ShopeeAffiliateService } from '../shopee/shopee-affiliate.service'

/**
 * Pesos do score de ranking (devem somar 1.0).
 * Ajuste conforme a estratégia do negócio.
 */
const RANKING_WEIGHTS = {
  clicks:         0.4,  // 40% — engajamento do usuário no site
  sales:          0.4,  // 40% — prova social (vendas na Shopee)
  commissionRate: 0.1,  // 10% — produtos mais lucrativos ficam mais visíveis
  rating:         0.1,  // 10% — qualidade do produto
}

@Injectable()
export class RankingCronService {
  private readonly logger = new Logger(RankingCronService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly shopeeAffiliate: ShopeeAffiliateService,
  ) {}

  /**
   * Roda todo dia às 03:00.
   * Valida produtos, atualiza dados e recalcula ranking.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async runDailyRankingCron() {
    this.logger.log('🕒 [CRON] Iniciando validação e ranking diário de produtos...')

    const products = await this.prisma.product.findMany({
      select: {
        id: true,
        itemId: true,
        name: true,
        commissionRate: true,
        _count: { select: { clicks: true } },
      },
    })

    this.logger.log(`📦 Total de produtos para processar: ${products.length}`)

    let updated = 0
    let notFound = 0
    let errors = 0

    for (const product of products) {
      try {
        // 1. Busca dados atualizados na API Shopee
        const shopeeData = await this.shopeeAffiliate.getProductByItemId(product.itemId)

        if (!shopeeData) {
          this.logger.warn(
            `⚠️ Produto não encontrado na Shopee: ${product.itemId} — "${product.name}"`,
          )
          notFound++
          continue
        }

        // 2. Atualiza campos dinâmicos no banco
        await this.prisma.product.update({
          where: { id: product.id },
          data: {
            price:          Number(shopeeData.priceMin),
            rating:         Number(shopeeData.ratingStar ?? 0),
            sales:          Number(shopeeData.sales ?? 0),
            commissionRate: Number(shopeeData.commissionRate ?? 0),
            affiliatedUrl:  shopeeData.offerLink ?? undefined,
          },
        })

        // 3. Salva snapshot diário
        await this.prisma.productDailyStats.create({
          data: {
            productId: product.id,
            rating:    Number(shopeeData.ratingStar ?? 0),
            sales:     Number(shopeeData.sales ?? 0),
          },
        })

        updated++
      } catch (err: any) {
        this.logger.error(
          `❌ Erro ao processar produto ${product.itemId}: ${err?.message}`,
        )
        errors++
      }
    }

    this.logger.log(
      `✅ [CRON] Validação concluída: ${updated} atualizados | ${notFound} não encontrados | ${errors} erros`,
    )

    // 4. Recalcula e persiste o score de ranking
    await this.computeAndPersistRanking()
  }

  /**
   * Calcula o score normalizado de cada produto e persiste como rankingScore.
   * Score é usado para ordenação automática na home e listagens.
   */
  private async computeAndPersistRanking() {
    this.logger.log('📊 Calculando e persistindo scores de ranking...')

    const products = await this.prisma.product.findMany({
      select: {
        id: true,
        name: true,
        sales: true,
        rating: true,
        commissionRate: true,
        _count: { select: { clicks: true } },
      },
    })

    if (products.length === 0) return

    // Normalização: máximo de cada métrica para escalar 0-1
    const maxClicks         = Math.max(...products.map(p => p._count.clicks), 1)
    const maxSales          = Math.max(...products.map(p => p.sales ?? 0), 1)
    const maxCommissionRate = Math.max(...products.map(p => p.commissionRate ?? 0), 1)
    const maxRating         = Math.max(...products.map(p => p.rating ?? 0), 1)

    const ranked = products.map(p => {
      const score =
        (p._count.clicks / maxClicks)         * RANKING_WEIGHTS.clicks +
        ((p.sales ?? 0) / maxSales)            * RANKING_WEIGHTS.sales +
        ((p.commissionRate ?? 0) / maxCommissionRate) * RANKING_WEIGHTS.commissionRate +
        ((p.rating ?? 0) / maxRating)          * RANKING_WEIGHTS.rating

      return {
        id:    p.id,
        name:  p.name,
        score: Math.round(score * 10000) / 10000, // 4 casas decimais
      }
    })

    // Persiste o rankingScore em lote
    await Promise.all(
      ranked.map(p =>
        this.prisma.product.update({
          where: { id: p.id },
          data: { rankingScore: p.score },
        }),
      ),
    )

    // Loga top 20
    const top20 = [...ranked].sort((a, b) => b.score - a.score).slice(0, 20)
    this.logger.log('🏆 Top 20 produtos por ranking score:')
    top20.forEach((p, i) => {
      this.logger.log(`  ${String(i + 1).padStart(2, '0')}. [${p.score}] ${p.name}`)
    })

    this.logger.log(`✅ rankingScore persistido em ${ranked.length} produtos`)
  }

  /**
   * Trigger manual via endpoint admin.
   * Permite rodar o cron sob demanda sem esperar 03:00.
   */
  async runManually() {
    this.logger.log('🔧 [CRON MANUAL] Trigger via endpoint admin')
    await this.runDailyRankingCron()
    return { message: 'Cron de ranking executado manualmente com sucesso' }
  }
}
TYPESCRIPT

ok "ranking-cron.service.ts criado"

# ---------------------------------------------------------------------------
# 5. ranking.module.ts — adiciona ScheduleModule e RankingCronService
# ---------------------------------------------------------------------------
step "6/14 — Atualizando src/ranking/ranking.module.ts"

cat > src/ranking/ranking.module.ts << 'TYPESCRIPT'
// src/ranking/ranking.module.ts

import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { RankingController } from './ranking.controller'
import { RankingService } from './ranking.service'
import { RankingCronService } from './ranking-cron.service'
import { ShopeeModule } from '../shopee/shopee.module'

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ShopeeModule,
  ],
  controllers: [RankingController],
  providers: [RankingService, RankingCronService],
  exports: [RankingCronService],
})
export class RankingModule {}
TYPESCRIPT

ok "ranking.module.ts atualizado"

# ---------------------------------------------------------------------------
# 6. ranking.controller.ts — adiciona POST cron/run
# ---------------------------------------------------------------------------
step "7/14 — Atualizando src/ranking/ranking.controller.ts"

cat > src/ranking/ranking.controller.ts << 'TYPESCRIPT'
// src/ranking/ranking.controller.ts

import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common'
import { RankingService } from './ranking.service'
import { RankingCronService } from './ranking-cron.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'

@Controller('ranking')
export class RankingController {
  constructor(
    private rankingService: RankingService,
    private rankingCronService: RankingCronService,
  ) {}

  /** GET /ranking/dashboard — visão geral para admin. Protegido. */
  @UseGuards(JwtAuthGuard)
  @Get('dashboard')
  getDashboard() {
    return this.rankingService.getDashboard()
  }

  /** GET /ranking/top-products?limit=10 — top por cliques. Público. */
  @Get('top-products')
  getMostClicked(@Query('limit') limit = '10') {
    return this.rankingService.getMostClickedProducts(Number(limit))
  }

  /** GET /ranking/category/:id?limit=10 — top de uma categoria. Público. */
  @Get('category/:id')
  getMostClickedByCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit = '10',
  ) {
    return this.rankingService.getMostClickedByCategory(id, Number(limit))
  }

  /** GET /ranking/categories-report — relatório por categoria. Protegido. */
  @UseGuards(JwtAuthGuard)
  @Get('categories-report')
  getCategoryReport() {
    return this.rankingService.getCategoryReport()
  }

  /** GET /ranking/conversion-estimate — estimativa de ganhos. Protegido. */
  @UseGuards(JwtAuthGuard)
  @Get('conversion-estimate')
  getConversionEstimate() {
    return this.rankingService.getConversionEstimate()
  }

  /**
   * POST /ranking/cron/run
   * Dispara o cron de validação e ranking manualmente. Protegido.
   * Útil para testes e reprocessamentos sem esperar as 03:00.
   */
  @UseGuards(JwtAuthGuard)
  @Post('cron/run')
  runCronManually() {
    return this.rankingCronService.runManually()
  }
}
TYPESCRIPT

ok "ranking.controller.ts atualizado"

# ---------------------------------------------------------------------------
# 7. prisma/schema.prisma — adiciona rankingScore ao model Product
# ---------------------------------------------------------------------------
step "8/14 — Adicionando rankingScore ao prisma/schema.prisma"

SCHEMA="prisma/schema.prisma"
[[ -f "$SCHEMA" ]] || fail "Arquivo não encontrado: $SCHEMA"

if grep -q "rankingScore" "$SCHEMA"; then
  warn "rankingScore já existe no schema — pulando"
else
  # Insere rankingScore logo após shortLink no model Product
  sed -i '/shortLink     String?/a\  rankingScore  Float?   @default(0)' "$SCHEMA"
  ok "Campo rankingScore adicionado ao model Product"
fi

# ---------------------------------------------------------------------------
# 8. Migration SQL para rankingScore
# ---------------------------------------------------------------------------
step "9/14 — Criando migration SQL para rankingScore"

MIGRATION_DIR="prisma/migrations/$(date +%Y%m%d%H%M%S)_add_ranking_score"
mkdir -p "$MIGRATION_DIR"

cat > "$MIGRATION_DIR/migration.sql" << 'SQL'
-- AlterTable: adiciona rankingScore ao model Product
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "rankingScore" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Index para ordenação eficiente por score na home e listagens
CREATE INDEX IF NOT EXISTS "Product_rankingScore_idx" ON "Product"("rankingScore" DESC);
SQL

ok "Migration criada em: $MIGRATION_DIR/migration.sql"

# ---------------------------------------------------------------------------
# 9. http/shopee.http — novo arquivo
# ---------------------------------------------------------------------------
step "10/14 — Criando http/shopee.http"

mkdir -p http

cat > http/shopee.http << 'HTTP'
### ============================================
### SHOPEE - Testes HTTP
### ============================================

@baseUrl = http://localhost:3000
@token = SEU_TOKEN_JWT_AQUI

### 1. Testar credenciais Shopee (sempre rodar primeiro)
GET {{baseUrl}}/shopee/test-credentials
Authorization: Bearer {{token}}

###

### 2. Buscar produto por itemId
GET {{baseUrl}}/shopee/item/20599662745
Authorization: Bearer {{token}}

###

### 3. Pesquisar por keyword (paginado)
GET {{baseUrl}}/shopee/search?q=maquina+de+lavar&page=1&limit=5
Authorization: Bearer {{token}}

###

### 4. Gerar shortlink de afiliado a partir de URL original
POST {{baseUrl}}/shopee/short-link
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "url": "https://shopee.com.br/M%C3%A1quina-de-Lavar-Colormaq-12kg-i.781250043.20599662745"
}

###
HTTP

ok "http/shopee.http criado"

# ---------------------------------------------------------------------------
# 10. http/users.http — novo arquivo
# ---------------------------------------------------------------------------
step "11/14 — Criando http/users.http"

cat > http/users.http << 'HTTP'
### ============================================
### USERS - Testes HTTP
### ============================================
### Nota: criação de usuário é feita via /auth/register
### Este módulo expõe endpoints de gestão para o admin.

@baseUrl = http://localhost:3000
@token = SEU_TOKEN_JWT_AQUI
@userId = UUID_DO_USUARIO

### 1. Listar todos os usuários (protegido)
GET {{baseUrl}}/users
Authorization: Bearer {{token}}

###

### 2. Buscar usuário por ID (protegido)
GET {{baseUrl}}/users/{{userId}}
Authorization: Bearer {{token}}

###

### 3. Atualizar e-mail ou senha (protegido)
PATCH {{baseUrl}}/users/{{userId}}
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "email": "novo@email.com",
  "password": "NovaSenhaForte456!"
}

###

### 4. Deletar usuário (protegido)
DELETE {{baseUrl}}/users/{{userId}}
Authorization: Bearer {{token}}

###
HTTP

ok "http/users.http criado"

# ---------------------------------------------------------------------------
# 11. http/products.http — atualiza click para POST
# ---------------------------------------------------------------------------
step "12/14 — Atualizando http/products.http (click → POST)"

cat > http/products.http << 'HTTP'
### ============================================
### PRODUCTS - Testes HTTP
### ============================================

@baseUrl = http://localhost:3000
@token = SEU_TOKEN_JWT_AQUI
@productId = UUID_DO_PRODUTO

### 1. Criar a partir de URLs Shopee (protegido)
POST {{baseUrl}}/products/from-urls
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "urls": ["https://shopee.com.br/Camiseta-Oversized-Texturizada-Casual-B%C3%A1sica-Lisa-Reta-i.546486172.42654183403"],
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

### 7. Registrar clique — retorna redirectUrl para afiliado (público)
### O front chama isso ao usuário clicar e redireciona para redirectUrl
POST {{baseUrl}}/products/{{productId}}/click

###

### 8. Estatísticas de cliques (protegido)
GET {{baseUrl}}/products/{{productId}}/stats
Authorization: Bearer {{token}}

###

### 9. Deletar (protegido)
DELETE {{baseUrl}}/products/{{productId}}
Authorization: Bearer {{token}}

###
HTTP

ok "http/products.http atualizado"

# ---------------------------------------------------------------------------
# 12. http/ranking.http — adiciona cron/run
# ---------------------------------------------------------------------------
step "13/14 — Atualizando http/ranking.http (+ cron/run)"

cat > http/ranking.http << 'HTTP'
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

### 3. Top produtos — limite customizado
GET {{baseUrl}}/ranking/top-products?limit=5

###

### 4. Top por categoria (público)
GET {{baseUrl}}/ranking/category/{{categoryId}}

###

### 5. Relatório por categoria (protegido)
GET {{baseUrl}}/ranking/categories-report
Authorization: Bearer {{token}}

###

### 6. Estimativa de conversão por comissão (protegido)
GET {{baseUrl}}/ranking/conversion-estimate
Authorization: Bearer {{token}}

###

### 7. Disparar cron de ranking manualmente (protegido)
### Valida todos os produtos na API Shopee, atualiza dados e recalcula scores
POST {{baseUrl}}/ranking/cron/run
Authorization: Bearer {{token}}

###
HTTP

ok "http/ranking.http atualizado"

# ---------------------------------------------------------------------------
# 13. Remove shopee-debug.http (substituído por shopee.http)
# ---------------------------------------------------------------------------
step "14/14 — Removendo http/shopee-debug.http (substituído por shopee.http)"

if [[ -f "http/shopee-debug.http" ]]; then
  rm http/shopee-debug.http
  ok "http/shopee-debug.http removido"
else
  warn "http/shopee-debug.http não encontrado — nada a remover"
fi

# ---------------------------------------------------------------------------
# Instala @nestjs/schedule
# ---------------------------------------------------------------------------
step "Instalando dependência @nestjs/schedule"

if grep -q '"@nestjs/schedule"' package.json; then
  warn "@nestjs/schedule já está no package.json — pulando instalação"
else
  info "Rodando: npm install @nestjs/schedule"
  npm install @nestjs/schedule
  ok "@nestjs/schedule instalado"
fi

# ---------------------------------------------------------------------------
# Aplica a migration no banco
# ---------------------------------------------------------------------------
step "Aplicando migration no banco (prisma migrate deploy)"

if [[ -z "${DATABASE_URL}" ]]; then
  warn "DATABASE_URL não definida no ambiente — pulando migrate deploy"
  warn "Execute manualmente: npx prisma migrate deploy && npx prisma generate"
else
  npx prisma migrate deploy
  npx prisma generate
  ok "Migration aplicada e Prisma client regenerado"
fi

# ---------------------------------------------------------------------------
# Resumo final
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}  ✅  Todas as mudanças aplicadas com sucesso!${NC}"
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BOLD}Arquivos alterados:${NC}"
echo "  src/products/products.controller.ts   — click: GET → POST"
echo "  src/shopee/shopee.controller.ts        — NOVO (prefixo /shopee)"
echo "  src/shopee/shopee.module.ts            — registra ShopeeController"
echo "  src/ranking/ranking-cron.service.ts   — NOVO (cron 03:00 + score)"
echo "  src/ranking/ranking.module.ts          — ScheduleModule + CronService"
echo "  src/ranking/ranking.controller.ts      — POST /ranking/cron/run"
echo "  prisma/schema.prisma                   — rankingScore Float no Product"
echo "  prisma/migrations/*_add_ranking_score  — NOVA migration SQL"
echo "  http/shopee.http                       — NOVO"
echo "  http/users.http                        — NOVO"
echo "  http/products.http                     — click atualizado para POST"
echo "  http/ranking.http                      — cron/run adicionado"
echo "  http/shopee-debug.http                 — REMOVIDO"
echo ""
echo -e "${BOLD}Backup dos originais em:${NC} ${YELLOW}$BACKUP_DIR/${NC}"
echo ""
echo -e "${BOLD}Próximos passos manuais (se DATABASE_URL não estava definida):${NC}"
echo "  npx prisma migrate deploy"
echo "  npx prisma generate"
echo "  npm run start:dev"
echo ""