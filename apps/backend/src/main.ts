import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import cookieParser from 'cookie-parser';
import { ConfigService } from '@nestjs/config';

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port);
  });
}

async function findAvailablePort(preferredPort: number, maxAttempts = 30): Promise<number> {
  for (let port = preferredPort; port < preferredPort + maxAttempts; port++) {
    const available = await isPortAvailable(port);
    if (available) return port;
  }
  return preferredPort;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Parse HTTP-only cookies for session authentication
  app.use(cookieParser());

  // Enable CORS for Chrome Extension origin and local frontend
  app.enableCors({
    origin: (origin, callback) => {
      if (
        !origin ||
        origin.startsWith('chrome-extension://') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1')
      ) {
        callback(null, true);
      } else {
        callback(new Error(`Origin '${origin}' not allowed by CORS security policy`));
      }
    },
    credentials: true,
  });

  const configService = app.get(ConfigService);
  const preferredPort =
    configService.get<number>('app.port') ||
    parseInt(process.env.PORT || '8000', 10);
  const port = await findAvailablePort(preferredPort);

  // ============================================================================
  // Swagger / OpenAPI Specification Configuration (Postman Exportable)
  // ============================================================================
  const config = new DocumentBuilder()
    .setTitle('OpenSourced API - Open-Source Onboarding Assistant')
    .setDescription(
      'Complete OpenAPI specification for OpenSourced backend intelligence engine. ' +
        'Includes repository & feature summarisation, universal multi-language architecture analysis, ' +
        'credential leak guardrails, Git workspace bridging, and Google Drive artifact export. ' +
        'Import directly into Postman via http://localhost:' +
        port +
        '/api/docs-json or using the exported openapi-spec.json.'
    )
    .setVersion('1.2.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Provide JWT token generated via /api/auth/dev-login, /api/auth/guest, or OAuth',
      },
      'JWT-auth'
    )
    .addCookieAuth('auth_token', {
      type: 'apiKey',
      in: 'cookie',
      name: 'auth_token',
      description: 'HTTP-only session cookie set automatically on authentication',
    })
    .addTag(
      'Repository & Feature Intelligence',
      'High-velocity repository architecture summarisation, entrypoint discovery, and feature tracing'
    )
    .addTag('Local Git & Workspace Engine', 'Native desktop directory picker bridge and streaming git clone')
    .addTag('Google Drive Export', 'Exports session research artifacts directly into Google Drive (drive.file scope)')
    .addTag('Authentication & Session', 'GitHub and Google OAuth2 user session and token verification')
    .addTag(
      'User Reports & Research History',
      'Persistent user research reports and analysis history with strict multi-tenant IDOR protections'
    )
    .addServer(`http://localhost:${port}`, 'Active Local Server')
    .addServer('http://localhost:8000', 'Default Port (8000)')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // Serve Swagger UI and exportable JSON & YAML schemas
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
    yamlDocumentUrl: 'api/docs-yaml',
    customSiteTitle: 'OpenSourced API Docs (Postman Ready)',
  });

  // Save exportable openapi-spec.json to disk for direct offline Postman import
  try {
    const specPath = path.resolve(process.cwd(), 'openapi-spec.json');
    fs.writeFileSync(specPath, JSON.stringify(document, null, 2), 'utf-8');
  } catch (err: any) {
    console.warn(`Could not write openapi-spec.json to disk: ${err.message}`);
  }

  await app.listen(port);
  console.log(`🚀 OpenSourced NestJS Backend running on http://localhost:${port}`);
  console.log(`📖 Swagger Interactive UI:         http://localhost:${port}/api/docs`);
  console.log(`📥 Postman Exportable JSON Spec:   http://localhost:${port}/api/docs-json`);
  console.log(`📥 Postman Exportable YAML Spec:   http://localhost:${port}/api/docs-yaml`);
}

bootstrap();
