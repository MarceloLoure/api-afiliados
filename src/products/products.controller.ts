// src/products/products.controller.ts

import {
  Controller,
  Get,
  Post,
  Put,
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
import { ShopeeService } from 'src/shopee/shopee.service'
import { ShopeeAffiliateService } from 'src/shopee/shopee-affiliate.service'



@UseGuards(JwtAuthGuard)
@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private shopeeService: ShopeeService,
    private shopeeAffiliateService: ShopeeAffiliateService,

) {}

  // =========================
  // CREATE MANUAL
  // =========================
//   @Post()
//   create(@Body() dto: CreateProductDto) {
//     return this.productsService.create(dto)
//   }

  // =========================
  // CREATE FROM SHOPEE URLS
  // =========================
  @Post('from-urls')
  createFromUrls(@Body() dto: CreateProductsFromUrlsDto) {
    return this.productsService.createFromUrls(
      dto.urls,
      dto.categoryId,
    )
  }

@Get('test-shopee/:itemId')
  async testShopee(@Param('itemId') itemId: string) {
    return this.shopeeAffiliateService.getProductByItemId(itemId)
  }

  // =========================
  // GET ALL (com filtros opcionais)
  // =========================
//   @Get()
//   findAll(
//     @Query('categoryId') categoryId?: string,
//     @Query('search') search?: string,
//   ) {
//     return this.productsService.findAll({
//       categoryId,
//       search,
//     })
//   }

  // =========================
  // GET BY UUID
  // =========================
//   @Get(':id')
//   findOne(@Param('id', ParseUUIDPipe) id: string) {
//     return this.productsService.findOne(id)
//   }

  // =========================
  // UPDATE
  // =========================
//   @Put(':id')
//   update(
//     @Param('id', ParseUUIDPipe) id: string,
//     @Body() dto: UpdateProductDto,
//   ) {
//     return this.productsService.update(id, dto)
//   }

  // =========================
  // DELETE
  // =========================
//   @Delete(':id')
//   remove(@Param('id', ParseUUIDPipe) id: string) {
//     return this.productsService.remove(id)
//   }
}