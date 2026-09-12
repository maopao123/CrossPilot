/**
 * Daily Diagnosis NestJS Module (Epic 3 Phase 7)
 */

import { Module } from '@nestjs/common';
import { DailyDiagnosisController } from './daily-diagnosis.controller.js';
import { DailyDiagnosisService } from './daily-diagnosis.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [DailyDiagnosisController],
  providers: [DailyDiagnosisService],
  exports: [DailyDiagnosisService],
})
export class DailyDiagnosisModule {}
