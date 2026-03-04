import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator'

export class UpdateHomeCategoriesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  categoryIds: string[]
}
