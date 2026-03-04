// src/products/products.controller.ts

import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common'
import { ProductsService } from './products.service'
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard'
import { CreateProductsFromUrlsDto } from './dto/create-product.dto'
import { ShopeeAffiliateService } from 'src/shopee/shopee-affiliate.service'

@UseGuards(JwtAuthGuard)
@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private shopeeAffiliateService: ShopeeAffiliateService,
  ) {}

  // Diagnóstico: testa credenciais Shopee
  @Get('shopee/test-credentials')
  testCredentials() {
    return this.shopeeAffiliateService.testCredentials()
  }

  // Diagnóstico: busca produto por itemId
  @Get('shopee/item/:itemId')
  testShopeeItem(@Param('itemId') itemId: string) {
    return this.shopeeAffiliateService.getProductByItemId(itemId)
  }

  // Diagnóstico: pesquisa por keyword
  @Get('shopee/search')
  searchShopee(@Query('q') keyword: string) {
    return this.shopeeAffiliateService.searchProducts(keyword)
  }

  // Diagnóstico: gera shortlink
  @Post('shopee/short-link')
  generateShortLink(@Body('url') url: string) {
    return this.shopeeAffiliateService.generateShortLink(url)
  }

  // Fluxo completo: URLs → Shopee API → banco
  @Post('from-urls')
  createFromUrls(@Body() dto: CreateProductsFromUrlsDto) {
    return this.productsService.createFromUrls(dto.urls, dto.categoryId)
  }

  @Get()
  findAll(
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string,
  ) {
    return this.productsService.findAll({ categoryId, search })
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.findOne(id)
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.remove(id)
  }
}
