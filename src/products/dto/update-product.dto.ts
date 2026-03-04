// src/products/dto/update-product.dto.ts

import { IsOptional, IsString, IsNumber } from 'class-validator'

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  imageUrl?: string

  @IsOptional()
  @IsNumber()
  price?: number

  @IsOptional()
  @IsString()
  shortLink?: string

  @IsOptional()
  @IsString()
  affiliatedUrl?: string
}
