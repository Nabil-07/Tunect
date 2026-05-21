import * as dotenv from 'dotenv';
dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || process.env.ENV_FILE || '.env' });

import { webcrypto } from 'node:crypto';
if (!(globalThis as any).crypto) {
  (globalThis as any).crypto = webcrypto;
}

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import { ValidationPipe } from '@nestjs/common';
import * as bodyParser from 'body-parser';
import { PrismaService } from './prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/node';
import type { Integration } from '@sentry/core';
import cookieParser from 'cookie-parser';
import { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';
import { PreprodInternalGuard } from './auth/preprod-internal.guard';
import { buildCspDirectives } from './common/csp.config';

/* =========================
   ALLOWED ORIGINS
========================= */
const allowedOrigins = [
  'https://tunectnow.com',
  'https://www.tunectnow.com',
  'https://tn-internal-7f3a.preprod.tunectnow.com',
  'http://tn-internal-7f3a.preprod.tunectnow.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  // Also include any extra origins from CORS_ORIGIN env var
  ...(process.env.CORS_ORIGIN?.split(',').map(s => s.trim()).filter(Boolean) ?? []),
];

function isAllowedOrigin(origin: string) {
  if (allowedOrigins.includes(origin)) return true;
  return origin.endsWith('.preprod.tunectnow.com') || origin.endsWith('.tunectnow.com');
}

/* =========================
   SOCKET.IO CORS ADAPTER
========================= */
class CorsSocketIoAdapter extends IoAdapter {
  constructor(private readonly appRef: any) {
    super(appRef);
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const cors = {
      origin: (origin: string | undefined, callback: Function) => {
        if (!origin || isAllowedOrigin(origin)) {
          return callback(null, true);
        }
        callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    };

    return super.createIOServer(port, {
      ...(options || {}),
      cors,
      allowEIO3: true,
    });
  }
}

/** Sentry CPU profiling uses native binaries per Node ABI; skip if unavailable (e.g. Node 26). */
function sentryIntegrations(): Integration[] {
  if (process.env.SENTRY_PROFILING === 'false') return [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { nodeProfilingIntegration } = require('@sentry/profiling-node') as {
      nodeProfilingIntegration: () => Integration;
    };
    return [nodeProfilingIntegration()];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Sentry] CPU profiling disabled: ${msg}`);
    return [];
  }
}

/* =========================
   BOOTSTRAP
========================= */
async function bootstrap() {
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: 0.2,
      integrations: sentryIntegrations(),
    });

    process.on('unhandledRejection', (r) => Sentry.captureException(r));
    process.on('uncaughtException', (e) => Sentry.captureException(e));
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  const cfg = app.get(ConfigService);

  /* =========================
     SOCKET.IO
  ========================= */
  app.useWebSocketAdapter(new CorsSocketIoAdapter(app));

  /* =========================
     COMPRESSION
  ========================= */
  app.use(
    compression({
      threshold: 1024,
      level: 6,
    }),
  );

  /* =========================
     ✅ SINGLE SOURCE CORS
  ========================= */
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || isAllowedOrigin(origin)) {
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Accept',
      'Origin',
      'X-Requested-With',
      'X-Timezone',
      'Cache-Control',
      'Pragma',
    ],
    optionsSuccessStatus: 204,
  });

  /* =========================
     SECURITY HEADERS
  ========================= */
  const isProd = process.env.NODE_ENV === 'production';
  const cspDirectives = buildCspDirectives({ config: cfg, isProd });

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        useDefaults: true,
        directives: cspDirectives,
      },
    }),
  );

  /* =========================
     PARSERS
  ========================= */
  app.use(cookieParser(process.env.COOKIE_SECRET || 'dev-cookie'));

  app.use('/payments/razorpay/webhook', bodyParser.raw({ type: 'application/json' }));
  app.use(bodyParser.json({ limit: '1mb' }));
  app.use(bodyParser.urlencoded({ extended: true }));

  /* =========================
     VALIDATION
  ========================= */
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  /* =========================
     PREPROD GUARD
  ========================= */
  if ((cfg.get<string>('APP_ENV') || '').toLowerCase() === 'preprod') {
    app.useGlobalGuards(app.get(PreprodInternalGuard));
  }

  /* =========================
     SWAGGER
  ========================= */
  if (!isProd) {
    const { SwaggerModule, DocumentBuilder } = await import('@nestjs/swagger');
    const config = new DocumentBuilder()
      .setTitle('Tunect API')
      .setDescription('REST API for Tunect')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const doc = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, doc);
  }

  const prisma = app.get(PrismaService);
  await prisma.enableShutdownHooks(app);

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Server running on http://localhost:${port}`);
  console.log(`💓 Health: /health`);
  if (!isProd) console.log(`📘 Swagger: /docs`);
}

bootstrap();