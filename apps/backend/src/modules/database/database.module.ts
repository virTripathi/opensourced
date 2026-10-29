import { Global, Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma.service';
import { DATABASE_STRATEGY, IDatabaseStrategy } from './database.strategy';
import { PrismaSqliteStrategy } from './strategies/prisma-sqlite.strategy';
import { MemoryDatabaseStrategy } from './strategies/memory.strategy';

const databaseStrategyProvider: Provider = {
  provide: DATABASE_STRATEGY,
  useFactory: (
    configService: ConfigService,
    prismaService: PrismaService
  ): IDatabaseStrategy => {
    const dbType = (
      configService.get<string>('database.type') ||
      process.env.DATABASE_TYPE ||
      'sqlite'
    ).toLowerCase();

    switch (dbType) {
      case 'memory':
        return new MemoryDatabaseStrategy();
      case 'sqlite':
      default:
        return new PrismaSqliteStrategy(prismaService, configService);
    }
  },
  inject: [ConfigService, PrismaService],
};

@Global()
@Module({
  providers: [
    PrismaService,
    databaseStrategyProvider,
    PrismaSqliteStrategy,
    MemoryDatabaseStrategy,
  ],
  exports: [
    DATABASE_STRATEGY,
    PrismaService,
    PrismaSqliteStrategy,
    MemoryDatabaseStrategy,
  ],
})
export class DatabaseModule {}
