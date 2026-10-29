import { Global, Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { RequestContextService } from './request-context.service';
import { AppJsonLoggerService } from './app-json-logger.service';
import { ThirdPartyHttpService } from './third-party-http.service';
import { HttpLoggingInterceptor } from './http-logging.interceptor';
import { TracingMiddleware } from './tracing.middleware';

@Global()
@Module({
  providers: [
    RequestContextService,
    AppJsonLoggerService,
    ThirdPartyHttpService,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpLoggingInterceptor,
    },
  ],
  exports: [RequestContextService, AppJsonLoggerService, ThirdPartyHttpService],
})
export class LoggerModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TracingMiddleware).forRoutes('*');
  }
}
