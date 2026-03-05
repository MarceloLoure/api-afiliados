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
