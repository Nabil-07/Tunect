import { Module } from '@nestjs/common';
import { StudyMaterialsController } from './study-materials.controller';
import { StudyMaterialsService } from './study-materials.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [PrismaModule, CommonModule, UploadsModule],
  controllers: [StudyMaterialsController],
  providers: [StudyMaterialsService],
  exports: [StudyMaterialsService],
})
export class StudyMaterialsModule {}
