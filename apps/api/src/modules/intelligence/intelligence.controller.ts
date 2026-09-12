import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  CreateEvidenceInput,
  CreateFactInput,
  CreateRecommendationInput,
  VocIntelligenceInput,
} from '@crosspilot/shared';
import { CurrentWorkspace } from '../../common/decorators/current-workspace.decorator.js';
import { IntelligenceService } from './intelligence.service.js';

@Controller()
export class IntelligenceController {
  constructor(private readonly intel: IntelligenceService) {}

  @Post('facts')
  createFact(@CurrentWorkspace() workspaceId: string, @Body() body: CreateFactInput) {
    return this.intel.createFact(workspaceId, body);
  }

  @Get('facts')
  listFacts(
    @CurrentWorkspace() workspaceId: string,
    @Query('playbookRunId') playbookRunId?: string,
  ) {
    return this.intel.listFacts(workspaceId, playbookRunId);
  }

  @Get('facts/:id')
  getFact(@CurrentWorkspace() workspaceId: string, @Param('id') id: string) {
    return this.intel.getFact(workspaceId, id);
  }

  @Post('evidence')
  createEvidence(@CurrentWorkspace() workspaceId: string, @Body() body: CreateEvidenceInput) {
    return this.intel.createEvidence(workspaceId, body);
  }

  @Get('evidence')
  listEvidence(
    @CurrentWorkspace() workspaceId: string,
    @Query('factId') factId?: string,
    @Query('playbookRunId') playbookRunId?: string,
  ) {
    return this.intel.listEvidence(workspaceId, factId, playbookRunId);
  }

  @Post('recommendations')
  createRecommendation(
    @CurrentWorkspace() workspaceId: string,
    @Body() body: CreateRecommendationInput,
  ) {
    return this.intel.createRecommendation(workspaceId, body);
  }

  @Get('recommendations')
  listRecommendations(@CurrentWorkspace() workspaceId: string) {
    return this.intel.listRecommendations(workspaceId);
  }

  @Get('recommendations/:id')
  getRecommendation(@CurrentWorkspace() workspaceId: string, @Param('id') id: string) {
    return this.intel.getRecommendation(workspaceId, id);
  }

  @Post('recommendations/:id/approve')
  approve(@CurrentWorkspace() workspaceId: string, @Param('id') id: string) {
    return this.intel.transition(workspaceId, id, 'APPROVED');
  }

  @Post('recommendations/:id/reject')
  reject(@CurrentWorkspace() workspaceId: string, @Param('id') id: string) {
    return this.intel.transition(workspaceId, id, 'REJECTED');
  }

  @Post('recommendations/:id/execute')
  execute(@CurrentWorkspace() workspaceId: string, @Param('id') id: string) {
    return this.intel.transition(workspaceId, id, 'EXECUTED');
  }

  @Post('recommendations/:id/verify')
  verify(@CurrentWorkspace() workspaceId: string, @Param('id') id: string) {
    return this.intel.transition(workspaceId, id, 'VERIFIED');
  }

  @Post('voc/analyze')
  analyzeVoc(@CurrentWorkspace() workspaceId: string, @Body() body: VocIntelligenceInput) {
    return this.intel.analyzeVoc(workspaceId, body || {});
  }

  /** Latest stored VOC snapshot. Analyze remains POST /voc/analyze. */
  @Get('voc')
  latestVoc(@CurrentWorkspace() workspaceId: string) {
    return this.intel.latestVoc(workspaceId);
  }
}
