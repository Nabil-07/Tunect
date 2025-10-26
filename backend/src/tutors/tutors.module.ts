// src/tutors/tutors.module.ts
import { Module } from '@nestjs/common';
import { TutorsController } from './tutors.controller';
import { TutorsService } from './tutors.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [TutorsController],
  providers: [TutorsService, PrismaService],
  exports: [TutorsService],
})
export class TutorsModule {}
