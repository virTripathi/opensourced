import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { GeminiProviderStrategy } from './strategies/gemini.strategy';
import { GroundingValidatorService } from './grounding-validator.service';
import { SummaryCacheService } from './summary-cache.service';
import { McpModule } from '../mcp/mcp.module';
import { GuardrailsModule } from '../guardrails/guardrails.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [McpModule, GuardrailsModule, AuthModule],
  controllers: [AgentController],
  providers: [AgentService, GeminiProviderStrategy, GroundingValidatorService, SummaryCacheService],
  exports: [AgentService, GeminiProviderStrategy, GroundingValidatorService, SummaryCacheService],
})
export class AgentModule {}
