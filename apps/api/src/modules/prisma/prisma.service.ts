import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    // Attempt connection on startup; log warning if database is not yet up (e.g. local offline dev)
    try {
      await this.$connect();
    } catch (err: any) {
      console.warn('⚠️ Prisma connection warning on startup:', err?.message || err);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
