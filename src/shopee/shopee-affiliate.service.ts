import { Injectable } from '@nestjs/common'
import axios from 'axios'
import * as crypto from 'crypto'

@Injectable()
export class ShopeeAffiliateService {
  private appId = process.env.SHOPEE_APP_ID!
  private secret = process.env.SHOPEE_APP_SECRET!
  private baseUrl = 'https://open-api.affiliate.shopee.com.br/graphql'

  private generateSignature(timestamp: number, payload: string) {
    const baseString = `${this.appId}${timestamp}${payload}${this.secret}`

    return crypto
      .createHash('sha256')
      .update(baseString)
      .digest('hex')
  }

  private buildHeaders(payload: string) {
    const timestamp = Math.floor(Date.now() / 1000)

    const signature = this.generateSignature(timestamp, payload)

    return {
      Authorization: `SHA256 Credential=${this.appId}, Timestamp=${timestamp}, Signature=${signature}`,
      'Content-Type': 'application/json',
    }
  }

  async generateShortLink(url: string) {
    const payloadObject = {
      query: `mutation {
        generateShortLink(
          input:{
            originUrl:"${url}"
          }
        ){
          shortLink
        }
      }`,
    }

    const payload = JSON.stringify(payloadObject)

    const headers = this.buildHeaders(payload)

    const response = await axios.post(
      this.baseUrl,
      payload,
      { headers },
    )

    return response.data?.data?.generateShortLink?.shortLink
  }

    private async callShopeeGraphQL(query: string) {
        const payload = JSON.stringify({ query })
        const timestamp = Math.floor(Date.now() / 1000)

        const baseString = `${this.appId}${timestamp}${payload}${this.secret}`

        const signature = crypto
            .createHash('sha256')
            .update(baseString)
            .digest('hex')

        const headers = {
            Authorization: `SHA256 Credential=${this.appId}, Timestamp=${timestamp}, Signature=${signature}`,
            'Content-Type': 'application/json',
        }

        const response = await axios.post(this.baseUrl, payload, { headers })

        return response.data
    }

    async getProductByItemId(itemId: string) {
        const query = `
            query{
            productOfferV2(itemId:${itemId}, limit:1){
                nodes{
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

        return data?.data?.productOfferV2?.nodes?.[0]
    }

    async searchProducts(keyword: string, page = 1, limit = 10) {
        const query = `
            query{
            productOfferV2(
                keyword:"${keyword}",
                sortType:2,
                page:${page},
                limit:${limit}
            ){
                nodes{
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
                pageInfo{
                page
                limit
                hasNextPage
                }
            }
            }
        `

        return this.callShopeeGraphQL(query)
    }
}