// src/categories/dto/add-products.dto.ts
import { IsArray, IsString, ArrayMinSize } from 'class-validator'

export class AddProductsToCategoryDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  urls: string[]
}