// src/shopee/shopee.service.ts

import { Injectable } from '@nestjs/common'

@Injectable()
export class ShopeeService {
  extractIds(url: string): { shopId: string; itemId: string } | null {
    const hostMatch = url.trim().match(/^https?:\/\/([^/]+)/i)
    if (hostMatch) {
      const host = hostMatch[1].toLowerCase()
      const isShopeeBr = host === 'shopee.com.br' || host.endsWith('.shopee.com.br')
      if (!isShopeeBr) return null
    }

    const legacyMatch = url.match(/-i\.(\d+)\.(\d+)/)
    if (legacyMatch) {
      return {
        shopId: legacyMatch[1],
        itemId: legacyMatch[2],
      }
    }

    const productPathMatch = url.match(/\/product\/(\d+)\/(\d+)(?:[/?#]|$)/)
    if (productPathMatch) {
      return {
        shopId: productPathMatch[1],
        itemId: productPathMatch[2],
      }
    }

    return null
  }
}
