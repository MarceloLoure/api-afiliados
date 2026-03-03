import { Module } from '@nestjs/common'
import { ProductsController } from './products.controller'
import { ProductsService } from './products.service'
import { PrismaService } from '../prisma/prisma.service'
import { ShopeeModule } from 'src/shopee/shopee.module'

@Module({
    imports: [ShopeeModule],
  controllers: [ProductsController],
  providers: [
    ProductsService,
    PrismaService,
  ],
})
export class ProductsModule {}