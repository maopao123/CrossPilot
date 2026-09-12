import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { IntelligenceController } from './intelligence.controller.js';
import { IntelligenceService } from './intelligence.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [IntelligenceController],
  providers: [IntelligenceService],
  exports: [IntelligenceService],
})
export class IntelligenceModule {}
