import { Controller, Get, Req, Res, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { runtimeMetrics } from '@crosspilot/shared';
import { Public } from '../../common/decorators/public.decorator.js';

@Controller('internal')
export class InternalMetricsController {
  @Public()
  @Get('metrics')
  async getMetrics(@Req() req: Request, @Res() res: Response): Promise<void> {
    const isEnabled = process.env.METRICS_ENABLED === 'true';
    if (!isEnabled) {
      res.status(HttpStatus.NOT_FOUND).send('Not Found\n');
      return;
    }

    const bearerToken = process.env.METRICS_BEARER_TOKEN;
    if (bearerToken) {
      const authHeader = req.headers.authorization;
      if (!authHeader || authHeader !== `Bearer ${bearerToken}`) {
        res.status(HttpStatus.UNAUTHORIZED).send('Unauthorized\n');
        return;
      }
    }

    try {
      const metrics = await runtimeMetrics.getMetricsAsText();
      res
        .status(HttpStatus.OK)
        .setHeader('Content-Type', runtimeMetrics.contentType)
        .send(metrics);
    } catch {
      res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .send('Failed to collect metrics\n');
    }
  }
}
