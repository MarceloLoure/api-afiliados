import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
   /**
   * Compatibilidade para código legado que usa `prisma.click`.
   * O delegate oficial gerado pelo Prisma para o model `ClickLog` é `clickLog`.
   */
  get click() {
    return this.clickLog
  }

  /**
   * Compatibilidade para código legado que usa `prisma.clicklogs`.
   * O delegate oficial gerado pelo Prisma para o model `ClickLog` é `clickLog`.
   */
  get clicklogs() {
    return this.clickLog
  }
  
  async onModuleInit() {
    await this.$connect()
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}