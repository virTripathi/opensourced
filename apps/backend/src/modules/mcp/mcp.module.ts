import { Module } from '@nestjs/common';
import { McpRegistryService } from './mcp-registry.service';
import { EcosystemDetectorService } from './ecosystem-detector.service';
import { GuardrailsModule } from '../guardrails/guardrails.module';

@Module({
  imports: [GuardrailsModule],
  providers: [McpRegistryService, EcosystemDetectorService],
  exports: [McpRegistryService, EcosystemDetectorService],
})
export class McpModule {}
