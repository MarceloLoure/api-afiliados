import { Controller, Get, Query } from '@nestjs/common'
import { HomeService } from './home.service'

@Controller('home')
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  @Get()
  getHome(
    @Query('categoryIds') categoryIds?: string,
    @Query('limit') limit = '20',
  ) {
    const parsedCategoryIds = categoryIds
      ?.split(',')
      .map((id) => id.trim())
      .filter(Boolean)

    return this.homeService.getHome(parsedCategoryIds, Number(limit))
  }

  @Get('menu')
  getMenu(@Query('categoryIds') categoryIds?: string) {
    const parsedCategoryIds = categoryIds
      ?.split(',')
      .map((id) => id.trim())
      .filter(Boolean)

    return this.homeService.getMenu(parsedCategoryIds)
  }
}
