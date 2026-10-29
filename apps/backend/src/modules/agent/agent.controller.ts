import { Controller, Post, Body, MessageEvent, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AgentService } from './agent.service';
import { GitHubContext } from '@opensourced/common';
import {
  SummariseRepoDto,
  SummariseFeatureDto,
  RepoSummaryResponseDto,
  FeatureSummaryResponseDto,
} from './dto/summary.dto';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../auth/user.repository';

@ApiTags('Repository & Feature Intelligence')
@ApiBearerAuth('JWT-auth')
@UseGuards(OptionalJwtAuthGuard)
@Controller('api/agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  /**
   * Universal action streaming endpoint
   */
  @Post('stream')
  @ApiOperation({
    summary: 'Execute Agentic Action Loop',
    description: 'Universal execution endpoint that runs multi-turn tool calling and streams events (SSE)',
  })
  streamAction(
    @Body('action') action: string,
    @Body('context') context: GitHubContext,
    @CurrentUser() user?: User
  ): Observable<MessageEvent> {
    return this.agentService.dispatchAction(action, context, user).pipe(
      map((event) => ({
        data: event,
      }))
    );
  }

  /**
   * Dedicated endpoint: Summarise an entire repository
   */
  @Post('summarise')
  @ApiOperation({
    summary: 'Summarise Entire Repository',
    description:
      'Performs universal multi-language architecture analysis, identifies entrypoints, detects credential leaks in tree, produces Mermaid diagrams, and outputs deterministic local setup guides.',
  })
  @ApiBody({ type: SummariseRepoDto })
  @ApiResponse({
    status: 200,
    description: 'Structured repository intelligence summary',
    type: RepoSummaryResponseDto,
  })
  summariseRepo(@Body() body: SummariseRepoDto): Observable<MessageEvent> {
    return this.agentService
      .summariseRepo(body.owner, body.repo, body.branch, body.focusAreas)
      .pipe(
        map((event) => ({
          data: event,
        }))
      );
  }

  /**
   * Dedicated endpoint: Summarise a specific feature within a repository
   */
  @Post('summarise-feature')
  @ApiOperation({
    summary: 'Summarise Specific Feature in Repository',
    description:
      'Pinpoints exact entrypoints, line ranges, symbol definitions, sequence dataflow diagrams, and local test verification for a specific feature. (Omits general purpose and audience).',
  })
  @ApiBody({ type: SummariseFeatureDto })
  @ApiResponse({
    status: 200,
    description: 'Structured feature implementation summary',
    type: FeatureSummaryResponseDto,
  })
  summariseFeature(@Body() body: SummariseFeatureDto): Observable<MessageEvent> {
    return this.agentService
      .summariseFeature(body.owner, body.repo, body.featureQuery, body.branch, body.hintPaths)
      .pipe(
        map((event) => ({
          data: event,
        }))
      );
  }
}
