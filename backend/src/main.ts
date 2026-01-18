
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.preprod' });

import { webcrypto } from 'crypto';

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
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import cookieParser from 'cookie-parser';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import compression from 'compression';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';
import { PreprodInternalGuard } from './auth/preprod-internal.guard';

class CorsSocketIoAdapter extends IoAdapter {
  constructor(private readonly appRef: any, private readonly origins: string[]) {
    super(appRef);
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const cors = {
      origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        if (!origin || isAllowedOrigin(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    };
    const { path, ...rest } = options || {};
    const opts: Partial<ServerOptions> = {
      ...rest,
      ...(path ? { path } : {}),
      cors,
      allowEIO3: true,
    };
    return super.createIOServer(port, opts);
  }
}

const allowedOrigins = [
  'https://tn-internal-7f3a.preprod.tunectnow.com',
  'http://tn-internal-7f3a.preprod.tunectnow.com',
  'https://tunectnow.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

function isAllowedOrigin(origin: string) {
  if (allowedOrigins.includes(origin)) return true;
  return origin.includes('.preprod.tunectnow.com');
}

async function bootstrap() {
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: 0.2,
      integrations: [nodeProfilingIntegration()],
    });
    process.on('unhandledRejection', (reason) => Sentry.captureException(reason));
    process.on('uncaughtException', (err) => Sentry.captureException(err));
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  const cfg = app.get(ConfigService);

  // Global Socket.IO adapter with explicit CORS to match frontend origins
  app.useWebSocketAdapter(new CorsSocketIoAdapter(app, allowedOrigins));

  // ⚡ GZIP Compression - reduces response size by 70-90%
  app.use(compression({
    threshold: 1024, // Only compress responses > 1KB
    level: 6, // Balanced compression (1=fast, 9=best compression)
  }));

  // Enable CORS FIRST before other middleware to ensure preflight requests are handled
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) {
        return callback(null, true);
      }
      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // For preprod, allow any *.preprod.tunectnow.com subdomain
      if (origin.includes('.preprod.tunectnow.com')) {
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Timezone'],
    credentials: true,
    optionsSuccessStatus: 204,
    preflightContinue: false,
  });

  // Serve static files for uploads
  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads',
  });

  app.use(helmet({ 
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false // Disable CSP to allow video playback
  }));

  // Parse the short-lived "remember_oauth" cookie during Google OAuth callback
  app.use(cookieParser(process.env.COOKIE_SECRET || 'dev-cookie'));

  // Keep raw body ONLY for Razorpay webhook
  app.use('/payments/razorpay/webhook', bodyParser.raw({ type: 'application/json' }));
  app.use(bodyParser.json({ limit: '1mb' }));
  app.use(bodyParser.urlencoded({ extended: true }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  if ((cfg.get<string>('APP_ENV') || '').toLowerCase() === 'preprod') {
    app.useGlobalGuards(app.get(PreprodInternalGuard));
  }

  const isProd = process.env.NODE_ENV === 'production';
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

  const port = Number(process.env.PORT) || 80;
  await app.listen(port, '0.0.0.0');

  const base = `http://localhost:${port}`;
  console.log(`\n🚀 Server running at: ${base}`);
  console.log(`💓 Health:          ${base}/health`);
  if (!isProd) console.log(`📘 Swagger:         ${base}/docs`);
}

bootstrap();

