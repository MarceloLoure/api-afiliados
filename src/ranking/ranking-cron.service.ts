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
