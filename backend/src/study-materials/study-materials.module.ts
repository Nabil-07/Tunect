import { Module } from '@nestjs/common';
import { StudyMaterialsController } from './study-materials.controller';
import { StudyMaterialsService } from './study-materials.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [StudyMaterialsController],
  providers: [StudyMaterialsService],
  exports: [StudyMaterialsService],
})
export class StudyMaterialsModule {}
