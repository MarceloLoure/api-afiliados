// src/ranking/ranking.controller.ts

import {
  Controller,
  Get,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common'
import { RankingService } from './ranking.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'

@Controller('ranking')
export class RankingController {
  constructor(private rankingService: RankingService) {}

  @UseGuards(JwtAuthGuard)
  @Get('dashboard')
  getDashboard() {
    return this.rankingService.getDashboard()
  }

  @Get('top-products')
  getMostClicked(@Query('limit') limit = '10') {
    return this.rankingService.getMostClickedProducts(Number(limit))
  }

  @Get('category/:id')
  getMostClickedByCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit = '10',
  ) {
    return this.rankingService.getMostClickedByCategory(id, Number(limit))
  }

  @UseGuards(JwtAuthGuard)
  @Get('categories-report')
  getCategoryReport() {
    return this.rankingService.getCategoryReport()
  }

  @UseGuards(JwtAuthGuard)
  @Get('conversion-estimate')
  getConversionEstimate() {
    return this.rankingService.getConversionEstimate()
  }
}
