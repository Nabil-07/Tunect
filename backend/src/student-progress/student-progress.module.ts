import { Module } from '@nestjs/common';
import { StudentProgressController } from './student-progress.controller';
import { StudentProgressService } from './student-progress.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [StudentProgressController],
  providers: [StudentProgressService],
  exports: [StudentProgressService],
})
export class StudentProgressModule {}
