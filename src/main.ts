import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
//import * as cookieParser from 'cookie-parser';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';


async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.use(helmet());
  app.use(cookieParser());

  const origins = (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin, cb) => {
      if (!origin || origins.includes(origin)) return cb(null, true);
      return cb(new Error(`Origen no permitido: ${origin}`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'X-Skip-Auth',
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-Op-Key',        // para llaves de operación
      'X-CSRF-Token',    // si luego implementas CSRF
    ],
  });

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  console.log(`API corriendo en http://localhost:${port}`);
}
bootstrap();
