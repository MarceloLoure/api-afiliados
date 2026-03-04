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
