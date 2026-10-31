import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly dbUrl: string;

  constructor(configService: ConfigService) {
    const dbUrl =
      configService?.get<string>('database.url') ||
      process.env.DATABASE_URL ||
      'file:./data/opensourced.db';

    super({
      datasources: {
        db: {
          url: dbUrl,
        },
      },
      log:
        process.env.NODE_ENV === 'development'
          ? ['warn', 'error']
          : ['error'],
    });

    this.dbUrl = dbUrl;
    this.ensureDatabaseDirectory();
  }

  private ensureDatabaseDirectory() {
    try {
      if (this.dbUrl.startsWith('file:')) {
        const filePath = this.dbUrl.replace(/^file:/, '');
        const resolvedPath = path.isAbsolute(filePath)
          ? filePath
          : path.resolve(process.cwd(), filePath);
        const dir = path.dirname(resolvedPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
          this.logger.log(`Created SQLite database directory: ${dir}`);
        }
      }
    } catch (err: any) {
      this.logger.warn(`Could not ensure database directory: ${err.message}`);
    }
  }

  async onModuleInit() {
    try {
      this.ensureDatabaseDirectory();
      await this.$connect();
      this.logger.log('Prisma ORM connected successfully to SQLite database');
    } catch (err: any) {
      this.logger.error(`Prisma connection error: ${err.message}`);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Prisma disconnected from database');
  }
}
