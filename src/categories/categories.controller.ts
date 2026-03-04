// src/categories/categories.controller.ts

import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
} from '@nestjs/common'
import { CategoriesService } from './categories.service'
import { CreateCategoryDto } from './dto/create-category.dto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { UpdateCategoryDto } from './dto/update-category.dto'
import { AddProductsToCategoryDto } from './dto/add-products.dto'

@Controller('categories')
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) {}

  @Get()
  async findAll() {
    return this.categoriesService.findAll()
  }

  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.findById(id)
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto.name)
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(id, dto.name)
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.remove(id)
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/products')
  async addProducts(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddProductsToCategoryDto,
  ) {
    return this.categoriesService.addProducts(id, dto.urls)
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/products/:productId')
  async removeProduct(
    @Param('id', ParseUUIDPipe) categoryId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.categoriesService.removeProduct(categoryId, productId)
  }
}
