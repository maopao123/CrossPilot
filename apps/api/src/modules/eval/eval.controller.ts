import { Controller, Get, Post } from '@nestjs/common';
import { EvalService } from './eval.service.js';

@Controller('api/v1/eval')
export class EvalController {
  constructor(private readonly evalService: EvalService) {}

  @Get('benchmarks')
  getBenchmarkSuites() {
    return this.evalService.getBenchmarkSuites();
  }

  @Post('run')
  runBenchmarks() {
    return this.evalService.runBenchmarks();
  }
}
