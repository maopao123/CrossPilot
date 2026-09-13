import { Controller, Get, Param, Res, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { getObjectStorageService } from '@crosspilot/integrations';
import { Public } from '../../common/decorators/public.decorator.js';

@Controller('storage')
export class StorageController {
  @Public()
  @Get(':key(*)')
  async getObject(@Param('key') key: string, @Res() res: Response) {
    const storage = getObjectStorageService();
    try {
      const { stream, contentType, contentLength } = await storage.getObjectStream(key);
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      }
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      stream.pipe(res);
    } catch (err: any) {
      throw new NotFoundException(`Object '${key}' was not found in storage`);
    }
  }
}
