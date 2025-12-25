import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import { ValidationPipe } from '@nestjs/common';
import * as bodyParser from 'body-parser';
import { PrismaService } from './prisma/prisma.service';
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import cookieParser from 'cookie-parser';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';


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

  // Serve static files for uploads
  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads',
  });

  app.enableCors({
    origin: ['http://localhost:5173', 'http://localhost:5174', 'https://tunectnow.com', 'https://test-tunectnow.com'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-timezone', 'X-Timezone'],
    credentials: false,
    maxAge: 86400,
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

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port, '0.0.0.0');

  const base = `http://localhost:${port}`;
  console.log(`\n🚀 Server running at: ${base}`);
  console.log(`💓 Health:          ${base}/health`);
  if (!isProd) console.log(`📘 Swagger:         ${base}/docs`);
}

bootstrap();
