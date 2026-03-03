// src/products/dto/create-products-from-urls.dto.ts

import { IsArray, IsString, ArrayMinSize } from 'class-validator'

export class CreateProductsFromUrlsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  urls: string[]

  @IsString()
  categoryId: string
}