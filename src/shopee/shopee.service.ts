// src/shopee/shopee.service.ts

import { Injectable } from '@nestjs/common'

@Injectable()
export class ShopeeService {
  extractIds(url: string): { shopId: string; itemId: string } | null {
    const match = url.match(/-i\.(\d+)\.(\d+)/)

    if (!match) return null

    return {
      shopId: match[1],
      itemId: match[2],
    }
  }
}