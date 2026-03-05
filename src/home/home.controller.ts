import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common'
import { HomeService } from './home.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { UpdateHomeCategoriesDto } from './dto/update-home-categories.dto'

@Controller('home')
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  @Get()
  getHome() {
    return this.homeService.getHome()
  }

  @Get('menu')
  getMenu() {
    return this.homeService.getMenu()
  }

  @UseGuards(JwtAuthGuard)
  @Patch('categories')
  updateCategories(@Body() dto: UpdateHomeCategoriesDto) {
    return this.homeService.updateCategoryOrder(dto.categoryIds)
  }

  @UseGuards(JwtAuthGuard)
  @Post('refresh')
  refreshNow() {
    return this.homeService.refreshDailyCache(true)
  }
}
