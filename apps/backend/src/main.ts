import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import cookieParser from 'cookie-parser';
import * as express from 'express';
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

  // Enable CORS for Chrome Extension origin, Render, Vercel, and local frontend
  app.enableCors({
    origin: (origin, callback) => {
      if (
        !origin ||
        origin.startsWith('chrome-extension://') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1') ||
        origin.includes('onrender.com') ||
        origin.includes('vercel.app')
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
        'credential leak guardrails, and Google Drive artifact export. ' +
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

  // ============================================================================
  // Static Landing Page & Web App Serving & 404 Auto-Redirect
  // ============================================================================
  const candidateLandingFiles = [
    path.resolve(process.cwd(), 'index.html'),
    path.resolve(process.cwd(), '../../index.html'),
    path.resolve(__dirname, '../../../index.html'),
    path.resolve(__dirname, '../../index.html'),
  ];
  const landingFilePath = candidateLandingFiles.find((f) => fs.existsSync(f));
  const rootDir = landingFilePath ? path.dirname(landingFilePath) : process.cwd();
  const publicDir = path.join(rootDir, 'public');

  const candidateExtensionDirs = [
    path.resolve(process.cwd(), 'apps/extension/dist'),
    path.resolve(process.cwd(), '../extension/dist'),
    path.resolve(__dirname, '../../../apps/extension/dist'),
    path.resolve(__dirname, '../../extension/dist'),
  ];
  const extensionDir = candidateExtensionDirs.find((dir) => fs.existsSync(dir));

  const server = app.getHttpAdapter().getInstance();

  // Serve static public assets (favicons, icons, manifest files)
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
  }

  // 1. Dedicated 404 Route: displays notice and auto-redirects to home in 2 seconds
  server.get('/404', (_req: express.Request, res: express.Response) => {
    res.status(404).send(`<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>404 - Page Not Found | OpenSourced</title>
  <link rel="icon" type="image/png" sizes="32x32" href="/icons/icon-dark-32.png" />
  <link rel="shortcut icon" href="/favicon.ico" />
  <meta http-equiv="refresh" content="2;url=/" />
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #191919;
      color: #ebebeb;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
    }
    .card {
      background: #202020;
      border: 1px solid #2e2e2e;
      border-radius: 12px;
      padding: 36px 32px;
      max-width: 440px;
      text-align: center;
      box-shadow: 0 4px 16px rgba(0,0,0,0.35);
    }
    .badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: rgba(220, 38, 38, 0.15);
      color: #f87171;
      border: 1px solid rgba(220, 38, 38, 0.3);
      padding: 3px 8px;
      border-radius: 9999px;
      margin-bottom: 12px;
    }
    h1 { font-size: 20px; font-weight: 700; margin: 0 0 8px 0; color: #ebebeb; }
    p { font-size: 13px; color: #9b9a97; line-height: 1.5; margin: 0 0 20px 0; }
    .timer { font-weight: 700; color: #10b981; }
    .actions { display: flex; gap: 8px; justify-content: center; }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #059669;
      color: #ffffff;
      text-decoration: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      transition: background 0.15s ease;
    }
    .btn:hover { background: #047857; }
    .btn-secondary {
      background: #252525;
      color: #ebebeb;
      border: 1px solid #2e2e2e;
    }
    .btn-secondary:hover { background: #2e2e2e; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Error 404</div>
    <h1>Page Not Found</h1>
    <p>The requested route does not exist. Redirecting to home in <span id="countdown" class="timer">2</span> seconds...</p>
    <div class="actions">
      <a href="/" class="btn">Return Home Now</a>
      <a href="/api/docs" class="btn btn-secondary">Swagger Docs</a>
    </div>
  </div>
  <script>
    let count = 2;
    const timerEl = document.getElementById('countdown');
    const interval = setInterval(() => {
      count--;
      if (timerEl) timerEl.textContent = count;
      if (count <= 0) {
        clearInterval(interval);
        window.location.href = '/';
      }
    }, 1000);
  </script>
</body>
</html>`);
  });

  // 2. Root URL serves the OpenSourced Landing Page index.html
  if (landingFilePath) {
    server.get('/', (req: express.Request, res: express.Response) => {
      // OAuth Provider Fallback: In case provider was configured with root callback URL, seamlessly forward to auth callback
      if (req.query?.code) {
        const queryIndex = req.url.indexOf('?');
        const qs = queryIndex !== -1 ? req.url.slice(queryIndex) : '';
        const isGoogle =
          req.query.scope?.toString().includes('google') ||
          req.query.state?.toString().includes('google');
        const target = isGoogle ? '/api/auth/google/callback' : '/api/auth/github/callback';
        return res.redirect(`${target}${qs}`);
      }
      res.sendFile(landingFilePath);
    });
    server.get('/index.html', (req: express.Request, res: express.Response) => {
      if (req.query?.code) {
        const queryIndex = req.url.indexOf('?');
        const qs = queryIndex !== -1 ? req.url.slice(queryIndex) : '';
        const isGoogle =
          req.query.scope?.toString().includes('google') ||
          req.query.state?.toString().includes('google');
        const target = isGoogle ? '/api/auth/google/callback' : '/api/auth/github/callback';
        return res.redirect(`${target}${qs}`);
      }
      res.sendFile(landingFilePath);
    });
  }

  // 3. Serve Extension App at /extension (and its static assets)
  if (extensionDir) {
    app.use('/extension', express.static(extensionDir));
    server.get('/extension', (_req: express.Request, res: express.Response) => {
      res.sendFile(path.join(extensionDir, 'index.html'));
    });
  }

  // 4. Any other non-API and non-extension path redirects to /404 (which redirects to / after 2s)
  server.get('*', (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/extension') ||
      req.path.startsWith('/icons') ||
      req.path.endsWith('.png') ||
      req.path.endsWith('.ico') ||
      req.path.endsWith('.svg')
    ) {
      return next();
    }
    res.redirect('/404');
  });

  await app.listen(port);
  console.log(`🚀 OpenSourced NestJS Backend running on http://localhost:${port}`);
  console.log(`📖 Swagger Interactive UI:         http://localhost:${port}/api/docs`);
  console.log(`📥 Postman Exportable JSON Spec:   http://localhost:${port}/api/docs-json`);
  console.log(`📥 Postman Exportable YAML Spec:   http://localhost:${port}/api/docs-yaml`);
}

bootstrap();
