import { Module } from '@nestjs/common'
import { ShopeeService } from './shopee.service'
import { ShopeeAffiliateService } from './shopee-affiliate.service'

@Module({
  providers: [ShopeeService, ShopeeAffiliateService],
  exports: [ShopeeService, ShopeeAffiliateService], // 👈 importante
})
export class ShopeeModule {}