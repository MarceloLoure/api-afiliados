// src/shopee/shopee-affiliate.service.ts

import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common'
import axios, { AxiosError } from 'axios'
import * as crypto from 'crypto'

@Injectable()
export class ShopeeAffiliateService {
  private readonly logger = new Logger(ShopeeAffiliateService.name)

  private appId = process.env.SHOPEE_APP_ID!
  private secret = process.env.SHOPEE_APP_SECRET!
  private baseUrl = 'https://open-api.affiliate.shopee.com.br/graphql'

  private validateCredentials() {
    if (!this.appId || !this.secret) {
      this.logger.error('❌ SHOPEE_APP_ID ou SHOPEE_APP_SECRET não estão definidos no .env')
      throw new InternalServerErrorException(
        'Credenciais da Shopee não configuradas. Verifique SHOPEE_APP_ID e SHOPEE_APP_SECRET no .env',
      )
    }
  }

  private buildHeadersAndPayload(queryOrMutation: string): {
    headers: Record<string, string>
    payload: string
  } {
    this.validateCredentials()

    const payloadObject = { query: queryOrMutation }
    const payload = JSON.stringify(payloadObject)
    const timestamp = Math.floor(Date.now() / 1000)
    const baseString = `${this.appId}${timestamp}${payload}${this.secret}`

    const signature = crypto
      .createHash('sha256')
      .update(baseString)
      .digest('hex')

    this.logger.debug(`🔐 Timestamp: ${timestamp}`)
    this.logger.debug(`🔐 Signature: ${signature.substring(0, 20)}...`)

    const headers = {
      Authorization: `SHA256 Credential=${this.appId}, Timestamp=${timestamp}, Signature=${signature}`,
      'Content-Type': 'application/json',
    }

    return { headers, payload }
  }

  private async callShopeeGraphQL(query: string) {
    const { headers, payload } = this.buildHeadersAndPayload(query)

    this.logger.debug(`📤 Payload: ${payload}`)

    try {
      const response = await axios.post(this.baseUrl, payload, { headers })

      this.logger.debug(`📥 Resposta: ${JSON.stringify(response.data)}`)

      if (response.data?.errors) {
        const errors = response.data.errors
        this.logger.error(`❌ GraphQL errors: ${JSON.stringify(errors)}`)
        throw new InternalServerErrorException(
          `Shopee GraphQL error: ${errors.map((e: any) => e.message).join(', ')}`,
        )
      }

      return response.data

    } catch (err) {
      if (err instanceof AxiosError) {
        const status = err.response?.status
        const data = err.response?.data

        this.logger.error(`❌ HTTP ${status} da Shopee API`)
        this.logger.error(`❌ Body: ${JSON.stringify(data)}`)

        throw new InternalServerErrorException(
          `Shopee API retornou HTTP ${status}: ${JSON.stringify(data)}`,
        )
      }

      throw err
    }
  }

  async getProductByItemId(itemId: string) {
    this.logger.log(`🔍 Buscando produto itemId: ${itemId}`)

    const query = `
      query {
        productOfferV2(itemId: ${itemId}, limit: 1) {
          nodes {
            itemId
            productName
            imageUrl
            priceMin
            priceMax
            sales
            ratingStar
            commissionRate
            offerLink
            shopId
            shopName
          }
        }
      }
    `

    const data = await this.callShopeeGraphQL(query)
    const product = data?.data?.productOfferV2?.nodes?.[0]

    if (!product) {
      this.logger.warn(`⚠️ Produto ${itemId} não encontrado ou sem oferta de afiliado`)
      return null
    }

    this.logger.log(`✅ Produto encontrado: ${product.productName}`)
    return product
  }

  async generateShortLink(originUrl: string): Promise<string | null> {
    this.logger.log(`🔗 Gerando shortlink para: ${originUrl}`)

    const mutation = `
      mutation {
        generateShortLink(
          input: {
            originUrl: "${originUrl}"
          }
        ) {
          shortLink
        }
      }
    `

    const data = await this.callShopeeGraphQL(mutation)
    const shortLink = data?.data?.generateShortLink?.shortLink

    if (!shortLink) {
      this.logger.warn(`⚠️ shortLink não retornado para: ${originUrl}`)
      return null
    }

    this.logger.log(`✅ ShortLink: ${shortLink}`)
    return shortLink
  }

  async searchProducts(keyword: string, page = 1, limit = 10) {
    this.logger.log(`🔍 Pesquisando: "${keyword}"`)

    const query = `
      query {
        productOfferV2(
          keyword: "${keyword}",
          sortType: 2,
          page: ${page},
          limit: ${limit}
        ) {
          nodes {
            itemId
            productName
            imageUrl
            priceMin
            priceMax
            sales
            ratingStar
            commissionRate
            offerLink
            shopId
            shopName
          }
          pageInfo {
            page
            limit
            hasNextPage
          }
        }
      }
    `

    return this.callShopeeGraphQL(query)
  }

  async testCredentials() {
    this.logger.log('🧪 Testando credenciais Shopee...')

    try {
      this.validateCredentials()

      const query = `
        query {
          productOfferV2(keyword: "test", limit: 1) {
            nodes {
              itemId
              productName
            }
          }
        }
      `

      const data = await this.callShopeeGraphQL(query)

      return {
        success: true,
        appId: this.appId,
        message: 'Credenciais válidas',
        sampleResponse: data,
      }
    } catch (err: any) {
      return {
        success: false,
        appId: this.appId,
        message: err.message,
      }
    }
  }
}
