// src/ranking/ranking.module.ts

import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { RankingController } from './ranking.controller'
import { RankingService } from './ranking.service'
import { RankingCronService } from './ranking-cron.service'
import { ShopeeModule } from '../shopee/shopee.module'

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ShopeeModule,
  ],
  controllers: [RankingController],
  providers: [RankingService, RankingCronService],
  exports: [RankingCronService],
})
export class RankingModule {}
