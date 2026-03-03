import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProductsModule } from './products/products.module';
import { CategoriesModule } from './categories/categories.module';
import { ShopsModule } from './shops/shops.module';
import { ShopeeModule } from './shopee/shopee.module';
import { RankingModule } from './ranking/ranking.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, AuthModule, UsersModule, ProductsModule, CategoriesModule, ShopsModule, ShopeeModule, RankingModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
