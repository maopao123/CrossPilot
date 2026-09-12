import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PlaybookController } from './playbook.controller.js';
import { PlaybookService } from './playbook.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [PlaybookController],
  providers: [PlaybookService],
  exports: [PlaybookService],
})
export class PlaybookModule {}
