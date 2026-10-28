import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { GeminiProviderStrategy } from './strategies/gemini.strategy';
import { McpModule } from '../mcp/mcp.module';
import { GuardrailsModule } from '../guardrails/guardrails.module';

@Module({
  imports: [McpModule, GuardrailsModule],
  controllers: [AgentController],
  providers: [AgentService, GeminiProviderStrategy],
  exports: [AgentService, GeminiProviderStrategy],
})
export class AgentModule {}
