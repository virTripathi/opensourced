import { Module } from '@nestjs/common';
import { DriveController } from './drive.controller';
import { DriveService } from './drive.service';
import { GuardrailsModule } from '../guardrails/guardrails.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [GuardrailsModule, AuthModule],
  controllers: [DriveController],
  providers: [DriveService],
  exports: [DriveService],
})
export class DriveModule {}
