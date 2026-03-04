// src/categories/categories.module.ts

import { Module } from '@nestjs/common'
import { CategoriesController } from './categories.controller'
import { CategoriesService } from './categories.service'
import { ShopeeModule } from '../shopee/shopee.module'

@Module({
  imports: [ShopeeModule],
  controllers: [CategoriesController],
  providers: [CategoriesService],
})
export class CategoriesModule {}
