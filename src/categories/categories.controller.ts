import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Patch,
  Param,
} from '@nestjs/common'
import { CategoriesService } from './categories.service'
import { CreateCategoryDto } from './dto/create-category.dto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { UpdateCategoryDto } from './dto/update-category.dto'
import { AddProductsToCategoryDto } from './dto/add-products.dto'

@Controller('categories')
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto.name)
  }

  @Get()
  async findAll() {
    return this.categoriesService.findAll()
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {

    if (!dto.name) {
      throw new Error('Name is required')
    }
    
    return this.categoriesService.update(id, dto.name)
  }

  @Post(':id/products')
  async addProducts(
    @Param('id') id: string,
    @Body() dto: AddProductsToCategoryDto,
  ) {
    return this.categoriesService.addProducts(id, dto.urls)
  }
}