import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for Chrome Extension origin and local frontend
  app.enableCors({
    origin: (origin, callback) => {
      // Allow Chrome extension origins (chrome-extension://*) and localhost
      if (!origin || origin.startsWith('chrome-extension://') || origin.includes('localhost')) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    credentials: true,
  });

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`🚀 Worksmarter NestJS Backend Orchestrator running on http://localhost:${port}`);
}

bootstrap();
