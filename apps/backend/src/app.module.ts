import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GitModule } from './modules/git/git.module';
import { AgentModule } from './modules/agent/agent.module';
import { McpModule } from './modules/mcp/mcp.module';
import { AuthModule } from './modules/auth/auth.module';
import { DriveModule } from './modules/drive/drive.module';
import { GuardrailsModule } from './modules/guardrails/guardrails.module';

import { LoggerModule } from './modules/logger/logger.module';

import { loadConfigs } from './config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      load: loadConfigs,
    }),
    LoggerModule,
    GitModule,
    AgentModule,
    McpModule,
    AuthModule,
    DriveModule,
    GuardrailsModule,
  ],
})
export class AppModule { }
