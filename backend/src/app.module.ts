import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { ResearchModule } from './modules/research/research.module';
import * as path from 'path';
import * as fs from 'fs';

const parentEnv = path.join(process.cwd(), '../.env');
const envFilePath = fs.existsSync(parentEnv) ? [parentEnv] : ['.env'];

@Module({
  imports: [
    // Global config — loads .env from project root dynamically
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath,
    }),

    // Database
    PrismaModule,

    // Feature modules
    HealthModule,
    ResearchModule,
  ],
})
export class AppModule {}
